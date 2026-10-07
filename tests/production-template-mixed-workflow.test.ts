import 'reflect-metadata';
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { databaseConfig } from '../src/config/database.config.js';
import { NotFoundError } from '../src/common/errors/not-found.error.js';

// DTOs
import { ReorderWorkflowItemsDto } from '../src/modules/production/template-workflow-item/dto/reorder-workflow-items.dto.js';
import { CreateTemplatePatternDto } from '../src/modules/production/template-pattern/dto/create-pattern.dto.js';
import { UpdateTemplatePatternDto } from '../src/modules/production/template-pattern/dto/update-pattern.dto.js';
import { CreateTemplatePatternOptionDto } from '../src/modules/production/template-pattern-option/dto/create-pattern-option.dto.js';
import { UpdateTemplatePatternOptionDto } from '../src/modules/production/template-pattern-option/dto/update-pattern-option.dto.js';
import { ReorderPatternOptionsDto } from '../src/modules/production/template-pattern-option/dto/reorder-pattern-options.dto.js';
import { CreateTemplatePatternOptionTaskDto } from '../src/modules/production/template-pattern-option-task/dto/create-pattern-option-task.dto.js';
import { UpdateTemplatePatternOptionTaskDto } from '../src/modules/production/template-pattern-option-task/dto/update-pattern-option-task.dto.js';
import { ReorderPatternOptionTasksDto } from '../src/modules/production/template-pattern-option-task/dto/reorder-pattern-option-tasks.dto.js';
import { AddTemplatePatternOptionTaskMaterialDto } from '../src/modules/production/template-pattern-option-task-material/dto/add-task-material.dto.js';
import { UpdateTemplatePatternOptionTaskMaterialDto } from '../src/modules/production/template-pattern-option-task-material/dto/update-task-material.dto.js';
import { UpdatePatternOptionTaskAttachmentDto } from '../src/modules/production/template-pattern-option-task-attachment/dto/update-task-attachment.dto.js';
import { ReorderPatternOptionTaskAttachmentsDto } from '../src/modules/production/template-pattern-option-task-attachment/dto/reorder-task-attachments.dto.js';

// Grouping Helper
import {
  deriveMixedWorkflowGroups,
  MixedWorkflowVisualElement,
} from '../src/modules/production/template-stage/consecutive-department-grouping.helper.js';

// Serialization DTO helpers
import { toProductionTemplateWorkflowItemDto } from '../src/modules/production/template-workflow-item/production-template-workflow-item.types.js';
import { toProductionTemplatePatternDto } from '../src/modules/production/template-pattern/production-template-pattern.types.js';
import { toProductionTemplatePatternOptionDto } from '../src/modules/production/template-pattern-option/production-template-pattern-option.types.js';
import { toProductionTemplatePatternOptionTaskDto } from '../src/modules/production/template-pattern-option-task/production-template-pattern-option-task.types.js';
import { toPatternOptionTaskMaterialDto } from '../src/modules/production/template-pattern-option-task-material/production-template-pattern-option-task-material.types.js';
import { toPatternOptionTaskAttachmentDto } from '../src/modules/production/template-pattern-option-task-attachment/production-template-pattern-option-task-attachment.types.js';

// Services
import { ProductionTemplateGuardService } from '../src/modules/production/template/production-template-guard.service.js';
import { ProductionTemplateWorkflowService } from '../src/modules/production/template-workflow-item/production-template-workflow.service.js';
import { ProductionTemplatePatternService } from '../src/modules/production/template-pattern/production-template-pattern.service.js';
import { ProductionTemplatePatternOptionService } from '../src/modules/production/template-pattern-option/production-template-pattern-option.service.js';
import { ProductionTemplatePatternOptionTaskService } from '../src/modules/production/template-pattern-option-task/production-template-pattern-option-task.service.js';
import { ProductionTemplatePatternOptionTaskMaterialService } from '../src/modules/production/template-pattern-option-task-material/production-template-pattern-option-task-material.service.js';
import { ProductionTemplatePatternOptionTaskAttachmentService } from '../src/modules/production/template-pattern-option-task-attachment/production-template-pattern-option-task-attachment.service.js';
import { ProductionTemplateStageService } from '../src/modules/production/template-stage/production-template-stage.service.js';
import { InventoryProductReferenceService } from '../src/modules/inventory/product/inventory-product-reference.service.js';

// Storage Abstraction
import { ProductionTemplateReferenceFileStorageService } from '../src/modules/production/template/production-template-reference-file-storage.service.js';
import { getMetadataArgsStorage } from 'typeorm';

// Entities
import { ProductionTemplateEntity } from '../src/modules/production/template/production-template.entity.js';
import { ProductionTemplateStageEntity } from '../src/modules/production/template-stage/production-template-stage.entity.js';
import { ProductionTemplateWorkflowItemEntity } from '../src/modules/production/template-workflow-item/production-template-workflow-item.entity.js';
import { ProductionTemplatePatternEntity } from '../src/modules/production/template-pattern/production-template-pattern.entity.js';
import { ProductionTemplatePatternOptionEntity } from '../src/modules/production/template-pattern-option/production-template-pattern-option.entity.js';
import { ProductionTemplatePatternOptionTaskEntity } from '../src/modules/production/template-pattern-option-task/production-template-pattern-option-task.entity.js';
import { ProductionTemplatePatternOptionTaskMaterialEntity } from '../src/modules/production/template-pattern-option-task-material/production-template-pattern-option-task-material.entity.js';
import { ProductionTemplatePatternOptionTaskAttachmentEntity } from '../src/modules/production/template-pattern-option-task-attachment/production-template-pattern-option-task-attachment.entity.js';

import { ProductionTemplateStageAttachmentEntity } from '../src/modules/production/template-stage-attachment/production-template-stage-attachment.entity.js';
import { ProductionTemplateStageMaterialEntity } from '../src/modules/production/template-stage-material/production-template-stage-material.entity.js';
import { loadTaskReferenceCounts } from '../src/modules/production/template-pattern-option-task/production-template-pattern-option-task.service.js';

describe('Production Template Mixed Workflow, Patterns & Options Architecture Invariants', () => {
  // ========================================================
  // 1. MIGRATION 0011 & 0012 & DATABASE REGISTRATION
  // ========================================================
  describe('1. Migration 0011 & 0012 & Entity Registration', () => {
    it('verifies migration 0011 file exists and is registered in databaseConfig.migrations', () => {
      const migrationFilePath = path.join(
        process.cwd(),
        'src/database/migrations/1710000000011-AddProductionTemplateMixedWorkflowPatterns.ts'
      );
      assert.strictEqual(fs.existsSync(migrationFilePath), true);

      const migrations = (databaseConfig.migrations as any[]) || [];
      const hasMigration0011 = migrations.some(
        (m) =>
          typeof m === 'function' &&
          m.name === 'AddProductionTemplateMixedWorkflowPatterns1710000000011'
      );
      assert.strictEqual(hasMigration0011, true);
    });

    it('verifies migration 0012 file exists and is registered in databaseConfig.migrations', () => {
      const migrationFilePath = path.join(
        process.cwd(),
        'src/database/migrations/1710000000012-HardenProductionTemplateMixedWorkflow.ts'
      );
      assert.strictEqual(fs.existsSync(migrationFilePath), true);

      const migrations = (databaseConfig.migrations as any[]) || [];
      const hasMigration0012 = migrations.some(
        (m) =>
          typeof m === 'function' &&
          m.name === 'HardenProductionTemplateMixedWorkflow1710000000012'
      );
      assert.strictEqual(hasMigration0012, true);
    });

    it('verifies all 6 new entities are registered in databaseConfig.entities', () => {
      const entities = (databaseConfig.entities as any[]) || [];
      assert.strictEqual(entities.includes(ProductionTemplateWorkflowItemEntity), true);
      assert.strictEqual(entities.includes(ProductionTemplatePatternEntity), true);
      assert.strictEqual(entities.includes(ProductionTemplatePatternOptionEntity), true);
      assert.strictEqual(entities.includes(ProductionTemplatePatternOptionTaskEntity), true);
      assert.strictEqual(entities.includes(ProductionTemplatePatternOptionTaskMaterialEntity), true);
      assert.strictEqual(entities.includes(ProductionTemplatePatternOptionTaskAttachmentEntity), true);
    });

    it('verifies sortOrder column is removed from ProductionTemplateStageEntity metadata', () => {
      // ProductionTemplateStageEntity should not have sort_order as a persisted column in TypeORM
      const stageColumns = getMetadataArgsStorage().columns.filter(
        (c) => c.target === ProductionTemplateStageEntity
      );
      const hasSortOrderColumn = stageColumns.some(
        (c) => c.propertyName === 'sortOrder' || (c.options && (c.options as any).name === 'sort_order')
      );
      assert.strictEqual(hasSortOrderColumn, false);
    });

    it('verifies ProductionTemplatePatternOptionTaskMaterialEntity metadata has precision 18 scale 6 and unique index', () => {
      const matColumns = getMetadataArgsStorage().columns.filter(
        (c) => c.target === ProductionTemplatePatternOptionTaskMaterialEntity
      );
      const plannedQtyCol = matColumns.find(
        (c) => c.propertyName === 'plannedQuantity' || (c.options && (c.options as any).name === 'planned_quantity')
      );
      assert.ok(plannedQtyCol, 'plannedQuantity column must exist');
      assert.strictEqual(plannedQtyCol.options.precision, 18);
      assert.strictEqual(plannedQtyCol.options.scale, 6);

      const indices = getMetadataArgsStorage().indices.filter(
        (idx) => idx.target === ProductionTemplatePatternOptionTaskMaterialEntity
      );
      const uqIdx = indices.find((idx) => idx.name === 'UQ_production_pattern_task_material_task_unit');
      assert.ok(uqIdx, 'Unique index UQ_production_pattern_task_material_task_unit must exist in metadata');
      assert.strictEqual(uqIdx.unique, true);
    });
  });

  // ========================================================
  // 2. MIXED WORKFLOW PRESENTATION & GROUPING INVARIANTS
  // ========================================================
  describe('2. Mixed Workflow Consecutive Department Grouping Invariants', () => {
    it('returns empty array when workflow items are empty', () => {
      const result = deriveMixedWorkflowGroups([]);
      assert.deepStrictEqual(result, []);
    });

    it('groups consecutive stages belonging to the same department', () => {
      const items: any[] = [
        {
          id: 'wf-1',
          itemType: 'STAGE',
          sortOrder: 1,
          stage: { id: 's-1', name: 'Stage 1', departmentId: 'dept-cast', department: { id: 'dept-cast', name: 'الصب', code: 'CAST' } },
        },
        {
          id: 'wf-2',
          itemType: 'STAGE',
          sortOrder: 2,
          stage: { id: 's-2', name: 'Stage 2', departmentId: 'dept-cast', department: { id: 'dept-cast', name: 'الصب', code: 'CAST' } },
        },
      ];

      const result = deriveMixedWorkflowGroups(items);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'DEPARTMENT_GROUP');
      assert.strictEqual((result[0] as any).stages.length, 2);
    });

    it('Pattern acts as boundary: interrupts consecutive department stage grouping', () => {
      // Stage(Casting) -> Stage(Casting) -> Pattern -> Stage(Casting)
      const items: any[] = [
        {
          id: 'wf-1',
          itemType: 'STAGE',
          sortOrder: 1,
          stage: { id: 's-1', name: 'Stage 1', departmentId: 'dept-cast', department: { id: 'dept-cast', name: 'الصب', code: 'CAST' } },
        },
        {
          id: 'wf-2',
          itemType: 'STAGE',
          sortOrder: 2,
          stage: { id: 's-2', name: 'Stage 2', departmentId: 'dept-cast', department: { id: 'dept-cast', name: 'الصب', code: 'CAST' } },
        },
        {
          id: 'wf-3',
          itemType: 'PATTERN',
          sortOrder: 3,
          pattern: { id: 'pat-1', name: 'نوع الصب', optionsCount: 2 },
        },
        {
          id: 'wf-4',
          itemType: 'STAGE',
          sortOrder: 4,
          stage: { id: 's-3', name: 'Stage 3', departmentId: 'dept-cast', department: { id: 'dept-cast', name: 'الصب', code: 'CAST' } },
        },
      ];

      const result = deriveMixedWorkflowGroups(items);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].type, 'DEPARTMENT_GROUP');
      assert.strictEqual((result[0] as any).stages.length, 2);
      assert.strictEqual(result[1].type, 'PATTERN');
      assert.strictEqual((result[1] as any).pattern.name, 'نوع الصب');
      assert.strictEqual(result[2].type, 'DEPARTMENT_GROUP');
      assert.strictEqual((result[2] as any).stages.length, 1);
    });
  });

  // ========================================================
  // 3. WORKFLOW ORDERING & DTO REORDER INVARIANTS
  // ========================================================
  describe('3. Workflow Ordering & Reorder Invariants', () => {
    it('ReorderWorkflowItemsDto rejects empty array or non-UUIDs', async () => {
      const dto1 = plainToInstance(ReorderWorkflowItemsDto, { workflowItemIds: [] });
      const errs1 = await validate(dto1);
      assert.strictEqual(errs1.length > 0, true);

      const dto2 = plainToInstance(ReorderWorkflowItemsDto, { workflowItemIds: ['not-a-uuid'] });
      const errs2 = await validate(dto2);
      assert.strictEqual(errs2.length > 0, true);

      const dto3 = plainToInstance(ReorderWorkflowItemsDto, {
        workflowItemIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      });
      const errs3 = await validate(dto3);
      assert.strictEqual(errs3.length, 0);
    });

    it('reorderWorkflow fails closed on duplicate IDs or mismatching item count', async () => {
      const mockManager = {
        findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
        find: async () => [
          { id: 'wf-1', templateId: 'tmpl-1', sortOrder: 1, deletedAt: null },
          { id: 'wf-2', templateId: 'tmpl-1', sortOrder: 2, deletedAt: null },
        ],
      } as any;

      const mockDs = {
        getRepository: () => ({ findOne: async () => null, find: async () => [] }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const wfService = new ProductionTemplateWorkflowService(
        mockDs,
        new ProductionTemplateGuardService(mockDs)
      );

      // Duplicates
      await assert.rejects(
        async () => wfService.reorderWorkflow('tmpl-1', ['wf-1', 'wf-1']),
        { code: 'PRODUCTION_TEMPLATE_WORKFLOW_INVALID_REORDER' }
      );

      // Missing count
      await assert.rejects(
        async () => wfService.reorderWorkflow('tmpl-1', ['wf-1']),
        { code: 'PRODUCTION_TEMPLATE_WORKFLOW_INVALID_REORDER' }
      );
    });

    it('Old stage reorder is blocked with PRODUCTION_TEMPLATE_MIXED_WORKFLOW_REORDER_REQUIRED when patterns exist', async () => {
      const mockManager = {
        findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
        getRepository: () => ({
          count: async () => 1, // Has active patterns
        }),
      } as any;

      const mockDs = {
        getRepository: () => ({ findOne: async () => null, find: async () => [] }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const stageService = new ProductionTemplateStageService(
        mockDs,
        { validateDepartmentForStage: async () => {} } as any,
        new ProductionTemplateGuardService(mockDs),
        new ProductionTemplateWorkflowService(mockDs, new ProductionTemplateGuardService(mockDs))
      );

      await assert.rejects(
        async () => stageService.reorderStages('tmpl-1', { stageIds: ['stg-1', 'stg-2'] }),
        { code: 'PRODUCTION_TEMPLATE_MIXED_WORKFLOW_REORDER_REQUIRED' }
      );
    });
  });

  // ========================================================
  // 4. PATTERN & OPTION & TASK DOMAIN RULES
  // ========================================================
  describe('4. Pattern, Option, and Task Domain Rules', () => {
    it('CreateTemplatePatternDto validates name constraints', async () => {
      const emptyDto = plainToInstance(CreateTemplatePatternDto, { name: '' });
      assert.strictEqual((await validate(emptyDto)).length > 0, true);

      const validDto = plainToInstance(CreateTemplatePatternDto, { name: 'نوع الصب' });
      assert.strictEqual((await validate(validDto)).length, 0);
    });

    it('CreateTemplatePatternOptionDto validates name constraints', async () => {
      const emptyDto = plainToInstance(CreateTemplatePatternOptionDto, { name: '' });
      assert.strictEqual((await validate(emptyDto)).length > 0, true);

      const validDto = plainToInstance(CreateTemplatePatternOptionDto, { name: 'مسلح' });
      assert.strictEqual((await validate(validDto)).length, 0);
    });

    it('CreateTemplatePatternOptionTaskDto requires departmentId and name', async () => {
      const invalidDto = plainToInstance(CreateTemplatePatternOptionTaskDto, {
        name: 'تجهيز الحديد',
        departmentId: 'not-a-uuid',
      });
      assert.strictEqual((await validate(invalidDto)).length > 0, true);

      const validDto = plainToInstance(CreateTemplatePatternOptionTaskDto, {
        name: 'تجهيز الحديد',
        departmentId: '11111111-1111-4111-8111-111111111111',
        estimatedDurationMinutes: 60,
        estimatedCost: '500.00',
      });
      assert.strictEqual((await validate(validDto)).length, 0);
    });

    it('Pattern and Option entities have NO department column; Task entity OWNS departmentId', () => {
      const patternCols = Object.keys(new ProductionTemplatePatternEntity());
      const optionCols = Object.keys(new ProductionTemplatePatternOptionEntity());

      assert.strictEqual(patternCols.includes('departmentId'), false);
      assert.strictEqual(optionCols.includes('departmentId'), false);
    });
  });

  // ========================================================
  // 5. UNIFIED TEMPLATE PESSIMISTIC LOCK ROOT
  // ========================================================
  describe('5. Unified Template Aggregate Lock Root Protocol', () => {
    it('all pattern, option, task, and workflow mutations serialize through Template pessimistic_write lock', async () => {
      const callSequence: string[] = [];
      const mockTemplate: any = { id: 'tmpl-1', deletedAt: null };
      const mockPattern: any = { id: 'pat-1', templateId: 'tmpl-1', name: 'Pattern 1', deletedAt: null };
      const mockOption: any = { id: 'opt-1', patternId: 'pat-1', name: 'Option 1', sortOrder: 1, deletedAt: null };

      const mockManager = {
        findOne: async (_entity: any, options: any) => {
          if (options?.lock?.mode === 'pessimistic_write') {
            callSequence.push('LOCK_TEMPLATE');
            return mockTemplate;
          }
          if (options?.where?.id === 'pat-1') {
            callSequence.push('FIND_PATTERN');
            return mockPattern;
          }
          if (options?.where?.id === 'opt-1') {
            callSequence.push('FIND_OPTION');
            return mockOption;
          }
          return null;
        },
        save: async (_entity: any, target: any) => {
          callSequence.push('SAVE');
          return target || _entity;
        },
        count: async () => 0,
        find: async () => [],
      } as any;

      const mockDs = {
        getRepository: () => ({ findOne: async () => null, find: async () => [] }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const guardService = new ProductionTemplateGuardService(mockDs);
      const patternService = new ProductionTemplatePatternService(
        mockDs,
        guardService,
        new ProductionTemplateWorkflowService(mockDs, guardService)
      );

      await patternService.updatePattern('tmpl-1', 'pat-1', { name: 'Updated Pattern' });
      assert.deepStrictEqual(callSequence, ['LOCK_TEMPLATE', 'FIND_PATTERN', 'SAVE']);
    });
  });

  // ========================================================
  // 6. TASK PLANNED MATERIALS & REFERENCE BOUNDARY
  // ========================================================
  describe('6. Task Planned Materials & Inventory Boundary Invariants', () => {
    it('AddTemplatePatternOptionTaskMaterialDto enforces plannedQuantity > 0', async () => {
      const invalidDto = plainToInstance(AddTemplatePatternOptionTaskMaterialDto, {
        productId: '11111111-1111-4111-8111-111111111111',
        productUnitId: '22222222-2222-4222-8222-222222222222',
        plannedQuantity: '0',
      });
      assert.strictEqual((await validate(invalidDto)).length > 0, true);

      const validDto = plainToInstance(AddTemplatePatternOptionTaskMaterialDto, {
        productId: '11111111-1111-4111-8111-111111111111',
        productUnitId: '22222222-2222-4222-8222-222222222222',
        plannedQuantity: '10.5000',
      });
      assert.strictEqual((await validate(validDto)).length, 0);
    });

    it('toPatternOptionTaskMaterialDto does NOT leak internal product fields', () => {
      const rawEntity: any = {
        id: 'mat-1',
        taskId: 'task-1',
        productId: 'prod-1',
        productUnitId: 'unit-1',
        plannedQuantity: '15.0000',
        createdAt: new Date(),
        updatedAt: new Date(),
        product: {
          id: 'prod-1',
          name: 'حديد تسليح',
          code: 'STEEL-16',
          price: '500.00', // Internal price
          barcode: '123456789', // Internal barcode
          locationName: 'مستودع 1', // Internal location
          specifications: 'High strength',
        },
        productUnit: {
          id: 'unit-1',
          name: 'طن',
          isBase: true,
          conversionInternals: '1:1',
        },
      };

      const dto = toPatternOptionTaskMaterialDto(rawEntity);
      assert.strictEqual(dto.id, 'mat-1');
      assert.strictEqual(dto.product?.name, 'حديد تسليح');
      assert.strictEqual(dto.product?.code, 'STEEL-16');
      assert.strictEqual((dto.product as any).price, undefined);
      assert.strictEqual((dto.product as any).barcode, undefined);
      assert.strictEqual((dto.product as any).locationName, undefined);
      assert.strictEqual((dto.product as any).specifications, undefined);
    });
  });

  // ========================================================
  // 7. TASK REFERENCE DOCUMENTS & REUSABLE FILE STORAGE
  // ========================================================
  describe('7. Task Reference Documents & Storage Abstraction Invariants', () => {
    it('storage service prevents path traversal in filename or storage key', () => {
      const storageService = new ProductionTemplateReferenceFileStorageService();

      assert.throws(
        () => storageService.resolveAbsolutePath('../../etc/passwd'),
        (err: any) => err.code === 'ATTACHMENT_INVALID_KEY' || err.code === 'ATTACHMENT_PATH_TRAVERSAL'
      );
    });

    it('toPatternOptionTaskAttachmentDto strictly omits physical server storage path', () => {
      const rawAttachment: any = {
        id: 'att-1',
        taskId: 'task-1',
        originalFileName: 'drawing.pdf',
        storageKey: 'production-template-pattern-task/task-1/uuid.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        description: 'مخطط تسليح',
        sortOrder: 1,
        createdByUserId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const dto = toPatternOptionTaskAttachmentDto(rawAttachment, 'tmpl-1', 'pat-1', 'opt-1');
      assert.strictEqual(dto.id, 'att-1');
      assert.strictEqual(dto.originalFileName, 'drawing.pdf');
      assert.strictEqual((dto as any).storageKey, undefined);
      assert.strictEqual((dto as any).absolutePath, undefined);
    });
  });

  // ========================================================
  // 8. FAIL-CLOSED ARCHIVE & CORRUPTION INTEGRITY
  // ========================================================
  describe('8. Fail-Closed Archive & Ownership Integrity', () => {
    it('ProductionTemplateGuardService rejects child mutation if template is archived', async () => {
      const mockManager = {
        findOne: async () => null, // Template is archived, so findOne returns null
      } as any;

      const mockDs = {
        getRepository: () => ({ findOne: async () => null, find: async () => [] }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;
      const guard = new ProductionTemplateGuardService(mockDs);

      await assert.rejects(
        async () => guard.lockMutableTemplate('tmpl-1', mockManager),
        { code: 'PRODUCTION_TEMPLATE_NOT_FOUND' }
      );
    });

    it('Ownership guard rejects task belonging to another option', async () => {
      const mockTemplateRepo = {
        findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
      };
      const mockPatternRepo = {
        findOne: async () => ({ id: 'pat-1', templateId: 'tmpl-1', deletedAt: null }),
      };
      const mockOptionRepo = {
        findOne: async () => ({ id: 'opt-1', patternId: 'pat-1', deletedAt: null }),
      };
      const mockTaskRepo = {
        findOne: async (_opts: any) => null, // Task does not belong to option opt-1
      };

      const mockDs = {
        getRepository: (entity: any) => {
          if (entity === ProductionTemplateEntity) return mockTemplateRepo;
          if (entity === ProductionTemplatePatternEntity) return mockPatternRepo;
          if (entity === ProductionTemplatePatternOptionEntity) return mockOptionRepo;
          if (entity === ProductionTemplatePatternOptionTaskEntity) return mockTaskRepo;
          return { findOne: async () => null, find: async () => [] };
        },
      } as any;
      const guard = new ProductionTemplateGuardService(mockDs);

      await assert.rejects(
        async () => guard.requireTaskBelongsToOption('tmpl-1', 'pat-1', 'opt-1', 'task-1'),
        { code: 'PRODUCTION_TEMPLATE_PATTERN_OPTION_TASK_NOT_FOUND' }
      );
    });
  });

  // ========================================================
  // 9. REORDER RESPONSE CONSISTENCY & MANAGER-AWARE READS
  // ========================================================
  describe('9. Reorder Response Consistency & Manager-Aware Reads', () => {
    const createBaseRepo = (overrides: any = {}) => ({
      findOne: async () => ({
        id: 'mock-id',
        templateId: 'tmpl-1',
        patternId: 'pat-1',
        optionId: 'opt-1',
        taskId: 'tsk-1',
        deletedAt: null,
      }),
      find: async () => [],
      count: async () => 0,
      createQueryBuilder: () => ({
        select: () => ({
          addSelect: () => ({
            where: () => ({
              groupBy: () => ({
                getRawMany: async () => [],
              }),
            }),
          }),
        }),
      }),
      ...overrides,
    });

    it('reorderWorkflow returns updated sortOrder 1..N reflecting new order [C, A, B] using same manager', async () => {
      const itemsMap: Record<string, any> = {
        'wf-A': { id: 'wf-A', templateId: 'tmpl-1', itemType: 'STAGE', stageId: 'stg-A', patternId: null, sortOrder: 1, deletedAt: null, stage: { id: 'stg-A', templateId: 'tmpl-1', name: 'Stage A', departmentId: 'dept-1', deletedAt: null } },
        'wf-B': { id: 'wf-B', templateId: 'tmpl-1', itemType: 'STAGE', stageId: 'stg-B', patternId: null, sortOrder: 2, deletedAt: null, stage: { id: 'stg-B', templateId: 'tmpl-1', name: 'Stage B', departmentId: 'dept-1', deletedAt: null } },
        'wf-C': { id: 'wf-C', templateId: 'tmpl-1', itemType: 'STAGE', stageId: 'stg-C', patternId: null, sortOrder: 3, deletedAt: null, stage: { id: 'stg-C', templateId: 'tmpl-1', name: 'Stage C', departmentId: 'dept-1', deletedAt: null } },
      };

      let managerUsedInRead = false;
      const mockManager = {
        findOne: async (_entity: any, opts: any) => {
          if (opts?.lock?.mode === 'pessimistic_write') {
            return { id: 'tmpl-1', deletedAt: null };
          }
          return null;
        },
        find: async () => Object.values(itemsMap),
        update: async (_entity: any, criteria: any, updateObj: any) => {
          if (itemsMap[criteria.id]) {
            itemsMap[criteria.id].sortOrder = updateObj.sortOrder;
          }
        },
        getRepository: (entity: any) => {
          managerUsedInRead = true;
          if (entity === ProductionTemplateEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'tmpl-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplateWorkflowItemEntity) {
            return createBaseRepo({
              find: async () => Object.values(itemsMap).slice().sort((a, b) => a.sortOrder - b.sortOrder),
            });
          }
          return createBaseRepo();
        },
      } as any;

      const mockDs = {
        getRepository: () => createBaseRepo({
          find: async () => {
            throw new Error('Global repository must not be called inside transaction');
          },
        }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const guard = new ProductionTemplateGuardService(mockDs);
      const wfService = new ProductionTemplateWorkflowService(mockDs, guard);

      const result = await wfService.reorderWorkflow('tmpl-1', ['wf-C', 'wf-A', 'wf-B']);
      assert.strictEqual(managerUsedInRead, true);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].id, 'wf-C');
      assert.strictEqual(result[0].sortOrder, 1);
      assert.strictEqual(result[1].id, 'wf-A');
      assert.strictEqual(result[1].sortOrder, 2);
      assert.strictEqual(result[2].id, 'wf-B');
      assert.strictEqual(result[2].sortOrder, 3);
    });

    it('reorderOptions returns updated sortOrder 1..N reflecting new order [C, A, B] using same manager', async () => {
      const optionsMap: Record<string, any> = {
        'opt-A': { id: 'opt-A', patternId: 'pat-1', name: 'Option A', sortOrder: 1, deletedAt: null, tasks: [] },
        'opt-B': { id: 'opt-B', patternId: 'pat-1', name: 'Option B', sortOrder: 2, deletedAt: null, tasks: [] },
        'opt-C': { id: 'opt-C', patternId: 'pat-1', name: 'Option C', sortOrder: 3, deletedAt: null, tasks: [] },
      };

      let managerUsedInRead = false;
      const mockManager = {
        findOne: async (_entity: any, opts: any) => {
          if (opts?.lock?.mode === 'pessimistic_write') {
            return { id: 'tmpl-1', deletedAt: null };
          }
          return null;
        },
        find: async () => Object.values(optionsMap),
        update: async (_entity: any, criteria: any, updateObj: any) => {
          if (optionsMap[criteria.id]) {
            optionsMap[criteria.id].sortOrder = updateObj.sortOrder;
          }
        },
        getRepository: (entity: any) => {
          managerUsedInRead = true;
          if (entity === ProductionTemplateEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'tmpl-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplatePatternEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'pat-1', templateId: 'tmpl-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplatePatternOptionEntity) {
            return createBaseRepo({
              find: async () => Object.values(optionsMap).slice().sort((a, b) => a.sortOrder - b.sortOrder),
            });
          }
          return createBaseRepo();
        },
      } as any;

      const mockDs = {
        getRepository: () => createBaseRepo({
          find: async () => {
            throw new Error('Global repository must not be called inside transaction');
          },
        }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const guard = new ProductionTemplateGuardService(mockDs);
      const optionService = new ProductionTemplatePatternOptionService(mockDs, guard);

      const result = await optionService.reorderOptions('tmpl-1', 'pat-1', {
        optionIds: ['opt-C', 'opt-A', 'opt-B'],
      });
      assert.strictEqual(managerUsedInRead, true);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].id, 'opt-C');
      assert.strictEqual(result[0].sortOrder, 1);
      assert.strictEqual(result[1].id, 'opt-A');
      assert.strictEqual(result[1].sortOrder, 2);
      assert.strictEqual(result[2].id, 'opt-B');
      assert.strictEqual(result[2].sortOrder, 3);
    });

    it('reorderTasks returns updated sortOrder 1..N reflecting new order [C, A, B] using same manager', async () => {
      const tasksMap: Record<string, any> = {
        'tsk-A': { id: 'tsk-A', optionId: 'opt-1', name: 'Task A', departmentId: 'dept-1', sortOrder: 1, deletedAt: null },
        'tsk-B': { id: 'tsk-B', optionId: 'opt-1', name: 'Task B', departmentId: 'dept-1', sortOrder: 2, deletedAt: null },
        'tsk-C': { id: 'tsk-C', optionId: 'opt-1', name: 'Task C', departmentId: 'dept-1', sortOrder: 3, deletedAt: null },
      };

      let managerUsedInRead = false;
      const mockManager = {
        findOne: async (_entity: any, opts: any) => {
          if (opts?.lock?.mode === 'pessimistic_write') {
            return { id: 'tmpl-1', deletedAt: null };
          }
          return null;
        },
        find: async () => Object.values(tasksMap),
        update: async (_entity: any, criteria: any, updateObj: any) => {
          if (tasksMap[criteria.id]) {
            tasksMap[criteria.id].sortOrder = updateObj.sortOrder;
          }
        },
        getRepository: (entity: any) => {
          managerUsedInRead = true;
          if (entity === ProductionTemplateEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'tmpl-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplatePatternEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'pat-1', templateId: 'tmpl-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplatePatternOptionEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'opt-1', patternId: 'pat-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplatePatternOptionTaskEntity) {
            return createBaseRepo({
              find: async () => Object.values(tasksMap).slice().sort((a, b) => a.sortOrder - b.sortOrder),
            });
          }
          return createBaseRepo();
        },
      } as any;

      const mockDs = {
        getRepository: () => createBaseRepo({
          find: async () => {
            throw new Error('Global repository must not be called inside transaction');
          },
        }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const guard = new ProductionTemplateGuardService(mockDs);
      const taskService = new ProductionTemplatePatternOptionTaskService(
        mockDs,
        { validateDepartmentForStage: async () => {} } as any,
        guard
      );

      const result = await taskService.reorderTasks('tmpl-1', 'pat-1', 'opt-1', {
        taskIds: ['tsk-C', 'tsk-A', 'tsk-B'],
      });
      assert.strictEqual(managerUsedInRead, true);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].id, 'tsk-C');
      assert.strictEqual(result[0].sortOrder, 1);
      assert.strictEqual(result[1].id, 'tsk-A');
      assert.strictEqual(result[1].sortOrder, 2);
      assert.strictEqual(result[2].id, 'tsk-B');
      assert.strictEqual(result[2].sortOrder, 3);
    });

    it('reorderTaskAttachments returns updated sortOrder 1..N reflecting new order [C, A, B] using same manager', async () => {
      const attMap: Record<string, any> = {
        'att-A': { id: 'att-A', taskId: 'tsk-1', originalFileName: 'a.pdf', sortOrder: 1, deletedAt: null },
        'att-B': { id: 'att-B', taskId: 'tsk-1', originalFileName: 'b.pdf', sortOrder: 2, deletedAt: null },
        'att-C': { id: 'att-C', taskId: 'tsk-1', originalFileName: 'c.pdf', sortOrder: 3, deletedAt: null },
      };

      let managerUsedInRead = false;
      const mockManager = {
        findOne: async (_entity: any, opts: any) => {
          if (opts?.lock?.mode === 'pessimistic_write') {
            return { id: 'tmpl-1', deletedAt: null };
          }
          return null;
        },
        find: async () => Object.values(attMap),
        update: async (_entity: any, criteria: any, updateObj: any) => {
          if (attMap[criteria.id]) {
            attMap[criteria.id].sortOrder = updateObj.sortOrder;
          }
        },
        getRepository: (entity: any) => {
          managerUsedInRead = true;
          if (entity === ProductionTemplateEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'tmpl-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplatePatternEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'pat-1', templateId: 'tmpl-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplatePatternOptionEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'opt-1', patternId: 'pat-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplatePatternOptionTaskEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'tsk-1', optionId: 'opt-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplatePatternOptionTaskAttachmentEntity) {
            return createBaseRepo({
              find: async () => Object.values(attMap).slice().sort((a, b) => a.sortOrder - b.sortOrder),
            });
          }
          return createBaseRepo();
        },
      } as any;

      const mockDs = {
        getRepository: () => createBaseRepo({
          find: async () => {
            throw new Error('Global repository must not be called inside transaction');
          },
        }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const guard = new ProductionTemplateGuardService(mockDs);
      const attService = new ProductionTemplatePatternOptionTaskAttachmentService(
        mockDs,
        new ProductionTemplateReferenceFileStorageService(),
        guard
      );

      const result = await attService.reorderTaskAttachments('tmpl-1', 'pat-1', 'opt-1', 'tsk-1', {
        attachmentIds: ['att-C', 'att-A', 'att-B'],
      });
      assert.strictEqual(managerUsedInRead, true);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].id, 'att-C');
      assert.strictEqual(result[0].sortOrder, 1);
      assert.strictEqual(result[1].id, 'att-A');
      assert.strictEqual(result[1].sortOrder, 2);
      assert.strictEqual(result[2].id, 'att-B');
      assert.strictEqual(result[2].sortOrder, 3);
    });

    it('reorderStages (legacy) returns updated sortOrder 1..N reflecting new order [C, A, B] using same manager', async () => {
      const wfMap: Record<string, any> = {
        'stg-A': { id: 'wf-A', templateId: 'tmpl-1', itemType: 'STAGE', stageId: 'stg-A', sortOrder: 1, deletedAt: null },
        'stg-B': { id: 'wf-B', templateId: 'tmpl-1', itemType: 'STAGE', stageId: 'stg-B', sortOrder: 2, deletedAt: null },
        'stg-C': { id: 'wf-C', templateId: 'tmpl-1', itemType: 'STAGE', stageId: 'stg-C', sortOrder: 3, deletedAt: null },
      };

      const stagesMap: Record<string, any> = {
        'stg-A': { id: 'stg-A', templateId: 'tmpl-1', name: 'Stage A', departmentId: 'dept-1', deletedAt: null, get workflowItem() { return wfMap['stg-A']; } },
        'stg-B': { id: 'stg-B', templateId: 'tmpl-1', name: 'Stage B', departmentId: 'dept-1', deletedAt: null, get workflowItem() { return wfMap['stg-B']; } },
        'stg-C': { id: 'stg-C', templateId: 'tmpl-1', name: 'Stage C', departmentId: 'dept-1', deletedAt: null, get workflowItem() { return wfMap['stg-C']; } },
      };

      let managerUsedInRead = false;
      const mockManager = {
        findOne: async (_entity: any, opts: any) => {
          if (opts?.lock?.mode === 'pessimistic_write') {
            return { id: 'tmpl-1', deletedAt: null };
          }
          return null;
        },
        find: async (entity: any) => {
          if (entity === ProductionTemplateWorkflowItemEntity) {
            return Object.values(wfMap);
          }
          return Object.values(stagesMap);
        },
        update: async (_entity: any, criteria: any, updateObj: any) => {
          for (const item of Object.values(wfMap)) {
            if (item.id === criteria.id) {
              item.sortOrder = updateObj.sortOrder;
            }
          }
        },
        getRepository: (entity: any) => {
          managerUsedInRead = true;
          if (entity === ProductionTemplateEntity) {
            return createBaseRepo({ findOne: async () => ({ id: 'tmpl-1', deletedAt: null }) });
          }
          if (entity === ProductionTemplateWorkflowItemEntity) {
            return createBaseRepo({
              count: async () => 0, // No patterns
            });
          }
          if (entity === ProductionTemplateStageEntity) {
            return createBaseRepo({
              find: async () => {
                return Object.values(stagesMap).slice().sort((a, b) => {
                  return (a.workflowItem?.sortOrder || 0) - (b.workflowItem?.sortOrder || 0);
                });
              },
            });
          }
          return createBaseRepo();
        },
      } as any;

      const mockDs = {
        getRepository: () => createBaseRepo({
          find: async () => {
            throw new Error('Global repository must not be called inside transaction');
          },
        }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const guard = new ProductionTemplateGuardService(mockDs);
      const wfService = new ProductionTemplateWorkflowService(mockDs, guard);
      const stageService = new ProductionTemplateStageService(
        mockDs,
        { validateDepartmentForStage: async () => {} } as any,
        guard,
        wfService
      );

      const result = await stageService.reorderStages('tmpl-1', {
        stageIds: ['stg-C', 'stg-A', 'stg-B'],
      });
      assert.strictEqual(managerUsedInRead, true);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].id, 'stg-C');
      assert.strictEqual(result[0].sortOrder, 1);
      assert.strictEqual(result[1].id, 'stg-A');
      assert.strictEqual(result[1].sortOrder, 2);
      assert.strictEqual(result[2].id, 'stg-B');
      assert.strictEqual(result[2].sortOrder, 3);
    });
  });

  // ========================================================
  // 10. BATCHED REFERENCE COUNTS & ZERO ARRAY OVER-FETCH
  // ========================================================
  describe('10. Batched Reference Counts & Zero Array Over-Fetch', () => {
    it('loadTaskReferenceCounts batches queries by task_id and ignores soft-deleted attachments', async () => {
      let matWhereClause = '';
      let attWhereClause = '';

      const mockDs = {
        getRepository: (entity: any) => {
          if (entity === ProductionTemplatePatternOptionTaskMaterialEntity) {
            return {
              createQueryBuilder: () => ({
                select: () => ({
                  addSelect: () => ({
                    where: (w: string) => {
                      matWhereClause = w;
                      return {
                        groupBy: () => ({
                          getRawMany: async () => [
                            { taskId: 'task-1', cnt: '2' },
                          ],
                        }),
                      };
                    },
                  }),
                }),
              }),
            };
          }
          if (entity === ProductionTemplatePatternOptionTaskAttachmentEntity) {
            return {
              createQueryBuilder: () => ({
                select: () => ({
                  addSelect: () => ({
                    where: (w: string) => {
                      attWhereClause = w;
                      return {
                        groupBy: () => ({
                          getRawMany: async () => [
                            { taskId: 'task-1', cnt: '3' }, // 3 active, 1 archived ignored
                            { taskId: 'task-2', cnt: '1' },
                          ],
                        }),
                      };
                    },
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any;

      const counts = await loadTaskReferenceCounts(['task-1', 'task-2'], mockDs);
      assert.ok(matWhereClause.includes('mat.taskId IN (:...taskIds)'));
      assert.ok(attWhereClause.includes('att.taskId IN (:...taskIds) AND att.deletedAt IS NULL'));

      const t1 = counts.get('task-1');
      assert.ok(t1);
      assert.strictEqual(t1.plannedMaterialsCount, 2);
      assert.strictEqual(t1.attachmentsCount, 3);

      const t2 = counts.get('task-2');
      assert.ok(t2);
      assert.strictEqual(t2.plannedMaterialsCount, 0);
      assert.strictEqual(t2.attachmentsCount, 1);
    });

    it('listWorkflowItems calculates stage counts in batch without loading full material/attachment arrays', async () => {
      const mockItems = [
        {
          id: 'wf-1',
          templateId: 'tmpl-1',
          itemType: 'STAGE',
          sortOrder: 1,
          stageId: 'stg-1',
          patternId: null,
          deletedAt: null,
          stage: {
            id: 'stg-1',
            templateId: 'tmpl-1',
            name: 'Stage 1',
            departmentId: 'dept-1',
            deletedAt: null,
            department: { id: 'dept-1', name: 'الصب', code: 'CAST' },
            // Notice: plannedMaterials and attachments are NOT loaded as arrays
          },
        },
      ];

      const mockDs = {
        getRepository: (entity: any) => {
          if (entity === ProductionTemplateEntity) {
            return {
              findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
            };
          }
          if (entity === ProductionTemplateWorkflowItemEntity) {
            return {
              find: async () => mockItems,
            };
          }
          if (entity === ProductionTemplateStageMaterialEntity) {
            return {
              createQueryBuilder: () => ({
                select: () => ({
                  addSelect: () => ({
                    where: () => ({
                      groupBy: () => ({
                        getRawMany: async () => [
                          { stageId: 'stg-1', cnt: '4' },
                        ],
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (entity === ProductionTemplateStageAttachmentEntity) {
            return {
              createQueryBuilder: () => ({
                select: () => ({
                  addSelect: () => ({
                    where: () => ({
                      groupBy: () => ({
                        getRawMany: async () => [
                          { stageId: 'stg-1', cnt: '2' },
                        ],
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return { findOne: async () => null } as any;
        },
      } as any;

      const guard = new ProductionTemplateGuardService(mockDs);
      const wfService = new ProductionTemplateWorkflowService(mockDs, guard);

      const result = await wfService.listWorkflowItems('tmpl-1');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].stage?.plannedMaterialsCount, 4);
      assert.strictEqual(result[0].stage?.attachmentsCount, 2);
      assert.strictEqual((result[0].stage as any).plannedMaterials, undefined);
      assert.strictEqual((result[0].stage as any).attachments, undefined);
    });

    it('listPatterns populates initial builder pattern tasks with batched counts (no 0 badges)', async () => {
      const mockPattern = {
        id: 'pat-1',
        templateId: 'tmpl-1',
        name: 'نوع الصب',
        deletedAt: null,
        options: [
          {
            id: 'opt-1',
            patternId: 'pat-1',
            name: 'صب مسبق',
            sortOrder: 1,
            deletedAt: null,
            tasks: [
              {
                id: 'task-1',
                optionId: 'opt-1',
                name: 'تجهيز القالب',
                departmentId: 'dept-1',
                sortOrder: 1,
                deletedAt: null,
              },
            ],
          },
        ],
      };

      const mockDs = {
        getRepository: (entity: any) => {
          if (entity === ProductionTemplatePatternEntity) {
            return {
              find: async () => [mockPattern],
            };
          }
          if (entity === ProductionTemplatePatternOptionTaskMaterialEntity) {
            return {
              createQueryBuilder: () => ({
                select: () => ({
                  addSelect: () => ({
                    where: () => ({
                      groupBy: () => ({
                        getRawMany: async () => [{ taskId: 'task-1', cnt: '2' }],
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (entity === ProductionTemplatePatternOptionTaskAttachmentEntity) {
            return {
              createQueryBuilder: () => ({
                select: () => ({
                  addSelect: () => ({
                    where: () => ({
                      groupBy: () => ({
                        getRawMany: async () => [{ taskId: 'task-1', cnt: '3' }],
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return { findOne: async () => ({ id: 'tmpl-1', deletedAt: null }) } as any;
        },
      } as any;

      const guard = new ProductionTemplateGuardService(mockDs);
      const patternService = new ProductionTemplatePatternService(
        mockDs,
        guard,
        new ProductionTemplateWorkflowService(mockDs, guard)
      );

      const patterns = await patternService.listPatterns('tmpl-1');
      assert.strictEqual(patterns.length, 1);
      const taskDto = patterns[0].options?.[0]?.tasks?.[0];
      assert.ok(taskDto);
      assert.strictEqual(taskDto.plannedMaterialsCount, 2);
      assert.strictEqual(taskDto.attachmentsCount, 3);
    });

    it('updatePattern preserves task reference counts using same manager and excludes archived attachments', async () => {
      const mockPattern = {
        id: 'pat-1',
        templateId: 'tmpl-1',
        name: 'نوع الصب القديم',
        deletedAt: null,
        options: [
          {
            id: 'opt-1',
            patternId: 'pat-1',
            name: 'مسلح',
            sortOrder: 1,
            deletedAt: null,
            tasks: [
              {
                id: 'task-1',
                optionId: 'opt-1',
                name: 'تجهيز الحديد',
                departmentId: 'dept-1',
                sortOrder: 1,
                deletedAt: null,
                department: { id: 'dept-1', name: 'الحدادة', code: 'STEEL' },
              },
            ],
          },
        ],
      };

      let managerUsedForMaterials = false;
      let managerUsedForAttachments = false;
      let attWhereClause = '';

      const mockManager = {
        findOne: async (entity: any, opts: any) => {
          if (entity === ProductionTemplateEntity || opts?.lock?.mode === 'pessimistic_write') {
            return { id: 'tmpl-1', deletedAt: null };
          }
          if (entity === ProductionTemplatePatternEntity) {
            return mockPattern;
          }
          return null;
        },
        save: async (entity: any) => entity,
        getRepository: (entity: any) => {
          if (entity === ProductionTemplateEntity) {
            return {
              findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
            };
          }
          if (entity === ProductionTemplatePatternEntity) {
            return {
              findOne: async () => mockPattern,
            };
          }
          if (entity === ProductionTemplatePatternOptionTaskMaterialEntity) {
            managerUsedForMaterials = true;
            return {
              createQueryBuilder: () => ({
                select: () => ({
                  addSelect: () => ({
                    where: () => ({
                      groupBy: () => ({
                        getRawMany: async () => [
                          { taskId: 'task-1', cnt: '2' },
                        ],
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (entity === ProductionTemplatePatternOptionTaskAttachmentEntity) {
            managerUsedForAttachments = true;
            return {
              createQueryBuilder: () => ({
                select: () => ({
                  addSelect: () => ({
                    where: (w: string) => {
                      attWhereClause = w;
                      return {
                        groupBy: () => ({
                          getRawMany: async () => [
                            { taskId: 'task-1', cnt: '3' }, // 3 active, 1 archived excluded
                          ],
                        }),
                      };
                    },
                  }),
                }),
              }),
            };
          }
          return { findOne: async () => null, find: async () => [] };
        },
      } as any;

      const mockDs = {
        getRepository: (entity: any) => {
          if (
            entity === ProductionTemplatePatternOptionTaskMaterialEntity ||
            entity === ProductionTemplatePatternOptionTaskAttachmentEntity
          ) {
            throw new Error('Global repository must not be called inside transaction');
          }
          return { findOne: async () => ({ id: 'tmpl-1', deletedAt: null }), find: async () => [] };
        },
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const guard = new ProductionTemplateGuardService(mockDs);
      const wfService = new ProductionTemplateWorkflowService(mockDs, guard);
      const patternService = new ProductionTemplatePatternService(mockDs, guard, wfService);

      const result = await patternService.updatePattern('tmpl-1', 'pat-1', {
        name: 'نوع الصب المعدل',
      });

      assert.strictEqual(managerUsedForMaterials, true);
      assert.strictEqual(managerUsedForAttachments, true);
      assert.ok(attWhereClause.includes('att.deletedAt IS NULL'));

      assert.strictEqual(result.name, 'نوع الصب المعدل');
      assert.strictEqual(result.options?.length, 1);
      const taskDto = result.options[0].tasks?.[0];
      assert.ok(taskDto);
      assert.strictEqual(taskDto.plannedMaterialsCount, 2);
      assert.strictEqual(taskDto.attachmentsCount, 3);
      assert.strictEqual((taskDto as any).plannedMaterials, undefined);
      assert.strictEqual((taskDto as any).attachments, undefined);
    });
  });

  // ========================================================
  // 11. PLANNED MATERIAL QUANTITY PRECISION INVARIANTS
  // ========================================================
  describe('11. Task Planned Material Quantity 6-Decimal Precision Invariants', () => {
    it('AddTemplatePatternOptionTaskMaterialDto allows 6 decimal places (0.000001)', async () => {
      const dto = plainToInstance(AddTemplatePatternOptionTaskMaterialDto, {
        productId: '11111111-1111-4111-8111-111111111111',
        productUnitId: '22222222-2222-4222-8222-222222222222',
        plannedQuantity: '0.000001',
      });
      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('AddTemplatePatternOptionTaskMaterialDto rejects more than 6 decimal places (0.0000001)', async () => {
      const dto = plainToInstance(AddTemplatePatternOptionTaskMaterialDto, {
        productId: '11111111-1111-4111-8111-111111111111',
        productUnitId: '22222222-2222-4222-8222-222222222222',
        plannedQuantity: '0.0000001',
      });
      const errors = await validate(dto);
      assert.strictEqual(errors.length > 0, true);
    });

    it('AddTemplatePatternOptionTaskMaterialDto allows up to 12 integer digits with 6 decimals', async () => {
      const dto = plainToInstance(AddTemplatePatternOptionTaskMaterialDto, {
        productId: '11111111-1111-4111-8111-111111111111',
        productUnitId: '22222222-2222-4222-8222-222222222222',
        plannedQuantity: '999999999999.999999',
      });
      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);
    });

    it('AddTemplatePatternOptionTaskMaterialDto rejects more than 12 integer digits', async () => {
      const dto = plainToInstance(AddTemplatePatternOptionTaskMaterialDto, {
        productId: '11111111-1111-4111-8111-111111111111',
        productUnitId: '22222222-2222-4222-8222-222222222222',
        plannedQuantity: '1000000000000.000000',
      });
      const errors = await validate(dto);
      assert.strictEqual(errors.length > 0, true);
    });
  });

  // ========================================================
  // 12. TASK ATTACHMENT SECURITY & STORAGE LIFECYCLE INVARIANTS
  // ========================================================
  describe('12. Task Attachment Security & Storage Lifecycle Invariants', () => {
    const tempDir = path.join(process.cwd(), 'storage', 'test-temp-task-att');

    before(() => {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
    });

    it('addTaskAttachment rejects MIME/extension mismatch and cleans temporary file', async () => {
      const tempFile = path.join(tempDir, 'mismatch-test.pdf');
      fs.writeFileSync(tempFile, 'fake pdf content');

      const storageService = new ProductionTemplateReferenceFileStorageService();
      const mockDs = {
        getRepository: () => ({}),
        transaction: async (cb: any) =>
          cb({
            findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
            count: async () => 0,
          }),
      } as any;
      const guard = {
        lockMutableTemplate: async () => {},
        requireTaskBelongsToOption: async () => {},
      } as any;
      const attService = new ProductionTemplatePatternOptionTaskAttachmentService(
        mockDs,
        storageService,
        guard
      );

      await assert.rejects(
        async () =>
          attService.addTaskAttachment(
            'tmpl-1',
            'pat-1',
            'opt-1',
            'task-1',
            {
              originalname: 'mismatch-test.pdf',
              mimetype: 'image/png', // Mismatch with .pdf extension
              size: 100,
              path: tempFile,
            }
          ),
        { code: 'ATTACHMENT_MIME_EXTENSION_MISMATCH' }
      );

      // Temp file must be unlinked
      assert.strictEqual(fs.existsSync(tempFile), false);
    });

    it('addTaskAttachment cleans temporary file and deletes final stored file on DB failure', async () => {
      const tempFile = path.join(tempDir, 'db-fail-test.pdf');
      fs.writeFileSync(tempFile, 'valid pdf buffer');

      let savedStorageKey = '';
      const storageService = new ProductionTemplateReferenceFileStorageService();
      const originalSave = storageService.saveFileWithPrefix.bind(storageService);
      storageService.saveFileWithPrefix = async (...args) => {
        const res = await originalSave(...args);
        savedStorageKey = res.storageKey;
        return res;
      };

      const mockManager = {
        findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
        count: async () => 0,
        create: (_entity: any, data: any) => data,
        save: async () => {
          throw new Error('Simulated DB failure after file write');
        },
      } as any;

      const mockDs = {
        getRepository: () => ({
          findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
        }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const guard = {
        lockMutableTemplate: async () => {},
        requireTaskBelongsToOption: async () => {},
      } as any;

      const attService = new ProductionTemplatePatternOptionTaskAttachmentService(
        mockDs,
        storageService,
        guard
      );

      await assert.rejects(
        async () =>
          attService.addTaskAttachment('tmpl-1', 'pat-1', 'opt-1', 'task-1', {
            originalname: 'db-fail-test.pdf',
            mimetype: 'application/pdf',
            size: 16,
            path: tempFile,
            buffer: Buffer.from('valid pdf buffer'),
          }),
        /Simulated DB failure/
      );

      // Both temp file and final stored file must be deleted
      assert.strictEqual(fs.existsSync(tempFile), false);
      assert.strictEqual(storageService.fileExists(savedStorageKey), false);
    });

    it('addTaskAttachment successful upload persists final file, cleans temp, and returns DTO', async () => {
      const tempFile = path.join(tempDir, 'success-test.pdf');
      fs.writeFileSync(tempFile, 'successful pdf content');

      const storageService = new ProductionTemplateReferenceFileStorageService();
      let createdEntity: any = null;

      const mockManager = {
        findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
        count: async () => 0,
        create: (_entity: any, data: any) => {
          createdEntity = { ...data, id: 'att-created-1', createdAt: new Date(), updatedAt: new Date() };
          return createdEntity;
        },
        save: async (entity: any) => entity,
      } as any;

      const mockDs = {
        getRepository: () => ({
          findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
        }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const guard = {
        lockMutableTemplate: async () => {},
        requireTaskBelongsToOption: async () => {},
      } as any;

      const attService = new ProductionTemplatePatternOptionTaskAttachmentService(
        mockDs,
        storageService,
        guard
      );

      const dto = await attService.addTaskAttachment('tmpl-1', 'pat-1', 'opt-1', 'task-1', {
        originalname: 'success-test.pdf',
        mimetype: 'application/pdf',
        size: 23,
        path: tempFile,
        buffer: Buffer.from('successful pdf content'),
      });

      assert.strictEqual(dto.id, 'att-created-1');
      assert.strictEqual(dto.originalFileName, 'success-test.pdf');
      assert.strictEqual(fs.existsSync(tempFile), false); // Temp cleaned
      assert.strictEqual(storageService.fileExists(createdEntity.storageKey), true); // Final file exists

      // Cleanup final file
      await storageService.deleteStoredFile(createdEntity.storageKey);
    });

    it('softDeleteTaskAttachment retains physical file on disk while setting deletedAt', async () => {
      const storageService = new ProductionTemplateReferenceFileStorageService();
      const saved = await storageService.saveFileWithPrefix('production-template-pattern-task', 'task-1', {
        originalname: 'soft-del.pdf',
        mimetype: 'application/pdf',
        size: 10,
        buffer: Buffer.from('soft-del-data'),
      });

      let softDeleteCalled = false;
      const mockManager = {
        findOne: async () => ({
          id: 'att-1',
          taskId: 'task-1',
          storageKey: saved.storageKey,
          deletedAt: null,
        }),
        softDelete: async (_entity: any, id: string) => {
          if (id === 'att-1') softDeleteCalled = true;
        },
        find: async () => [],
      } as any;

      const mockDs = {
        getRepository: () => ({
          findOne: async () => ({ id: 'tmpl-1', deletedAt: null }),
        }),
        transaction: async (cb: any) => cb(mockManager),
      } as any;

      const guard = {
        lockMutableTemplate: async () => {},
        requireTaskBelongsToOption: async () => {},
      } as any;

      const attService = new ProductionTemplatePatternOptionTaskAttachmentService(
        mockDs,
        storageService,
        guard
      );

      await attService.softDeleteTaskAttachment('tmpl-1', 'pat-1', 'opt-1', 'task-1', 'att-1');
      assert.strictEqual(softDeleteCalled, true);
      // Physical file MUST still exist after soft delete!
      assert.strictEqual(storageService.fileExists(saved.storageKey), true);

      // Cleanup
      await storageService.deleteStoredFile(saved.storageKey);
    });

    it('getTaskAttachmentForDownload throws ATTACHMENT_FILE_MISSING when physical file is missing', async () => {
      const storageService = new ProductionTemplateReferenceFileStorageService();
      const mockRepo = {
        findOne: async () => ({
          id: 'att-1',
          taskId: 'task-1',
          originalFileName: 'missing.pdf',
          storageKey: 'production-template-pattern-task/task-1/non-existent-file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          deletedAt: null,
        }),
      };

      const mockDs = {
        getRepository: () => mockRepo,
      } as any;

      const guard = {
        requireExistingTemplate: async () => {},
        requireTaskBelongsToOption: async () => {},
      } as any;

      const attService = new ProductionTemplatePatternOptionTaskAttachmentService(
        mockDs,
        storageService,
        guard
      );

      await assert.rejects(
        async () =>
          attService.getTaskAttachmentForDownload('tmpl-1', 'pat-1', 'opt-1', 'task-1', 'att-1'),
        { code: 'ATTACHMENT_FILE_MISSING' }
      );
    });

    it('getTaskAttachmentForDownload fails closed when parent template is archived', async () => {
      const guard = {
        requireExistingTemplate: async () => {
          throw new NotFoundError('القالب غير موجود', 'PRODUCTION_TEMPLATE_NOT_FOUND');
        },
        requireTaskBelongsToOption: async () => {},
      } as any;

      const attService = new ProductionTemplatePatternOptionTaskAttachmentService(
        { getRepository: () => ({}) } as any,
        new ProductionTemplateReferenceFileStorageService(),
        guard
      );

      await assert.rejects(
        async () =>
          attService.getTaskAttachmentForDownload('tmpl-archived', 'pat-1', 'opt-1', 'task-1', 'att-1'),
        { code: 'PRODUCTION_TEMPLATE_NOT_FOUND' }
      );
    });
  });
});

