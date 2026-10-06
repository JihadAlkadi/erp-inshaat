import { DataSource, Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { InventoryProductEntity } from './inventory-product.entity.js';
import { InventoryProductUnitEntity } from './inventory-product-unit.entity.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export interface ProductReferenceItem {
  id: string;
  name: string;
  code: string;
}

export interface UnitReferenceItem {
  id: string;
  name: string;
  isBase: boolean;
}

export interface PaginatedProductReferencesResult {
  items: ProductReferenceItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ValidatedPlannedMaterialReference {
  product: ProductReferenceItem;
  unit: UnitReferenceItem;
}

export class InventoryProductReferenceService {
  private readonly productRepository: Repository<InventoryProductEntity>;
  private readonly unitRepository: Repository<InventoryProductUnitEntity>;

  constructor(
    dataSource: DataSource = AppDataSource,
    productRepo?: Repository<InventoryProductEntity>,
    unitRepo?: Repository<InventoryProductUnitEntity>
  ) {
    this.productRepository = productRepo || dataSource.getRepository(InventoryProductEntity);
    this.unitRepository = unitRepo || dataSource.getRepository(InventoryProductUnitEntity);
  }

  /**
   * Search / list active products for selection in production templates.
   * Returns minimal reference DTO only (no prices, no barcodes, no specs).
   */
  async searchProductReferences(
    search?: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedProductReferencesResult> {
    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.max(1, Math.min(100, limit || 20));
    const skip = (safePage - 1) * safeLimit;

    const qb = this.productRepository
      .createQueryBuilder('p')
      .where('p.deleted_at IS NULL')
      .andWhere('p.is_active = :isActive', { isActive: true });

    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      qb.andWhere('(p.name LIKE :term OR p.code LIKE :term)', { term });
    }

    const total = await qb.getCount();

    const products = await qb
      .select(['p.id', 'p.name', 'p.code'])
      .orderBy('p.name', 'ASC')
      .skip(skip)
      .take(safeLimit)
      .getMany();

    const items: ProductReferenceItem[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
    }));

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 1,
    };
  }

  /**
   * Get active units for a specific product.
   * Returns minimal reference DTO only ({ id, name, isBase }).
   * Fails closed if the product is missing, inactive, or has corrupt Base Unit integrity.
   */
  async getProductUnitReferences(productId: string): Promise<UnitReferenceItem[]> {
    const product = await this.productRepository.findOne({
      where: { id: productId, deletedAt: IsNull() },
    });

    if (!product) {
      throw new NotFoundError('المنتج المحدد غير موجود', 'INVENTORY_PRODUCT_NOT_FOUND');
    }

    if (!product.isActive) {
      throw new BusinessRuleError('المنتج المحدد معطل', 'INVENTORY_PRODUCT_INACTIVE');
    }

    // Verify Base Unit integrity
    await this.assertProductBaseUnitIntegrity(product);

    const units = await this.unitRepository.find({
      where: { productId, deletedAt: IsNull() },
      select: { id: true, name: true },
      order: { createdAt: 'ASC' },
    });

    return units.map((u) => ({
      id: u.id,
      name: u.name,
      isBase: u.id === product.baseUnitId,
    }));
  }

  /**
   * Validates that a Product and a ProductUnit can be safely referenced as Planned Material.
   * Enforces:
   * 1. Product exists, active, non-archived.
   * 2. Product has valid, active, non-archived Base Unit belonging to it.
   * 3. Selected Unit exists, non-archived, belongs to the Product.
   * 4. If Selected Unit is not Base Unit, its conversion chain terminates at Base Unit and has no cycles.
   * Fails closed on any inconsistency.
   */
  async validatePlannedMaterialUnit(
    productId: string,
    productUnitId: string
  ): Promise<ValidatedPlannedMaterialReference> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      withDeleted: true,
    });

    if (!product || product.deletedAt) {
      throw new NotFoundError('المنتج المحدد غير موجود', 'INVENTORY_PRODUCT_NOT_FOUND');
    }

    if (!product.isActive) {
      throw new BusinessRuleError('المنتج المحدد معطل', 'INVENTORY_PRODUCT_INACTIVE');
    }

    // 1. Assert Base Unit integrity
    const baseUnit = await this.assertProductBaseUnitIntegrity(product);

    // 2. Assert Selected Unit integrity
    const selectedUnit = await this.unitRepository.findOne({
      where: { id: productUnitId },
      withDeleted: true,
    });

    if (!selectedUnit) {
      throw new NotFoundError('وحدة القياس المحددة غير موجودة', 'INVENTORY_PRODUCT_UNIT_NOT_FOUND');
    }

    if (selectedUnit.deletedAt) {
      throw new BusinessRuleError('وحدة القياس المحددة مؤرشفة', 'INVENTORY_PRODUCT_UNIT_ARCHIVED');
    }

    if (selectedUnit.productId !== productId) {
      throw new BusinessRuleError(
        'وحدة القياس المحددة لا تنتمي إلى هذا المنتج',
        'INVENTORY_PRODUCT_UNIT_NOT_BELONG_TO_PRODUCT'
      );
    }

    // 3. Conversion chain validation if selectedUnit is not baseUnit
    if (selectedUnit.id !== baseUnit.id) {
      await this.assertConversionChainIntegrity(productId, selectedUnit, baseUnit.id);
    }

    return {
      product: {
        id: product.id,
        name: product.name,
        code: product.code,
      },
      unit: {
        id: selectedUnit.id,
        name: selectedUnit.name,
        isBase: selectedUnit.id === baseUnit.id,
      },
    };
  }

  /**
   * Verifies product has a valid, existing, non-deleted Base Unit belonging to it.
   */
  private async assertProductBaseUnitIntegrity(
    product: InventoryProductEntity
  ): Promise<InventoryProductUnitEntity> {
    if (!product.baseUnitId) {
      throw new BusinessRuleError(
        'المنتج غير متسق ولا يملك وحدة أساسية',
        'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    }

    const baseUnit = await this.unitRepository.findOne({
      where: { id: product.baseUnitId },
      withDeleted: true,
    });

    if (!baseUnit || baseUnit.deletedAt || baseUnit.productId !== product.id) {
      throw new BusinessRuleError(
        'المنتج غير متسق (الوحدة الأساسية مفقودة أو غير صالحة)',
        'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    }

    return baseUnit;
  }

  /**
   * Verifies that the conversion chain of a non-base unit traverses to baseUnit without cycles or corrupt references.
   */
  private async assertConversionChainIntegrity(
    productId: string,
    startUnit: InventoryProductUnitEntity,
    baseUnitId: string
  ): Promise<void> {
    let currId: string | null = startUnit.equivalentToUnitId;
    let reachedBase = false;
    const visited = new Set<string>([startUnit.id]);

    while (currId) {
      if (currId === baseUnitId) {
        reachedBase = true;
        break;
      }

      if (visited.has(currId)) {
        throw new BusinessRuleError(
          'سلسلة التحويل الحالية تحتوي على تكرار أو حلقة دائرية غير متسقة',
          'INVENTORY_PRODUCT_UNIT_CONVERSION_CYCLE'
        );
      }
      visited.add(currId);

      const currUnit = await this.unitRepository.findOne({
        where: { id: currId },
        withDeleted: true,
      });

      if (!currUnit || currUnit.deletedAt || currUnit.productId !== productId) {
        throw new BusinessRuleError(
          'سلسلة تحويل الوحدات غير متسقة',
          'INVENTORY_PRODUCT_UNIT_CONVERSION_INCONSISTENT'
        );
      }

      currId = currUnit.equivalentToUnitId;
    }

    if (!reachedBase) {
      throw new BusinessRuleError(
        'سلسلة تحويل الوحدات يجب أن تنتهي بالوحدة الأساسية للمنتج',
        'INVENTORY_PRODUCT_UNIT_CONVERSION_INCONSISTENT'
      );
    }
  }
}

export const inventoryProductReferenceService = new InventoryProductReferenceService();
