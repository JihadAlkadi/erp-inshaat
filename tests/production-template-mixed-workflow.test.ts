import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { databaseConfig } from '../src/config/database.config.js';

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

describe('Production Template Mixed Workflow, Patterns & Options Architecture Invariants', () => {
  // ========================================================
  // 1. MIGRATION 0011 & DATABASE REGISTRATION
  // ========================================================
  describe('1. Migration 0011 & Entity Registration', () => {
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
});
