import { DataSource, Repository, QueryFailedError } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { InventoryProductEntity } from './inventory-product.entity.js';
import { InventoryProductUnitEntity } from './inventory-product-unit.entity.js';
import { InventoryCategoryEntity } from '../category/inventory-category.entity.js';
import { CreateInventoryProductDto } from './dto/create-product.dto.js';
import { UpdateInventoryProductDto } from './dto/update-product.dto.js';
import { CreateInventoryProductUnitDto } from './dto/create-product-unit.dto.js';
import { UpdateInventoryProductUnitDto } from './dto/update-product-unit.dto.js';
import { ListInventoryProductsQueryDto } from './dto/list-products-query.dto.js';
import { ListInventoryProductUnitsQueryDto } from './dto/list-product-units-query.dto.js';
import { UnitSpecificationDto } from './dto/unit-specification.dto.js';
import {
  InventoryProductListItemDto,
  InventoryProductDetailDto,
  InventoryProductUnitDto,
  InventoryProductUnitSpecification,
  PaginatedProductsResult,
  PaginatedProductUnitsResult,
} from './inventory-product.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

function isProductOrUnitDuplicateKeyError(err: unknown): { isDup: boolean; constraint: string } {
  if (!err || typeof err !== 'object') {
    return { isDup: false, constraint: '' };
  }

  const e = err as {
    code?: string;
    errno?: number;
    message?: string;
    sqlMessage?: string;
    driverError?: { code?: string; errno?: number; message?: string; sqlMessage?: string };
  };

  const driverError = e.driverError;
  const code = driverError?.code || e.code;
  const errno = driverError?.errno || e.errno;
  const message = driverError?.sqlMessage || driverError?.message || e.sqlMessage || e.message || '';

  const isDup =
    code === 'ER_DUP_ENTRY' ||
    errno === 1062 ||
    (typeof message === 'string' && (message.includes('ER_DUP_ENTRY') || message.includes('Duplicate entry')));

  return { isDup, constraint: message };
}

export class InventoryProductService {
  private productRepository: Repository<InventoryProductEntity>;
  private unitRepository: Repository<InventoryProductUnitEntity>;
  private categoryRepository: Repository<InventoryCategoryEntity>;

  constructor(private dataSource: DataSource = AppDataSource) {
    this.productRepository = this.dataSource.getRepository(InventoryProductEntity);
    this.unitRepository = this.dataSource.getRepository(InventoryProductUnitEntity);
    this.categoryRepository = this.dataSource.getRepository(InventoryCategoryEntity);
  }

  /**
   * Asserts Base Unit integrity for a product (exists, non-deleted, belongs to same product).
   */
  private async assertProductBaseUnitIntegrity(
    product: InventoryProductEntity,
    unitRepo: Repository<InventoryProductUnitEntity>
  ): Promise<InventoryProductUnitEntity> {
    if (!product.baseUnitId) {
      throw new BusinessRuleError(
        'المنتج غير متسق ولا يملك وحدة أساسية',
        'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    }

    const baseUnit = await unitRepo.findOne({
      where: { id: product.baseUnitId },
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
   * Helper to validate specifications array:
   * - Max 50 items
   * - No duplicate specification names (case-insensitive, trimmed)
   * - Normalize empty unit to null
   */
  private validateSpecifications(
    specs?: UnitSpecificationDto[] | null
  ): InventoryProductUnitSpecification[] | null {
    if (!specs || specs.length === 0) {
      return null;
    }

    if (specs.length > 50) {
      throw new BusinessRuleError('لا يمكن إضافة أكثر من 50 مواصفة للوحدة', 'INVENTORY_PRODUCT_UNIT_DUPLICATE_SPECIFICATION');
    }

    const seenNames = new Set<string>();
    const sanitized: InventoryProductUnitSpecification[] = [];

    for (const spec of specs) {
      const name = spec.name.trim();
      const lowerName = name.toLowerCase();

      if (seenNames.has(lowerName)) {
        throw new BusinessRuleError(
          `اسم الخاصية "${name}" مكرر داخل نفس الوحدة`,
          'INVENTORY_PRODUCT_UNIT_DUPLICATE_SPECIFICATION'
        );
      }
      seenNames.add(lowerName);

      sanitized.push({
        name,
        value: spec.value.trim(),
        unit: spec.unit ? spec.unit.trim() : null,
      });
    }

    return sanitized;
  }

  /**
   * Lists products with pagination, search, category filter, and status filter.
   * Performs fail-closed validation on baseUnit integrity for all returned products.
   */
  async listProducts(query: ListInventoryProductsQueryDto): Promise<PaginatedProductsResult> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const qb = this.productRepository.createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.baseUnit', 'baseUnit')
      .where('p.deleted_at IS NULL');

    if (query.categoryId) {
      qb.andWhere('p.category_id = :categoryId', { categoryId: query.categoryId });
    }

    if (query.status === 'active') {
      qb.andWhere('p.is_active = 1');
    } else if (query.status === 'inactive') {
      qb.andWhere('p.is_active = 0');
    }

    if (query.search && query.search.trim() !== '') {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(p.name LIKE :term OR p.code LIKE :term OR p.location_name LIKE :term OR EXISTS (SELECT 1 FROM inventory_product_unit u WHERE u.product_id = p.id AND u.barcode LIKE :term AND u.deleted_at IS NULL))',
        { term }
      );
    }

    const total = await qb.getCount();

    const rawItems = await qb
      .addSelect((subQb) => {
        return subQb
          .select('COUNT(u2.id)', 'unit_count')
          .from(InventoryProductUnitEntity, 'u2')
          .where('u2.product_id = p.id')
          .andWhere('u2.deleted_at IS NULL');
      }, 'unit_count')
      .orderBy('p.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getRawAndEntities();

    const items: InventoryProductListItemDto[] = rawItems.entities.map((entity, index) => {
      if (
        !entity.baseUnitId ||
        !entity.baseUnit ||
        entity.baseUnit.deletedAt !== null ||
        entity.baseUnit.productId !== entity.id
      ) {
        throw new BusinessRuleError(
          'المنتج غير متسق (الوحدة الأساسية مفقودة أو غير صالحة)',
          'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
        );
      }

      const raw = rawItems.raw[index];
      const unitCount = parseInt(raw.unit_count || '0', 10);

      return {
        id: entity.id,
        name: entity.name,
        code: entity.code,
        categoryId: entity.categoryId,
        categoryName: entity.category ? entity.category.name : null,
        locationName: entity.locationName,
        baseUnitId: entity.baseUnitId,
        baseUnitName: entity.baseUnit.name,
        isActive: entity.isActive,
        unitCount,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Gets product details with fail-closed check on Base Unit integrity.
   */
  async getProductById(id: string): Promise<InventoryProductDetailDto> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: { category: true },
    });

    if (!product || product.deletedAt) {
      throw new NotFoundError('المنتج غير موجود', 'INVENTORY_PRODUCT_NOT_FOUND');
    }

    const baseUnit = await this.assertProductBaseUnitIntegrity(product, this.unitRepository);

    return {
      id: product.id,
      name: product.name,
      code: product.code,
      description: product.description,
      categoryId: product.categoryId,
      categoryName: product.category ? product.category.name : null,
      locationName: product.locationName,
      baseUnitId: baseUnit.id,
      baseUnitName: baseUnit.name,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      category: product.category
        ? {
            id: product.category.id,
            name: product.category.name,
            code: product.category.code,
          }
        : null,
      baseUnit: {
        id: baseUnit.id,
        name: baseUnit.name,
        barcode: baseUnit.barcode,
        price: baseUnit.price,
        specifications: baseUnit.specifications,
      },
    };
  }

  /**
   * Creates a product atomically with its Base Unit inside a transaction.
   */
  async createProduct(dto: CreateInventoryProductDto): Promise<InventoryProductDetailDto> {
    const normalizedCode = dto.code.trim().toUpperCase();

    // Pre-check code uniqueness globally including soft-deleted products
    const existingCode = await this.productRepository.findOne({
      where: { code: normalizedCode },
      withDeleted: true,
    });

    if (existingCode) {
      throw new ConflictError('رمز المنتج مستخدم بالفعل', 'INVENTORY_PRODUCT_CODE_ALREADY_EXISTS');
    }

    // Pre-check base unit barcode uniqueness globally if provided
    const baseUnitBarcode = dto.baseUnit.barcode ? dto.baseUnit.barcode.trim() : null;
    if (baseUnitBarcode) {
      const existingBarcode = await this.unitRepository.findOne({
        where: { barcode: baseUnitBarcode },
        withDeleted: true,
      });

      if (existingBarcode) {
        throw new ConflictError('الباركود مستخدم بالفعل', 'INVENTORY_PRODUCT_UNIT_BARCODE_ALREADY_EXISTS');
      }
    }

    const validatedBaseSpecs = this.validateSpecifications(dto.baseUnit.specifications);
    const isActive = dto.isActive !== undefined ? dto.isActive : true;

    try {
      return await this.dataSource.transaction(async (manager) => {
        const productRepo = manager.getRepository(InventoryProductEntity);
        const unitRepo = manager.getRepository(InventoryProductUnitEntity);
        const categoryRepo = manager.getRepository(InventoryCategoryEntity);

        let category: InventoryCategoryEntity | null = null;
        if (dto.categoryId) {
          category = await categoryRepo.findOne({
            where: { id: dto.categoryId },
            lock: { mode: 'pessimistic_write' },
          });

          if (!category || category.deletedAt) {
            throw new NotFoundError('فئة المنتج غير موجودة', 'INVENTORY_PRODUCT_CATEGORY_NOT_FOUND');
          }

          if (isActive && !category.isActive) {
            throw new BusinessRuleError('لا يمكن إنشاء منتج نشط يتبع لفئة معطلة', 'INVENTORY_PRODUCT_CATEGORY_INACTIVE');
          }
        }

        // Step 1: Insert product with base_unit_id = null
        const product = productRepo.create({
          name: dto.name.trim(),
          code: normalizedCode,
          description: dto.description ? dto.description.trim() : null,
          categoryId: category ? category.id : null,
          locationName: dto.locationName ? dto.locationName.trim() : null,
          baseUnitId: null,
          isActive,
        });

        const savedProduct = await productRepo.save(product);

        // Step 2: Insert Base Unit
        const baseUnit = unitRepo.create({
          productId: savedProduct.id,
          name: dto.baseUnit.name.trim(),
          barcode: baseUnitBarcode,
          price: dto.baseUnit.price,
          equivalentToUnitId: null,
          conversionQuantity: null,
          specifications: validatedBaseSpecs,
        });

        const savedBaseUnit = await unitRepo.save(baseUnit);

        // Step 3: Link base_unit_id to product
        savedProduct.baseUnitId = savedBaseUnit.id;
        await productRepo.save(savedProduct);

        return {
          id: savedProduct.id,
          name: savedProduct.name,
          code: savedProduct.code,
          description: savedProduct.description,
          categoryId: savedProduct.categoryId,
          categoryName: category ? category.name : null,
          locationName: savedProduct.locationName,
          baseUnitId: savedBaseUnit.id,
          baseUnitName: savedBaseUnit.name,
          isActive: savedProduct.isActive,
          createdAt: savedProduct.createdAt,
          updatedAt: savedProduct.updatedAt,
          category: category
            ? {
                id: category.id,
                name: category.name,
                code: category.code,
              }
            : null,
          baseUnit: {
            id: savedBaseUnit.id,
            name: savedBaseUnit.name,
            barcode: savedBaseUnit.barcode,
            price: savedBaseUnit.price,
            specifications: savedBaseUnit.specifications,
          },
        };
      });
    } catch (err) {
      const dup = isProductOrUnitDuplicateKeyError(err);
      if (dup.isDup) {
        if (dup.constraint.includes('UQ_inventory_product_unit_barcode') || dup.constraint.includes('barcode')) {
          throw new ConflictError('الباركود مستخدم بالفعل', 'INVENTORY_PRODUCT_UNIT_BARCODE_ALREADY_EXISTS');
        }
        if (dup.constraint.includes('UQ_inventory_product_code') || dup.constraint.includes('code')) {
          throw new ConflictError('رمز المنتج مستخدم بالفعل', 'INVENTORY_PRODUCT_CODE_ALREADY_EXISTS');
        }
        throw new ConflictError('رمز المنتج مستخدم بالفعل', 'INVENTORY_PRODUCT_CODE_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  /**
   * Updates product details (name, description, locationName, categoryId, isActive).
   * Note: code is immutable.
   */
  async updateProduct(id: string, dto: UpdateInventoryProductDto): Promise<InventoryProductDetailDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const productRepo = manager.getRepository(InventoryProductEntity);
        const categoryRepo = manager.getRepository(InventoryCategoryEntity);
        const unitRepo = manager.getRepository(InventoryProductUnitEntity);

        // Lock Product row as lock root
        const product = await productRepo.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
          relations: { category: true },
        });

        if (!product || product.deletedAt) {
          throw new NotFoundError('المنتج غير موجود', 'INVENTORY_PRODUCT_NOT_FOUND');
        }

        const effectiveIsActive = dto.isActive !== undefined ? dto.isActive : product.isActive;

        // Category validation
        if (dto.categoryId !== undefined) {
          if (dto.categoryId !== null) {
            const category = await categoryRepo.findOne({
              where: { id: dto.categoryId },
              lock: { mode: 'pessimistic_write' },
            });

            if (!category || category.deletedAt) {
              throw new NotFoundError('فئة المنتج غير موجودة', 'INVENTORY_PRODUCT_CATEGORY_NOT_FOUND');
            }

            if (effectiveIsActive && !category.isActive) {
              throw new BusinessRuleError('لا يمكن ربط منتج نشط بفئة معطلة', 'INVENTORY_PRODUCT_CATEGORY_INACTIVE');
            }

            product.categoryId = category.id;
          } else {
            product.categoryId = null;
          }
        } else if (dto.isActive === true && product.categoryId) {
          // If activating and category exists, verify category is active
          const currentCategory = await categoryRepo.findOne({
            where: { id: product.categoryId },
            lock: { mode: 'pessimistic_write' },
          });

          if (!currentCategory || currentCategory.deletedAt || !currentCategory.isActive) {
            throw new BusinessRuleError('لا يمكن تفعيل منتج يتبع لفئة معطلة', 'INVENTORY_PRODUCT_CATEGORY_INACTIVE');
          }
        }

        if (dto.name !== undefined) {
          product.name = dto.name.trim();
        }

        if (dto.description !== undefined) {
          product.description = dto.description ? dto.description.trim() : null;
        }

        if (dto.locationName !== undefined) {
          product.locationName = dto.locationName ? dto.locationName.trim() : null;
        }

        if (dto.isActive !== undefined) {
          product.isActive = dto.isActive;
        }

        await productRepo.save(product);

        // Verify Base Unit integrity
        const baseUnit = await this.assertProductBaseUnitIntegrity(product, unitRepo);

        const updatedCategory = product.categoryId
          ? await categoryRepo.findOne({ where: { id: product.categoryId } })
          : null;

        return {
          id: product.id,
          name: product.name,
          code: product.code,
          description: product.description,
          categoryId: product.categoryId,
          categoryName: updatedCategory ? updatedCategory.name : null,
          locationName: product.locationName,
          baseUnitId: baseUnit.id,
          baseUnitName: baseUnit.name,
          isActive: product.isActive,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          category: updatedCategory
            ? {
                id: updatedCategory.id,
                name: updatedCategory.name,
                code: updatedCategory.code,
              }
            : null,
          baseUnit: {
            id: baseUnit.id,
            name: baseUnit.name,
            barcode: baseUnit.barcode,
            price: baseUnit.price,
            specifications: baseUnit.specifications,
          },
        };
      });
    } catch (err) {
      const dup = isProductOrUnitDuplicateKeyError(err);
      if (dup.isDup) {
        if (dup.constraint.includes('UQ_inventory_product_code') || dup.constraint.includes('code')) {
          throw new ConflictError('رمز المنتج مستخدم بالفعل', 'INVENTORY_PRODUCT_CODE_ALREADY_EXISTS');
        }
        throw new ConflictError('رمز المنتج مستخدم بالفعل', 'INVENTORY_PRODUCT_CODE_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  /**
   * Soft deletes (archives) a product. Units are retained for historical integrity.
   */
  async softDeleteProduct(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const productRepo = manager.getRepository(InventoryProductEntity);

      const product = await productRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!product || product.deletedAt) {
        throw new NotFoundError('المنتج غير موجود', 'INVENTORY_PRODUCT_NOT_FOUND');
      }

      product.deletedAt = new Date();
      product.isActive = false;

      await productRepo.save(product);
    });
  }

  /**
   * Lists units of a product (paginated), with Base Unit appearing first.
   */
  async listUnits(productId: string, query: ListInventoryProductUnitsQueryDto): Promise<PaginatedProductUnitsResult> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product || product.deletedAt) {
      throw new NotFoundError('المنتج غير موجود', 'INVENTORY_PRODUCT_NOT_FOUND');
    }

    await this.assertProductBaseUnitIntegrity(product, this.unitRepository);

    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 50));
    const skip = (page - 1) * limit;

    const qb = this.unitRepository.createQueryBuilder('u')
      .leftJoinAndSelect('u.equivalentToUnit', 'eq')
      .where('u.product_id = :productId', { productId })
      .andWhere('u.deleted_at IS NULL');

    const total = await qb.getCount();

    const units = await qb
      .addOrderBy(`CASE WHEN u.id = :baseUnitId THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy('u.created_at', 'ASC')
      .setParameter('baseUnitId', product.baseUnitId || '')
      .skip(skip)
      .take(limit)
      .getMany();

    const items: InventoryProductUnitDto[] = units.map((u) => ({
      id: u.id,
      productId: u.productId,
      name: u.name,
      barcode: u.barcode,
      price: u.price,
      isBase: u.id === product.baseUnitId,
      equivalentToUnitId: u.equivalentToUnitId,
      equivalentToUnitName: u.equivalentToUnit ? u.equivalentToUnit.name : null,
      conversionQuantity: u.conversionQuantity,
      specifications: u.specifications,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Adds an additional (non-base) unit to a product.
   * Lock order: Product (pessimistic_write) -> Unit rows.
   */
  async createUnit(productId: string, dto: CreateInventoryProductUnitDto): Promise<InventoryProductUnitDto> {
    const normalizedName = dto.name.trim();
    const barcode = dto.barcode ? dto.barcode.trim() : null;

    try {
      return await this.dataSource.transaction(async (manager) => {
        const productRepo = manager.getRepository(InventoryProductEntity);
        const unitRepo = manager.getRepository(InventoryProductUnitEntity);

        // Lock Product row as Root Lock
        const product = await productRepo.findOne({
          where: { id: productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!product || product.deletedAt) {
          throw new NotFoundError('المنتج غير موجود', 'INVENTORY_PRODUCT_NOT_FOUND');
        }

        const baseUnit = await this.assertProductBaseUnitIntegrity(product, unitRepo);

        // Check unit name uniqueness within this product including soft deleted
        const existingName = await unitRepo.findOne({
          where: { productId, name: normalizedName },
          withDeleted: true,
        });

        if (existingName) {
          throw new ConflictError(
            'اسم الوحدة مستخدم بالفعل داخل هذا المنتج',
            'INVENTORY_PRODUCT_UNIT_NAME_ALREADY_EXISTS'
          );
        }

        // Check barcode uniqueness globally including soft deleted
        if (barcode) {
          const existingBarcode = await unitRepo.findOne({
            where: { barcode },
            withDeleted: true,
          });

          if (existingBarcode) {
            throw new ConflictError(
              'الباركود مستخدم بالفعل',
              'INVENTORY_PRODUCT_UNIT_BARCODE_ALREADY_EXISTS'
            );
          }
        }

        // Validate equivalentToUnitId
        const equivalentUnit = await unitRepo.findOne({
          where: { id: dto.equivalentToUnitId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!equivalentUnit || equivalentUnit.deletedAt) {
          throw new NotFoundError('الوحدة المقابلة غير موجودة', 'INVENTORY_PRODUCT_UNIT_REFERENCE_NOT_FOUND');
        }

        if (equivalentUnit.productId !== productId) {
          throw new BusinessRuleError(
            'الوحدة المقابلة يجب أن تتبع لنفس المنتج',
            'INVENTORY_PRODUCT_UNIT_REFERENCE_OUTSIDE_PRODUCT'
          );
        }

        // Cycle & Chain check: traverse equivalentTo chain until reaching Base Unit
        let currId: string | null = equivalentUnit.id;
        let reachedBase = false;
        const visited = new Set<string>();

        while (currId) {
          if (currId === baseUnit.id) {
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

          const currUnit: InventoryProductUnitEntity | null = await unitRepo.findOne({
            where: { id: currId },
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

        const validatedSpecs = this.validateSpecifications(dto.specifications);

        const unit = unitRepo.create({
          productId,
          name: normalizedName,
          barcode,
          price: dto.price,
          equivalentToUnitId: equivalentUnit.id,
          conversionQuantity: dto.conversionQuantity,
          specifications: validatedSpecs,
        });

        const savedUnit = await unitRepo.save(unit);

        return {
          id: savedUnit.id,
          productId: savedUnit.productId,
          name: savedUnit.name,
          barcode: savedUnit.barcode,
          price: savedUnit.price,
          isBase: false,
          equivalentToUnitId: savedUnit.equivalentToUnitId,
          equivalentToUnitName: equivalentUnit.name,
          conversionQuantity: savedUnit.conversionQuantity,
          specifications: savedUnit.specifications,
          createdAt: savedUnit.createdAt,
          updatedAt: savedUnit.updatedAt,
        };
      });
    } catch (err) {
      const dup = isProductOrUnitDuplicateKeyError(err);
      if (dup.isDup) {
        if (dup.constraint.includes('UQ_inventory_product_unit_barcode') || dup.constraint.includes('barcode')) {
          throw new ConflictError('الباركود مستخدم بالفعل', 'INVENTORY_PRODUCT_UNIT_BARCODE_ALREADY_EXISTS');
        }
        if (
          dup.constraint.includes('UQ_inventory_product_unit_product_name') ||
          dup.constraint.includes('product_id') ||
          dup.constraint.includes('name')
        ) {
          throw new ConflictError(
            'اسم الوحدة مستخدم بالفعل داخل هذا المنتج',
            'INVENTORY_PRODUCT_UNIT_NAME_ALREADY_EXISTS'
          );
        }
        throw new ConflictError('اسم الوحدة مستخدم بالفعل داخل هذا المنتج', 'INVENTORY_PRODUCT_UNIT_NAME_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  /**
   * Updates an existing unit.
   * If target is Base Unit: conversion mutation is strictly forbidden.
   * Lock order: Product (pessimistic_write) -> Unit (pessimistic_write).
   */
  async updateUnit(
    productId: string,
    unitId: string,
    dto: UpdateInventoryProductUnitDto
  ): Promise<InventoryProductUnitDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const productRepo = manager.getRepository(InventoryProductEntity);
        const unitRepo = manager.getRepository(InventoryProductUnitEntity);

        // Lock Product row as Root Lock
        const product = await productRepo.findOne({
          where: { id: productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!product || product.deletedAt) {
          throw new NotFoundError('المنتج غير موجود', 'INVENTORY_PRODUCT_NOT_FOUND');
        }

        const baseUnit = await this.assertProductBaseUnitIntegrity(product, unitRepo);

        // Lock target Unit
        const unit = await unitRepo.findOne({
          where: { id: unitId },
          lock: { mode: 'pessimistic_write' },
          relations: { equivalentToUnit: true },
        });

        if (!unit || unit.deletedAt || unit.productId !== productId) {
          throw new NotFoundError('الوحدة غير موجودة', 'INVENTORY_PRODUCT_UNIT_NOT_FOUND');
        }

        const isBase = unit.id === baseUnit.id;

        // Base unit conversion immutability
        if (isBase) {
          if (dto.equivalentToUnitId !== undefined || dto.conversionQuantity !== undefined) {
            throw new BusinessRuleError(
              'لا يمكن تعديل معادلة أو تحويل الوحدة الأساسية للمنتج',
              'INVENTORY_PRODUCT_BASE_UNIT_CONVERSION_IMMUTABLE'
            );
          }
        }

        // Non-base unit conversion validation
        if (!isBase && dto.equivalentToUnitId !== undefined) {
          if (dto.equivalentToUnitId === null) {
            throw new BusinessRuleError(
              'الوحدات الإضافية يجب أن ترتبط بوحدة مقابلة',
              'INVENTORY_PRODUCT_UNIT_CONVERSION_INCONSISTENT'
            );
          }

          if (dto.equivalentToUnitId === unitId) {
            throw new BusinessRuleError(
              'لا يمكن للوحدة أن تعادل نفسها (حلقة دائرية)',
              'INVENTORY_PRODUCT_UNIT_CONVERSION_CYCLE'
            );
          }

          const proposedEquivalent = await unitRepo.findOne({
            where: { id: dto.equivalentToUnitId },
            lock: { mode: 'pessimistic_write' },
          });

          if (!proposedEquivalent || proposedEquivalent.deletedAt) {
            throw new NotFoundError('الوحدة المقابلة غير موجودة', 'INVENTORY_PRODUCT_UNIT_REFERENCE_NOT_FOUND');
          }

          if (proposedEquivalent.productId !== productId) {
            throw new BusinessRuleError(
              'الوحدة المقابلة يجب أن تتبع لنفس المنتج',
              'INVENTORY_PRODUCT_UNIT_REFERENCE_OUTSIDE_PRODUCT'
            );
          }

          // Traverse proposed equivalent ancestry to check for cycles and termination at Base Unit
          let currId: string | null = proposedEquivalent.id;
          let reachedBase = false;
          const visited = new Set<string>();

          while (currId) {
            if (currId === unitId) {
              throw new BusinessRuleError(
                'تعيين هذه الوحدة المقابلة يؤدي إلى حلقة دائرية',
                'INVENTORY_PRODUCT_UNIT_CONVERSION_CYCLE'
              );
            }

            if (currId === baseUnit.id) {
              reachedBase = true;
              break;
            }

            if (visited.has(currId)) {
              throw new BusinessRuleError(
                'سلسلة التحويل تحتوي على حلقة دائرية غير متسقة',
                'INVENTORY_PRODUCT_UNIT_CONVERSION_CYCLE'
              );
            }
            visited.add(currId);

            const currUnit: InventoryProductUnitEntity | null = await unitRepo.findOne({
              where: { id: currId },
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

          unit.equivalentToUnitId = proposedEquivalent.id;
        }

        if (!isBase && dto.conversionQuantity !== undefined) {
          unit.conversionQuantity = dto.conversionQuantity;
        }

        // Name uniqueness check within product
        if (dto.name !== undefined) {
          const normalizedName = dto.name.trim();
          if (normalizedName !== unit.name) {
            const existingName = await unitRepo.findOne({
              where: { productId, name: normalizedName },
              withDeleted: true,
            });

            if (existingName && existingName.id !== unitId) {
              throw new ConflictError(
                'اسم الوحدة مستخدم بالفعل داخل هذا المنتج',
                'INVENTORY_PRODUCT_UNIT_NAME_ALREADY_EXISTS'
              );
            }
            unit.name = normalizedName;
          }
        }

        // Barcode uniqueness check globally
        if (dto.barcode !== undefined) {
          const barcode = dto.barcode ? dto.barcode.trim() : null;
          if (barcode !== unit.barcode) {
            if (barcode) {
              const existingBarcode = await unitRepo.findOne({
                where: { barcode },
                withDeleted: true,
              });

              if (existingBarcode && existingBarcode.id !== unitId) {
                throw new ConflictError(
                  'الباركود مستخدم بالفعل',
                  'INVENTORY_PRODUCT_UNIT_BARCODE_ALREADY_EXISTS'
                );
              }
            }
            unit.barcode = barcode;
          }
        }

        if (dto.price !== undefined) {
          unit.price = dto.price;
        }

        if (dto.specifications !== undefined) {
          unit.specifications = this.validateSpecifications(dto.specifications);
        }

        const savedUnit = await unitRepo.save(unit);

        const equivalentName = savedUnit.equivalentToUnitId
          ? (await unitRepo.findOne({ where: { id: savedUnit.equivalentToUnitId } }))?.name || null
          : null;

        return {
          id: savedUnit.id,
          productId: savedUnit.productId,
          name: savedUnit.name,
          barcode: savedUnit.barcode,
          price: savedUnit.price,
          isBase,
          equivalentToUnitId: savedUnit.equivalentToUnitId,
          equivalentToUnitName: equivalentName,
          conversionQuantity: savedUnit.conversionQuantity,
          specifications: savedUnit.specifications,
          createdAt: savedUnit.createdAt,
          updatedAt: savedUnit.updatedAt,
        };
      });
    } catch (err) {
      const dup = isProductOrUnitDuplicateKeyError(err);
      if (dup.isDup) {
        if (dup.constraint.includes('UQ_inventory_product_unit_barcode') || dup.constraint.includes('barcode')) {
          throw new ConflictError('الباركود مستخدم بالفعل', 'INVENTORY_PRODUCT_UNIT_BARCODE_ALREADY_EXISTS');
        }
        if (
          dup.constraint.includes('UQ_inventory_product_unit_product_name') ||
          dup.constraint.includes('product_id') ||
          dup.constraint.includes('name')
        ) {
          throw new ConflictError(
            'اسم الوحدة مستخدم بالفعل داخل هذا المنتج',
            'INVENTORY_PRODUCT_UNIT_NAME_ALREADY_EXISTS'
          );
        }
        throw new ConflictError('اسم الوحدة مستخدم بالفعل داخل هذا المنتج', 'INVENTORY_PRODUCT_UNIT_NAME_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  /**
   * Soft deletes (archives) a non-base unit.
   * Base Unit cannot be deleted.
   * Reject if any non-deleted unit references this unit as equivalentToUnitId.
   */
  async softDeleteUnit(productId: string, unitId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const productRepo = manager.getRepository(InventoryProductEntity);
      const unitRepo = manager.getRepository(InventoryProductUnitEntity);

      // Lock Product row as Root Lock
      const product = await productRepo.findOne({
        where: { id: productId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!product || product.deletedAt) {
        throw new NotFoundError('المنتج غير موجود', 'INVENTORY_PRODUCT_NOT_FOUND');
      }

      const baseUnit = await this.assertProductBaseUnitIntegrity(product, unitRepo);

      // Lock target Unit
      const unit = await unitRepo.findOne({
        where: { id: unitId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!unit || unit.deletedAt || unit.productId !== productId) {
        throw new NotFoundError('الوحدة غير موجودة', 'INVENTORY_PRODUCT_UNIT_NOT_FOUND');
      }

      // Reject Base Unit deletion
      if (unit.id === baseUnit.id) {
        throw new BusinessRuleError(
          'لا يمكن حذف الوحدة الأساسية للمنتج',
          'INVENTORY_PRODUCT_BASE_UNIT_CANNOT_BE_DELETED'
        );
      }

      // Check if any other non-deleted unit references this unit
      const dependentCount = await unitRepo.count({
        where: {
          productId,
          equivalentToUnitId: unitId,
        },
      });

      if (dependentCount > 0) {
        throw new BusinessRuleError(
          'لا يمكن حذف هذه الوحدة لوجود وحدات أخرى معتمدة عليها في التحويل',
          'INVENTORY_PRODUCT_UNIT_HAS_DEPENDENTS'
        );
      }

      unit.deletedAt = new Date();
      await unitRepo.save(unit);
    });
  }
}

export const inventoryProductService = new InventoryProductService();
