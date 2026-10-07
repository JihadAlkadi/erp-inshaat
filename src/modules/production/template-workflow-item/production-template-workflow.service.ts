import { DataSource, EntityManager, Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionTemplateWorkflowItemEntity, ProductionTemplateWorkflowItemType } from './production-template-workflow-item.entity.js';
import { ProductionTemplateStageEntity } from '../template-stage/production-template-stage.entity.js';
import { ProductionTemplatePatternEntity } from '../template-pattern/production-template-pattern.entity.js';
import { ProductionTemplateGuardService, productionTemplateGuardService } from '../template/production-template-guard.service.js';
import {
  ProductionTemplateWorkflowItemDto,
  toProductionTemplateWorkflowItemDto,
} from './production-template-workflow-item.types.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class ProductionTemplateWorkflowService {
  private workflowRepo: Repository<ProductionTemplateWorkflowItemEntity>;
  private guardService: ProductionTemplateGuardService;

  constructor(
    private dataSource: DataSource = AppDataSource,
    guardService: ProductionTemplateGuardService = productionTemplateGuardService
  ) {
    this.workflowRepo = this.dataSource.getRepository(ProductionTemplateWorkflowItemEntity);
    this.guardService = guardService;
  }

  /**
   * Lists all top-level workflow items for an active template.
   * Performs strict polymorphic integrity checks and fails closed if corrupted.
   */
  async listWorkflowItems(templateId: string): Promise<ProductionTemplateWorkflowItemDto[]> {
    await this.guardService.requireExistingTemplate(templateId);

    const items = await this.workflowRepo.find({
      where: { templateId, deletedAt: IsNull() },
      relations: {
        stage: {
          department: true,
          plannedMaterials: true,
          attachments: true,
        },
        pattern: {
          options: true,
        },
      },
      order: { sortOrder: 'ASC' },
    });

    const result: ProductionTemplateWorkflowItemDto[] = [];

    for (const item of items) {
      // Polymorphic validation
      if (item.itemType === 'STAGE') {
        if (!item.stageId || item.patternId !== null) {
          throw new BusinessRuleError(
            'بيانات سير العمل للقالب تالفة أو غير متسقة (نوع العنصر مرحلة لكن المرجع تالف)',
            'PRODUCTION_TEMPLATE_WORKFLOW_CORRUPT'
          );
        }
        if (!item.stage || item.stage.deletedAt !== null || item.stage.templateId !== templateId) {
          throw new BusinessRuleError(
            'بيانات سير العمل للقالب تالفة (المرحلة المشار إليها مفقودة أو مؤرشفة أو تتبع قالباً آخر)',
            'PRODUCTION_TEMPLATE_WORKFLOW_CORRUPT'
          );
        }

        const stage = item.stage;
        const plannedMaterialsCount = (stage.plannedMaterials || []).length;
        const attachmentsCount = (stage.attachments || []).filter((a: any) => !a.deletedAt).length;

        result.push(
          toProductionTemplateWorkflowItemDto(item, {
            id: stage.id,
            name: stage.name,
            description: stage.description,
            departmentId: stage.departmentId,
            departmentName: stage.department?.name,
            departmentCode: stage.department?.code,
            estimatedDurationMinutes: stage.estimatedDurationMinutes,
            estimatedCost: stage.estimatedCost ? String(stage.estimatedCost) : null,
            plannedMaterialsCount,
            attachmentsCount,
          })
        );
      } else if (item.itemType === 'PATTERN') {
        if (!item.patternId || item.stageId !== null) {
          throw new BusinessRuleError(
            'بيانات سير العمل للقالب تالفة أو غير متسقة (نوع العنصر نمط لكن المرجع تالف)',
            'PRODUCTION_TEMPLATE_WORKFLOW_CORRUPT'
          );
        }
        if (!item.pattern || item.pattern.deletedAt !== null || item.pattern.templateId !== templateId) {
          throw new BusinessRuleError(
            'بيانات سير العمل للقالب تالفة (النمط المشار إليه مفقود أو مؤرشف أو يتبع قالباً آخر)',
            'PRODUCTION_TEMPLATE_WORKFLOW_CORRUPT'
          );
        }

        const pattern = item.pattern;
        const activeOptions = (pattern.options || []).filter((o) => !o.deletedAt);

        result.push(
          toProductionTemplateWorkflowItemDto(item, undefined, {
            id: pattern.id,
            name: pattern.name,
            optionsCount: activeOptions.length,
          })
        );
      } else {
        throw new BusinessRuleError(
          'نوع عنصر سير العمل غير معروف',
          'PRODUCTION_TEMPLATE_WORKFLOW_CORRUPT'
        );
      }
    }

    return result;
  }

  /**
   * Inserts a workflow item under parent template lock.
   */
  async insertWorkflowItem(
    manager: EntityManager,
    templateId: string,
    itemType: ProductionTemplateWorkflowItemType,
    targetId: string,
    desiredSortOrder?: number
  ): Promise<ProductionTemplateWorkflowItemEntity> {
    const activeItems = await manager.find(ProductionTemplateWorkflowItemEntity, {
      where: { templateId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });

    const maxOrder = activeItems.length > 0 ? activeItems[activeItems.length - 1].sortOrder : 0;
    const nextOrder = maxOrder + 1;
    const sortOrder =
      desiredSortOrder && desiredSortOrder >= 1 && desiredSortOrder <= nextOrder
        ? desiredSortOrder
        : nextOrder;

    // Shift items if inserted in between
    if (sortOrder < nextOrder) {
      await manager
        .createQueryBuilder()
        .update(ProductionTemplateWorkflowItemEntity)
        .set({ sortOrder: () => 'sort_order + 1' })
        .where('template_id = :templateId AND sort_order >= :sortOrder AND deleted_at IS NULL', {
          templateId,
          sortOrder,
        })
        .execute();
    }

    const workflowItem = manager.create(ProductionTemplateWorkflowItemEntity, {
      templateId,
      itemType,
      stageId: itemType === 'STAGE' ? targetId : null,
      patternId: itemType === 'PATTERN' ? targetId : null,
      sortOrder,
    });

    return await manager.save(workflowItem);
  }

  /**
   * Archives a workflow item and re-compacts the remaining items densely 1..N under template lock.
   */
  async archiveWorkflowItem(
    manager: EntityManager,
    templateId: string,
    itemType: ProductionTemplateWorkflowItemType,
    targetId: string
  ): Promise<void> {
    const whereCondition: any = { templateId, itemType, deletedAt: IsNull() };
    if (itemType === 'STAGE') {
      whereCondition.stageId = targetId;
    } else {
      whereCondition.patternId = targetId;
    }

    const item = await manager.findOne(ProductionTemplateWorkflowItemEntity, {
      where: whereCondition,
    });

    if (item) {
      await manager.softDelete(ProductionTemplateWorkflowItemEntity, item.id);
    }

    // Dense re-compact remaining active items 1..N
    const remainingItems = await manager.find(ProductionTemplateWorkflowItemEntity, {
      where: { templateId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });

    for (let i = 0; i < remainingItems.length; i++) {
      await manager.update(
        ProductionTemplateWorkflowItemEntity,
        { id: remainingItems[i].id },
        { sortOrder: i + 1 }
      );
    }
  }

  /**
   * Reorders workflow items densely 1..N under parent template lock.
   * Validates exact permutation of active items.
   */
  async reorderWorkflow(
    templateId: string,
    workflowItemIds: string[]
  ): Promise<ProductionTemplateWorkflowItemDto[]> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Lock template row FOR UPDATE & verify not archived
      await this.guardService.lockMutableTemplate(templateId, manager);

      // 2. Fetch all active items under lock
      const existingItems = await manager.find(ProductionTemplateWorkflowItemEntity, {
        where: { templateId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });

      const uniqueIds = new Set(workflowItemIds);
      if (
        uniqueIds.size !== workflowItemIds.length ||
        workflowItemIds.length !== existingItems.length
      ) {
        throw new BusinessRuleError(
          'قائمة المعرفات غير متطابقة مع عناصر سير عمل القالب',
          'PRODUCTION_TEMPLATE_WORKFLOW_INVALID_REORDER'
        );
      }

      const existingMap = new Map(existingItems.map((i) => [i.id, i]));
      for (const id of workflowItemIds) {
        if (!existingMap.has(id)) {
          throw new BusinessRuleError(
            'أحد المعرفات لا يتبع لسير عمل هذا القالب',
            'PRODUCTION_TEMPLATE_WORKFLOW_INVALID_REORDER'
          );
        }
      }

      // 3. Dense update 1..N
      for (let i = 0; i < workflowItemIds.length; i++) {
        const id = workflowItemIds[i];
        await manager.update(
          ProductionTemplateWorkflowItemEntity,
          { id },
          { sortOrder: i + 1 }
        );
      }

      // 4. Return refreshed workflow list
      return await this.listWorkflowItems(templateId);
    });
  }

  /**
   * Checks if a template currently contains any active patterns in its workflow.
   */
  async hasActivePatterns(templateId: string, manager?: EntityManager): Promise<boolean> {
    const repo = manager ? manager.getRepository(ProductionTemplateWorkflowItemEntity) : this.workflowRepo;
    const count = await repo.count({
      where: { templateId, itemType: 'PATTERN', deletedAt: IsNull() },
    });
    return count > 0;
  }
}

export const productionTemplateWorkflowService = new ProductionTemplateWorkflowService();
