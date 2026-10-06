import { DataSource, Repository, IsNull, QueryFailedError } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionTemplateStageEntity } from '../template-stage/production-template-stage.entity.js';
import { ProductionTemplateStageMaterialEntity } from './production-template-stage-material.entity.js';
import {
  InventoryProductReferenceService,
  inventoryProductReferenceService,
} from '../../inventory/product/inventory-product-reference.service.js';
import { AddTemplateStageMaterialDto } from './dto/add-stage-material.dto.js';
import { UpdateTemplateStageMaterialDto } from './dto/update-stage-material.dto.js';
import {
  ProductionTemplateStageMaterialDto,
  toStageMaterialDto,
} from './production-template-stage-material.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class ProductionTemplateStageMaterialService {
  private materialRepo: Repository<ProductionTemplateStageMaterialEntity>;
  private stageRepo: Repository<ProductionTemplateStageEntity>;
  private inventoryReferenceService: InventoryProductReferenceService;

  constructor(
    private dataSource: DataSource = AppDataSource,
    inventoryRefService: InventoryProductReferenceService = inventoryProductReferenceService
  ) {
    this.materialRepo = this.dataSource.getRepository(ProductionTemplateStageMaterialEntity);
    this.stageRepo = this.dataSource.getRepository(ProductionTemplateStageEntity);
    this.inventoryReferenceService = inventoryRefService;
  }

  async listStageMaterials(templateId: string, stageId: string): Promise<ProductionTemplateStageMaterialDto[]> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
    }

    const materials = await this.materialRepo.find({
      where: { stageId },
      relations: {
        product: true,
        productUnit: true,
      },
      order: { createdAt: 'ASC' },
    });

    return materials.map(toStageMaterialDto);
  }

  async addPlannedMaterial(
    templateId: string,
    stageId: string,
    dto: AddTemplateStageMaterialDto
  ): Promise<ProductionTemplateStageMaterialDto> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
    }

    // 1. Cross-module validation delegated to Inventory Reference Boundary
    await this.inventoryReferenceService.validatePlannedMaterialUnit(dto.productId, dto.productUnitId);

    // 2. Validate quantity > 0
    const qtyNum = parseFloat(dto.plannedQuantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      throw new BusinessRuleError(
        'الكمية المخططة يجب أن تكون أكبر من الصفر',
        'PRODUCTION_TEMPLATE_STAGE_MATERIAL_INVALID_QUANTITY'
      );
    }

    // 3. Pre-check for duplicate material unit on same stage
    const duplicate = await this.materialRepo.findOne({
      where: { stageId, productUnitId: dto.productUnitId },
    });
    if (duplicate) {
      throw new ConflictError(
        'تمت إضافة وحدة القياس هذه مسبقاً لهذه المرحلة',
        'PRODUCTION_TEMPLATE_STAGE_MATERIAL_ALREADY_EXISTS'
      );
    }

    const material = this.materialRepo.create({
      stageId,
      productId: dto.productId,
      productUnitId: dto.productUnitId,
      plannedQuantity: dto.plannedQuantity,
    });

    try {
      const saved = await this.materialRepo.save(material);
      const reloaded = await this.materialRepo.findOneOrFail({
        where: { id: saved.id },
        relations: {
          product: true,
          productUnit: true,
        },
      });
      return toStageMaterialDto(reloaded);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).driverError?.errno === 1062) {
        throw new ConflictError(
          'تمت إضافة وحدة القياس هذه مسبقاً لهذه المرحلة',
          'PRODUCTION_TEMPLATE_STAGE_MATERIAL_ALREADY_EXISTS'
        );
      }
      throw err;
    }
  }

  async updatePlannedMaterial(
    templateId: string,
    stageId: string,
    materialId: string,
    dto: UpdateTemplateStageMaterialDto
  ): Promise<ProductionTemplateStageMaterialDto> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
    }

    const material = await this.materialRepo.findOne({
      where: { id: materialId, stageId },
    });
    if (!material) {
      throw new NotFoundError('المادة المخططة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_MATERIAL_NOT_FOUND');
    }

    // If unit changed, validate via Inventory Reference Service
    if (dto.productUnitId !== undefined && dto.productUnitId !== material.productUnitId) {
      await this.inventoryReferenceService.validatePlannedMaterialUnit(material.productId, dto.productUnitId);

      const duplicate = await this.materialRepo.findOne({
        where: { stageId, productUnitId: dto.productUnitId },
      });
      if (duplicate && duplicate.id !== materialId) {
        throw new ConflictError(
          'تمت إضافة وحدة القياس هذه مسبقاً لهذه المرحلة',
          'PRODUCTION_TEMPLATE_STAGE_MATERIAL_ALREADY_EXISTS'
        );
      }
      material.productUnitId = dto.productUnitId;
    }

    const qtyNum = parseFloat(dto.plannedQuantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      throw new BusinessRuleError(
        'الكمية المخططة يجب أن تكون أكبر من الصفر',
        'PRODUCTION_TEMPLATE_STAGE_MATERIAL_INVALID_QUANTITY'
      );
    }
    material.plannedQuantity = dto.plannedQuantity;

    try {
      await this.materialRepo.save(material);
      const reloaded = await this.materialRepo.findOneOrFail({
        where: { id: materialId },
        relations: {
          product: true,
          productUnit: true,
        },
      });
      return toStageMaterialDto(reloaded);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).driverError?.errno === 1062) {
        throw new ConflictError(
          'تمت إضافة وحدة القياس هذه مسبقاً لهذه المرحلة',
          'PRODUCTION_TEMPLATE_STAGE_MATERIAL_ALREADY_EXISTS'
        );
      }
      throw err;
    }
  }

  async removePlannedMaterial(templateId: string, stageId: string, materialId: string): Promise<void> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
    }

    const material = await this.materialRepo.findOne({
      where: { id: materialId, stageId },
    });
    if (!material) {
      throw new NotFoundError('المادة المخططة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_MATERIAL_NOT_FOUND');
    }

    await this.materialRepo.delete(materialId);
  }
}

export const productionTemplateStageMaterialService = new ProductionTemplateStageMaterialService();
