import { DataSource, Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionTemplateEntity } from '../template/production-template.entity.js';
import { ProductionTemplateStageEntity } from './production-template-stage.entity.js';
import {
  ProductionDepartmentService,
  productionDepartmentService,
} from '../department/production-department.service.js';
import { CreateTemplateStageDto } from './dto/create-stage.dto.js';
import { UpdateTemplateStageDto } from './dto/update-stage.dto.js';
import { ReorderTemplateStagesDto } from './dto/reorder-stages.dto.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class ProductionTemplateStageService {
  private stageRepo: Repository<ProductionTemplateStageEntity>;
  private departmentService: ProductionDepartmentService;

  constructor(
    private dataSource: DataSource = AppDataSource,
    deptService: ProductionDepartmentService = productionDepartmentService
  ) {
    this.stageRepo = this.dataSource.getRepository(ProductionTemplateStageEntity);
    this.departmentService = deptService;
  }

  async listStages(templateId: string): Promise<ProductionTemplateStageEntity[]> {
    return await this.stageRepo.find({
      where: { templateId, deletedAt: IsNull() },
      relations: {
        department: true,
        plannedMaterials: {
          product: true,
          productUnit: true,
        },
      },
      order: { sortOrder: 'ASC' },
    });
  }

  async getStageById(templateId: string, stageId: string): Promise<ProductionTemplateStageEntity> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
      relations: {
        department: true,
        plannedMaterials: {
          product: true,
          productUnit: true,
        },
      },
    });

    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
    }

    return stage;
  }

  async addStage(templateId: string, dto: CreateTemplateStageDto): Promise<ProductionTemplateStageEntity> {
    // 1. Cross-module boundary: validate department via department service
    await this.departmentService.validateDepartmentForStage(dto.departmentId);

    // 2. Transaction with explicit pessimistic_write lock on Template row
    return await this.dataSource.transaction(async (manager) => {
      const template = await manager.findOne(ProductionTemplateEntity, {
        where: { id: templateId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!template) {
        throw new NotFoundError('القالب غير موجود', 'PRODUCTION_TEMPLATE_NOT_FOUND');
      }

      // Read current active stages under lock
      const activeStages = await manager.find(ProductionTemplateStageEntity, {
        where: { templateId, deletedAt: IsNull() },
        order: { sortOrder: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      const maxOrder = activeStages.length > 0 ? activeStages[activeStages.length - 1].sortOrder : 0;
      const nextOrder = maxOrder + 1;
      const sortOrder = dto.sortOrder && dto.sortOrder >= 1 && dto.sortOrder <= nextOrder ? dto.sortOrder : nextOrder;

      // If inserted before end, shift later stages
      if (sortOrder < nextOrder) {
        await manager
          .createQueryBuilder()
          .update(ProductionTemplateStageEntity)
          .set({ sortOrder: () => 'sort_order + 1' })
          .where('template_id = :templateId AND sort_order >= :sortOrder AND deleted_at IS NULL', {
            templateId,
            sortOrder,
          })
          .execute();
      }

      const stage = manager.create(ProductionTemplateStageEntity, {
        templateId,
        departmentId: dto.departmentId,
        name: dto.name.trim(),
        description: dto.description ? dto.description.trim() : null,
        sortOrder,
        estimatedDurationMinutes: dto.estimatedDurationMinutes !== undefined ? dto.estimatedDurationMinutes : null,
        estimatedCost: dto.estimatedCost ? dto.estimatedCost : null,
      });

      const savedStage = await manager.save(stage);

      return await manager.findOneOrFail(ProductionTemplateStageEntity, {
        where: { id: savedStage.id },
        relations: { department: true },
      });
    });
  }

  async updateStage(
    templateId: string,
    stageId: string,
    dto: UpdateTemplateStageDto
  ): Promise<ProductionTemplateStageEntity> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
    }

    if (dto.departmentId !== undefined && dto.departmentId !== stage.departmentId) {
      await this.departmentService.validateDepartmentForStage(dto.departmentId);
      stage.departmentId = dto.departmentId;
    }

    if (dto.name !== undefined) stage.name = dto.name.trim();
    if (dto.description !== undefined) stage.description = dto.description ? dto.description.trim() : null;
    if (dto.estimatedDurationMinutes !== undefined) stage.estimatedDurationMinutes = dto.estimatedDurationMinutes;
    if (dto.estimatedCost !== undefined) stage.estimatedCost = dto.estimatedCost;

    await this.stageRepo.save(stage);

    return await this.stageRepo.findOneOrFail({
      where: { id: stageId },
      relations: { department: true },
    });
  }

  async softDeleteStage(templateId: string, stageId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // 1. Lock template row
      const template = await manager.findOne(ProductionTemplateEntity, {
        where: { id: templateId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!template) {
        throw new NotFoundError('القالب غير موجود', 'PRODUCTION_TEMPLATE_NOT_FOUND');
      }

      const stage = await manager.findOne(ProductionTemplateStageEntity, {
        where: { id: stageId, templateId, deletedAt: IsNull() },
      });
      if (!stage) {
        throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
      }

      await manager.softDelete(ProductionTemplateStageEntity, stageId);

      // Re-compact remaining active stages into dense 1..N
      const remainingStages = await manager.find(ProductionTemplateStageEntity, {
        where: { templateId, deletedAt: IsNull() },
        order: { sortOrder: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      for (let i = 0; i < remainingStages.length; i++) {
        await manager.update(
          ProductionTemplateStageEntity,
          { id: remainingStages[i].id },
          { sortOrder: i + 1 }
        );
      }
    });
  }

  async reorderStages(
    templateId: string,
    dto: ReorderTemplateStagesDto
  ): Promise<ProductionTemplateStageEntity[]> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Lock template row
      const template = await manager.findOne(ProductionTemplateEntity, {
        where: { id: templateId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!template) {
        throw new NotFoundError('القالب غير موجود', 'PRODUCTION_TEMPLATE_NOT_FOUND');
      }

      // 2. Lock active stages for this template
      const existingStages = await manager.find(ProductionTemplateStageEntity, {
        where: { templateId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });

      const uniqueIds = new Set(dto.stageIds);
      if (
        uniqueIds.size !== dto.stageIds.length ||
        dto.stageIds.length !== existingStages.length
      ) {
        throw new BusinessRuleError(
          'قائمة المعرفات غير متطابقة مع مراحل القالب',
          'PRODUCTION_TEMPLATE_STAGE_INVALID_REORDER'
        );
      }

      const existingMap = new Map(existingStages.map((s) => [s.id, s]));
      for (const id of dto.stageIds) {
        if (!existingMap.has(id)) {
          throw new BusinessRuleError(
            'أحد المعرفات لا يتبع لهذا القالب',
            'PRODUCTION_TEMPLATE_STAGE_INVALID_REORDER'
          );
        }
      }

      // Re-order densely 1..N
      for (let i = 0; i < dto.stageIds.length; i++) {
        const id = dto.stageIds[i];
        await manager.update(
          ProductionTemplateStageEntity,
          { id },
          { sortOrder: i + 1 }
        );
      }

      return await manager.find(ProductionTemplateStageEntity, {
        where: { templateId, deletedAt: IsNull() },
        relations: { department: true },
        order: { sortOrder: 'ASC' },
      });
    });
  }
}

export const productionTemplateStageService = new ProductionTemplateStageService();
