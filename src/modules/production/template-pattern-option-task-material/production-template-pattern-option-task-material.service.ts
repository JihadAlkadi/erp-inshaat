import { DataSource, Repository, QueryFailedError } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionTemplatePatternOptionTaskMaterialEntity } from './production-template-pattern-option-task-material.entity.js';
import {
  InventoryProductReferenceService,
  inventoryProductReferenceService,
} from '../../inventory/product/inventory-product-reference.service.js';
import {
  ProductionTemplateGuardService,
  productionTemplateGuardService,
} from '../template/production-template-guard.service.js';
import { AddTemplatePatternOptionTaskMaterialDto } from './dto/add-task-material.dto.js';
import { UpdateTemplatePatternOptionTaskMaterialDto } from './dto/update-task-material.dto.js';
import {
  ProductionTemplatePatternOptionTaskMaterialDto,
  toPatternOptionTaskMaterialDto,
} from './production-template-pattern-option-task-material.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class ProductionTemplatePatternOptionTaskMaterialService {
  private materialRepo: Repository<ProductionTemplatePatternOptionTaskMaterialEntity>;
  private inventoryReferenceService: InventoryProductReferenceService;
  private guardService: ProductionTemplateGuardService;

  constructor(
    private dataSource: DataSource = AppDataSource,
    inventoryRefService: InventoryProductReferenceService = inventoryProductReferenceService,
    guardService: ProductionTemplateGuardService = productionTemplateGuardService
  ) {
    this.materialRepo = this.dataSource.getRepository(ProductionTemplatePatternOptionTaskMaterialEntity);
    this.inventoryReferenceService = inventoryRefService;
    this.guardService = guardService;
  }

  async listTaskMaterials(
    templateId: string,
    patternId: string,
    optionId: string,
    taskId: string
  ): Promise<ProductionTemplatePatternOptionTaskMaterialDto[]> {
    await this.guardService.requireTaskBelongsToOption(
      templateId,
      patternId,
      optionId,
      taskId
    );

    const materials = await this.materialRepo.find({
      where: { taskId },
      relations: {
        product: true,
        productUnit: true,
      },
      order: { createdAt: 'ASC' },
    });

    return materials.map(toPatternOptionTaskMaterialDto);
  }

  async addTaskMaterial(
    templateId: string,
    patternId: string,
    optionId: string,
    taskId: string,
    dto: AddTemplatePatternOptionTaskMaterialDto
  ): Promise<ProductionTemplatePatternOptionTaskMaterialDto> {
    // 1. Cross-module boundary validation
    await this.inventoryReferenceService.validatePlannedMaterialUnit(dto.productId, dto.productUnitId);

    // 2. Quantity check
    const qtyNum = parseFloat(dto.plannedQuantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      throw new BusinessRuleError(
        'الكمية المخططة يجب أن تكون أكبر من الصفر',
        'PRODUCTION_TEMPLATE_PATTERN_TASK_MATERIAL_INVALID_QUANTITY'
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      // 3. Lock parent template
      await this.guardService.lockMutableTemplate(templateId, manager);

      // 4. Verify task ownership chain
      await this.guardService.requireTaskBelongsToOption(
        templateId,
        patternId,
        optionId,
        taskId,
        manager
      );

      // 5. Duplicate check under lock
      const duplicate = await manager.findOne(ProductionTemplatePatternOptionTaskMaterialEntity, {
        where: { taskId, productUnitId: dto.productUnitId },
      });
      if (duplicate) {
        throw new ConflictError(
          'تمت إضافة وحدة القياس هذه مسبقاً لهذه المهمة',
          'PRODUCTION_TEMPLATE_PATTERN_TASK_MATERIAL_ALREADY_EXISTS'
        );
      }

      const material = manager.create(ProductionTemplatePatternOptionTaskMaterialEntity, {
        taskId,
        productId: dto.productId,
        productUnitId: dto.productUnitId,
        plannedQuantity: dto.plannedQuantity,
      });

      try {
        const saved = await manager.save(material);
        const reloaded = await manager.findOneOrFail(
          ProductionTemplatePatternOptionTaskMaterialEntity,
          {
            where: { id: saved.id },
            relations: {
              product: true,
              productUnit: true,
            },
          }
        );
        return toPatternOptionTaskMaterialDto(reloaded);
      } catch (err) {
        if (err instanceof QueryFailedError && (err as any).driverError?.errno === 1062) {
          throw new ConflictError(
            'تمت إضافة وحدة القياس هذه مسبقاً لهذه المهمة',
            'PRODUCTION_TEMPLATE_PATTERN_TASK_MATERIAL_ALREADY_EXISTS'
          );
        }
        throw err;
      }
    });
  }

  async updateTaskMaterial(
    templateId: string,
    patternId: string,
    optionId: string,
    taskId: string,
    materialId: string,
    dto: UpdateTemplatePatternOptionTaskMaterialDto
  ): Promise<ProductionTemplatePatternOptionTaskMaterialDto> {
    const qtyNum = parseFloat(dto.plannedQuantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      throw new BusinessRuleError(
        'الكمية المخططة يجب أن تكون أكبر من الصفر',
        'PRODUCTION_TEMPLATE_PATTERN_TASK_MATERIAL_INVALID_QUANTITY'
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      // 1. Lock template
      await this.guardService.lockMutableTemplate(templateId, manager);

      // 2. Verify task ownership
      await this.guardService.requireTaskBelongsToOption(
        templateId,
        patternId,
        optionId,
        taskId,
        manager
      );

      // 3. Find material
      const material = await manager.findOne(ProductionTemplatePatternOptionTaskMaterialEntity, {
        where: { id: materialId, taskId },
      });
      if (!material) {
        throw new NotFoundError(
          'المادة المخططة غير موجودة',
          'PRODUCTION_TEMPLATE_PATTERN_TASK_MATERIAL_NOT_FOUND'
        );
      }

      if (dto.productUnitId && dto.productUnitId !== material.productUnitId) {
        await this.inventoryReferenceService.validatePlannedMaterialUnit(
          material.productId,
          dto.productUnitId
        );

        const duplicate = await manager.findOne(ProductionTemplatePatternOptionTaskMaterialEntity, {
          where: { taskId, productUnitId: dto.productUnitId },
        });
        if (duplicate && duplicate.id !== materialId) {
          throw new ConflictError(
            'تمت إضافة وحدة القياس هذه مسبقاً لهذه المهمة',
            'PRODUCTION_TEMPLATE_PATTERN_TASK_MATERIAL_ALREADY_EXISTS'
          );
        }
        material.productUnitId = dto.productUnitId;
      }

      material.plannedQuantity = dto.plannedQuantity;

      try {
        const saved = await manager.save(material);
        const reloaded = await manager.findOneOrFail(
          ProductionTemplatePatternOptionTaskMaterialEntity,
          {
            where: { id: saved.id },
            relations: {
              product: true,
              productUnit: true,
            },
          }
        );
        return toPatternOptionTaskMaterialDto(reloaded);
      } catch (err) {
        if (err instanceof QueryFailedError && (err as any).driverError?.errno === 1062) {
          throw new ConflictError(
            'تمت إضافة وحدة القياس هذه مسبقاً لهذه المهمة',
            'PRODUCTION_TEMPLATE_PATTERN_TASK_MATERIAL_ALREADY_EXISTS'
          );
        }
        throw err;
      }
    });
  }

  async removeTaskMaterial(
    templateId: string,
    patternId: string,
    optionId: string,
    taskId: string,
    materialId: string
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // 1. Lock template
      await this.guardService.lockMutableTemplate(templateId, manager);

      // 2. Verify task ownership
      await this.guardService.requireTaskBelongsToOption(
        templateId,
        patternId,
        optionId,
        taskId,
        manager
      );

      const material = await manager.findOne(ProductionTemplatePatternOptionTaskMaterialEntity, {
        where: { id: materialId, taskId },
      });
      if (!material) {
        throw new NotFoundError(
          'المادة المخططة غير موجودة',
          'PRODUCTION_TEMPLATE_PATTERN_TASK_MATERIAL_NOT_FOUND'
        );
      }

      await manager.remove(material);
    });
  }
}

export const productionTemplatePatternOptionTaskMaterialService =
  new ProductionTemplatePatternOptionTaskMaterialService();
