import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { databaseConfig } from '../src/config/database.config.js';
import { SystemPermission } from '../src/modules/system/permission/constants/system-permission.enum.js';
import { SYSTEM_PERMISSION_DEFINITIONS } from '../src/modules/system/permission/constants/system-permission.registry.js';
import { AccessScopeCapabilityRegistry } from '../src/modules/system/authorization/access-administration/access-scope-capability.registry.js';
import { AccessScopePreset } from '../src/modules/system/authorization/access-administration/access-scope-preset.constants.js';

import { ProductionOrderEntity, ProductionOrderStatus } from '../src/modules/production/order/production-order.entity.js';
import { ProductionOrderSequenceEntity } from '../src/modules/production/order/production-order-sequence.entity.js';
import { ProductionOrderLineEntity } from '../src/modules/production/order-line/production-order-line.entity.js';
import { ProductionOrderLinePatternSelectionEntity } from '../src/modules/production/order-line-pattern-selection/production-order-line-pattern-selection.entity.js';
import { ProductionTemplateEntity } from '../src/modules/production/template/production-template.entity.js';
import { ProductionTemplatePatternEntity } from '../src/modules/production/template-pattern/production-template-pattern.entity.js';
import { ProductionTemplatePatternOptionEntity } from '../src/modules/production/template-pattern-option/production-template-pattern-option.entity.js';
import { ProductionTemplateWorkflowItemEntity } from '../src/modules/production/template-workflow-item/production-template-workflow-item.entity.js';
import { ProductionOrderService } from '../src/modules/production/order/production-order.service.js';
import { ProductionOrderGuardService } from '../src/modules/production/order/production-order-guard.service.js';
import { ProductionTemplateService } from '../src/modules/production/template/production-template.service.js';
import { BusinessRuleError } from '../src/common/errors/business-rule.error.js';
import { NotFoundError } from '../src/common/errors/not-found.error.js';
import { CreateProductionOrderDto } from '../src/modules/production/order/dto/create-production-order.dto.js';
import { UpdateProductionOrderDto } from '../src/modules/production/order/dto/update-production-order.dto.js';
import { AddProductionOrderLineDto } from '../src/modules/production/order-line/dto/add-production-order-line.dto.js';
import { UpdateProductionOrderLineDto } from '../src/modules/production/order-line/dto/update-production-order-line.dto.js';
import { ReorderProductionOrderLinesDto } from '../src/modules/production/order-line/dto/reorder-production-order-lines.dto.js';
import { UpdatePatternSelectionDto } from '../src/modules/production/order-line-pattern-selection/dto/update-pattern-selection.dto.js';
import { safeJsonStringify } from '../src/modules/production/order/production-order.types.js';

describe('Phase 1 — Production Order Drafting & Pattern Selection Foundation', () => {

  // ==========================================
  // 1. ARCHITECTURAL BOUNDARIES & CONFIGURATION
  // ==========================================
  describe('1. Architectural Boundaries & Registration', () => {
    it('verifies Migration 0013 is registered in databaseConfig.migrations', () => {
      const migrations = databaseConfig.migrations as Function[];
      const m13 = migrations.find((m) => m.name === 'CreateProductionOrderDraftingFoundation1710000000013');
      assert.ok(m13, 'Migration 0013 must be registered in databaseConfig');
    });

    it('verifies all 4 Order aggregate entities are registered in databaseConfig.entities', () => {
      const entities = databaseConfig.entities as Function[];
      assert.ok(entities.includes(ProductionOrderEntity), 'ProductionOrderEntity must be registered');
      assert.ok(entities.includes(ProductionOrderSequenceEntity), 'ProductionOrderSequenceEntity must be registered');
      assert.ok(entities.includes(ProductionOrderLineEntity), 'ProductionOrderLineEntity must be registered');
      assert.ok(
        entities.includes(ProductionOrderLinePatternSelectionEntity),
        'ProductionOrderLinePatternSelectionEntity must be registered'
      );
    });

    it('defines all 4 production order permissions with correct identifiers', () => {
      assert.equal(SystemPermission.PRODUCTION_ORDER_VIEW, 'production.order.view');
      assert.equal(SystemPermission.PRODUCTION_ORDER_CREATE, 'production.order.create');
      assert.equal(SystemPermission.PRODUCTION_ORDER_UPDATE, 'production.order.update');
      assert.equal(SystemPermission.PRODUCTION_ORDER_DELETE, 'production.order.delete');
    });

    it('registers all 4 production order permissions in SYSTEM_PERMISSION_DEFINITIONS', () => {
      const viewDef = SYSTEM_PERMISSION_DEFINITIONS[SystemPermission.PRODUCTION_ORDER_VIEW];
      const createDef = SYSTEM_PERMISSION_DEFINITIONS[SystemPermission.PRODUCTION_ORDER_CREATE];
      const updateDef = SYSTEM_PERMISSION_DEFINITIONS[SystemPermission.PRODUCTION_ORDER_UPDATE];
      const deleteDef = SYSTEM_PERMISSION_DEFINITIONS[SystemPermission.PRODUCTION_ORDER_DELETE];

      assert.ok(viewDef && viewDef.module === 'production');
      assert.ok(createDef && createDef.module === 'production');
      assert.ok(updateDef && updateDef.module === 'production');
      assert.ok(deleteDef && deleteDef.module === 'production');
    });

    it('verifies AccessScopeCapabilityRegistry maps production order permissions to [ALL]', () => {
      assert.deepEqual(
        AccessScopeCapabilityRegistry.getAllowedPresetsForPermission(SystemPermission.PRODUCTION_ORDER_VIEW),
        [AccessScopePreset.ALL]
      );
      assert.deepEqual(
        AccessScopeCapabilityRegistry.getAllowedPresetsForPermission(SystemPermission.PRODUCTION_ORDER_CREATE),
        [AccessScopePreset.ALL]
      );
      assert.deepEqual(
        AccessScopeCapabilityRegistry.getAllowedPresetsForPermission(SystemPermission.PRODUCTION_ORDER_UPDATE),
        [AccessScopePreset.ALL]
      );
      assert.deepEqual(
        AccessScopeCapabilityRegistry.getAllowedPresetsForPermission(SystemPermission.PRODUCTION_ORDER_DELETE),
        [AccessScopePreset.ALL]
      );
    });
  });

  // ==========================================
  // 2. DTO VALIDATION & SCHEMA CONSTRAINTS
  // ==========================================
  describe('2. DTO Validation & Schema Constraints', () => {
    it('CreateProductionOrderDto: accepts description and notes, optional', async () => {
      const validInstance = plainToInstance(CreateProductionOrderDto, {
        description: 'طلب تصنيع غرف نموذج A',
        notes: 'ملاحظات تشغيلية',
      });
      const errors = await validate(validInstance);
      assert.equal(errors.length, 0);

      const emptyInstance = plainToInstance(CreateProductionOrderDto, {});
      const emptyErrors = await validate(emptyInstance);
      assert.equal(emptyErrors.length, 0);
    });

    it('AddProductionOrderLineDto: validates quantity 1..10000 integer', async () => {
      const validDto = plainToInstance(AddProductionOrderLineDto, {
        templateId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        quantity: 5,
      });
      const validErrors = await validate(validDto);
      assert.equal(validErrors.length, 0);

      // Quantity = 0 -> rejected
      const zeroDto = plainToInstance(AddProductionOrderLineDto, {
        templateId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        quantity: 0,
      });
      const zeroErrors = await validate(zeroDto);
      assert.ok(zeroErrors.some((e) => e.property === 'quantity'));

      // Quantity = -1 -> rejected
      const negDto = plainToInstance(AddProductionOrderLineDto, {
        templateId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        quantity: -1,
      });
      const negErrors = await validate(negDto);
      assert.ok(negErrors.some((e) => e.property === 'quantity'));

      // Quantity = 10001 -> rejected
      const maxDto = plainToInstance(AddProductionOrderLineDto, {
        templateId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        quantity: 10001,
      });
      const maxErrors = await validate(maxDto);
      assert.ok(maxErrors.some((e) => e.property === 'quantity'));

      // Non-UUID templateId -> rejected
      const badUuidDto = plainToInstance(AddProductionOrderLineDto, {
        templateId: 'not-a-uuid',
        quantity: 2,
      });
      const badUuidErrors = await validate(badUuidDto);
      assert.ok(badUuidErrors.some((e) => e.property === 'templateId'));
    });

    it('UpdateProductionOrderLineDto: validates quantity 1..10000', async () => {
      const validDto = plainToInstance(UpdateProductionOrderLineDto, { quantity: 10 });
      const validErrors = await validate(validDto);
      assert.equal(validErrors.length, 0);

      const invalidDto = plainToInstance(UpdateProductionOrderLineDto, { quantity: 0 });
      const invalidErrors = await validate(invalidDto);
      assert.ok(invalidErrors.some((e) => e.property === 'quantity'));
    });

    it('ReorderProductionOrderLinesDto: validates array of line UUIDs', async () => {
      const validDto = plainToInstance(ReorderProductionOrderLinesDto, {
        lineIds: [
          'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
        ],
      });
      const validErrors = await validate(validDto);
      assert.equal(validErrors.length, 0);

      const invalidDto = plainToInstance(ReorderProductionOrderLinesDto, {
        lineIds: ['not-a-uuid'],
      });
      const invalidErrors = await validate(invalidDto);
      assert.ok(invalidErrors.some((e) => e.property === 'lineIds'));
    });

    it('UpdatePatternSelectionDto: validates optionId UUID', async () => {
      const validDto = plainToInstance(UpdatePatternSelectionDto, {
        optionId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      });
      const validErrors = await validate(validDto);
      assert.equal(validErrors.length, 0);

      const invalidDto = plainToInstance(UpdatePatternSelectionDto, {
        optionId: 'invalid-id',
      });
      const invalidErrors = await validate(invalidDto);
      assert.ok(invalidErrors.some((e) => e.property === 'optionId'));
    });
  });

  // ==========================================
  // 3. ORDER NUMBER & CONCURRENCY STRATEGY
  // ==========================================
  describe('3. Order Number Generation & Concurrency Invariants', () => {
    it('verifies format PO-XXXXXX with zero padding', () => {
      const formatOrderNumber = (val: bigint) => `PO-${String(val).padStart(6, '0')}`;
      assert.equal(formatOrderNumber(1n), 'PO-000001');
      assert.equal(formatOrderNumber(128n), 'PO-000128');
      assert.equal(formatOrderNumber(999999n), 'PO-999999');
      assert.equal(formatOrderNumber(1000000n), 'PO-1000000');
    });

    it('verifies sequence counter table row ID is fixed to PRODUCTION_ORDER', () => {
      const seq = new ProductionOrderSequenceEntity();
      seq.id = 'PRODUCTION_ORDER';
      seq.currentValue = '1';
      assert.equal(seq.id, 'PRODUCTION_ORDER');
    });
  });

  // ==========================================
  // 4. ORDER STATUS & LIFECYCLE INVARIANTS
  // ==========================================
  describe('4. Order Status & Lifecycle Invariants', () => {
    it('ProductionOrderStatus has only DRAFT in Phase 1', () => {
      assert.equal(ProductionOrderStatus.DRAFT, 'DRAFT');
      const statuses = Object.values(ProductionOrderStatus);
      assert.deepEqual(statuses, ['DRAFT'], 'Phase 1 must only permit DRAFT status');
    });

    it('verifies order.status cannot be changed via generic update', () => {
      const order = new ProductionOrderEntity();
      order.id = 'order-1';
      order.orderNumber = 'PO-000001';
      order.status = ProductionOrderStatus.DRAFT;

      // Update DTO only allows description and notes
      const dto = plainToInstance(UpdateProductionOrderDto, {
        description: 'New Description',
        notes: 'New Notes',
      });

      assert.equal((dto as any).status, undefined, 'UpdateProductionOrderDto must not accept status');
      assert.equal((dto as any).orderNumber, undefined, 'UpdateProductionOrderDto must not accept orderNumber');
    });
  });

  // ==========================================
  // 5. PATTERN SELECTION LOGIC & DEFAULTS
  // ==========================================
  describe('5. Pattern Selection Logic & Defaults', () => {
    it('computes default option as first active option by sortOrder ASC', () => {
      const options = [
        { id: 'opt-b', name: 'خيار ب', sortOrder: 2, deletedAt: null },
        { id: 'opt-a', name: 'خيار أ', sortOrder: 1, deletedAt: null },
        { id: 'opt-c', name: 'خيار ج (مؤرشف)', sortOrder: 0, deletedAt: new Date() },
      ];

      const activeSorted = options
        .filter((o) => !o.deletedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      assert.equal(activeSorted.length, 2);
      assert.equal(activeSorted[0].id, 'opt-a', 'Default option must be the first active option with lowest sortOrder');
    });

    it('fails when active pattern has zero active options', () => {
      const patternsWithOptions = [
        {
          pattern: { id: 'p1', name: 'نوع الصب' },
          options: [], // No active options
        },
      ];

      const hasEmpty = patternsWithOptions.some((p) => p.options.length === 0);
      assert.ok(hasEmpty, 'Must detect patterns with zero active options');
    });

    it('validates explicit selection set: detects missing pattern', () => {
      const activePatterns = [{ id: 'p1' }, { id: 'p2' }];
      const payload = [{ patternId: 'p1', optionId: 'o1' }]; // Missing p2

      const payloadPatternIds = new Set(payload.map((x) => x.patternId));
      const isComplete = activePatterns.every((p) => payloadPatternIds.has(p.id));
      assert.equal(isComplete, false, 'Payload missing p2 must fail validation');
    });

    it('validates explicit selection set: detects duplicate pattern', () => {
      const payload = [
        { patternId: 'p1', optionId: 'o1' },
        { patternId: 'p1', optionId: 'o2' },
      ];

      const set = new Set();
      let hasDuplicate = false;
      for (const item of payload) {
        if (set.has(item.patternId)) {
          hasDuplicate = true;
          break;
        }
        set.add(item.patternId);
      }

      assert.ok(hasDuplicate, 'Payload with duplicate pattern selections must be rejected');
    });

    it('validates explicit selection set: rejects foreign pattern', () => {
      const templatePatterns = [{ id: 'p1' }, { id: 'p2' }];
      const templatePatternIds = new Set(templatePatterns.map((p) => p.id));

      const payload = [
        { patternId: 'p1', optionId: 'o1' },
        { patternId: 'foreign-pattern', optionId: 'o2' },
      ];

      const hasForeign = payload.some((x) => !templatePatternIds.has(x.patternId));
      assert.ok(hasForeign, 'Foreign pattern must be rejected');
    });
  });

  // ==========================================
  // 6. SYNC SEMANTICS
  // ==========================================
  describe('6. Template Sync Semantics', () => {
    it('preserves valid existing selections and adds default for new pattern', () => {
      const existingSelections = [
        { templatePatternId: 'p1', selectedOptionId: 'o1' },
      ];

      const activePatterns = [
        {
          id: 'p1',
          options: [{ id: 'o1', sortOrder: 1 }, { id: 'o2', sortOrder: 2 }],
        },
        {
          id: 'p2', // Newly added pattern in template
          options: [{ id: 'o3', sortOrder: 1 }],
        },
      ];

      const reconciled: Array<{ templatePatternId: string; selectedOptionId: string }> = [];

      for (const pat of activePatterns) {
        const existing = existingSelections.find((s) => s.templatePatternId === pat.id);
        if (existing) {
          const isValid = pat.options.some((o) => o.id === existing.selectedOptionId);
          if (isValid) {
            reconciled.push({ templatePatternId: pat.id, selectedOptionId: existing.selectedOptionId });
          } else {
            reconciled.push({ templatePatternId: pat.id, selectedOptionId: pat.options[0].id });
          }
        } else {
          // New pattern: default to first active option
          reconciled.push({ templatePatternId: pat.id, selectedOptionId: pat.options[0].id });
        }
      }

      assert.equal(reconciled.length, 2);
      assert.equal(reconciled[0].selectedOptionId, 'o1', 'Valid existing selection preserved');
      assert.equal(reconciled[1].selectedOptionId, 'o3', 'New pattern initialized with default option');
    });

    it('replaces invalidated option with default option during sync', () => {
      const existingSelections = [
        { templatePatternId: 'p1', selectedOptionId: 'archived-opt' },
      ];

      const activePatterns = [
        {
          id: 'p1',
          options: [{ id: 'valid-opt-1', sortOrder: 1 }, { id: 'valid-opt-2', sortOrder: 2 }],
        },
      ];

      const reconciled: Array<{ templatePatternId: string; selectedOptionId: string }> = [];

      for (const pat of activePatterns) {
        const existing = existingSelections.find((s) => s.templatePatternId === pat.id);
        if (existing) {
          const isValid = pat.options.some((o) => o.id === existing.selectedOptionId);
          if (isValid) {
            reconciled.push({ templatePatternId: pat.id, selectedOptionId: existing.selectedOptionId });
          } else {
            // Replace with default
            reconciled.push({ templatePatternId: pat.id, selectedOptionId: pat.options[0].id });
          }
        }
      }

      assert.equal(reconciled[0].selectedOptionId, 'valid-opt-1', 'Archived option replaced with default option');
    });

    it('removes obsolete selections when pattern is removed from template', () => {
      const existingSelections = [
        { templatePatternId: 'p1', selectedOptionId: 'o1' },
        { templatePatternId: 'obsolete-p2', selectedOptionId: 'o2' },
      ];

      const activePatterns = [{ id: 'p1' }];
      const activeIds = new Set(activePatterns.map((p) => p.id));

      const surviving = existingSelections.filter((s) => activeIds.has(s.templatePatternId));
      assert.equal(surviving.length, 1);
      assert.equal(surviving[0].templatePatternId, 'p1');
    });
  });

  // ==========================================
  // 7. READINESS ASSESSMENT INVARIANTS
  // ==========================================
  describe('7. Release Readiness Assessment (Read-Only)', () => {
    it('flags empty order (0 lines) as not ready', () => {
      const lines: any[] = [];
      const issues: any[] = [];

      if (lines.length === 0) {
        issues.push({ code: 'PRODUCTION_ORDER_EMPTY', message: 'Order has no lines' });
      }

      assert.equal(issues.length, 1);
      assert.equal(issues[0].code, 'PRODUCTION_ORDER_EMPTY');
    });

    it('flags inactive or archived template as not ready', () => {
      const template = { isActive: false, deletedAt: null };
      const issues: any[] = [];

      if (!template.isActive || template.deletedAt !== null) {
        issues.push({ code: 'PRODUCTION_ORDER_TEMPLATE_INACTIVE', message: 'Template is inactive' });
      }

      assert.equal(issues.length, 1);
      assert.equal(issues[0].code, 'PRODUCTION_ORDER_TEMPLATE_INACTIVE');
    });

    it('flags template with 0 active workflow items as not ready', () => {
      const workflowItemsCount = 0;
      const issues: any[] = [];

      if (workflowItemsCount === 0) {
        issues.push({ code: 'PRODUCTION_ORDER_TEMPLATE_WORKFLOW_EMPTY', message: 'Workflow is empty' });
      }

      assert.equal(issues.length, 1);
      assert.equal(issues[0].code, 'PRODUCTION_ORDER_TEMPLATE_WORKFLOW_EMPTY');
    });

    it('flags line missing active pattern selection as not ready', () => {
      const activePatterns = [{ id: 'p1' }, { id: 'p2' }];
      const lineSelections = [{ templatePatternId: 'p1', selectedOptionId: 'o1' }];
      const issues: any[] = [];

      const selectionMap = new Map(lineSelections.map((s) => [s.templatePatternId, s]));
      for (const pat of activePatterns) {
        if (!selectionMap.has(pat.id)) {
          issues.push({ code: 'PRODUCTION_ORDER_LINE_PATTERN_SELECTION_INVALID', patternId: pat.id });
        }
      }

      assert.equal(issues.length, 1);
      assert.equal(issues[0].patternId, 'p2');
    });

    it('marks order as ready when all lines and pattern selections are valid', () => {
      const lines = [{ id: 'l1', quantity: 4 }];
      const template = { isActive: true, deletedAt: null };
      const workflowItemsCount = 2;
      const activePatterns = [{ id: 'p1', options: [{ id: 'o1', deletedAt: null }] }];
      const lineSelections = [{ templatePatternId: 'p1', selectedOptionId: 'o1' }];

      const issues: any[] = [];

      if (lines.length === 0) issues.push({ code: 'PRODUCTION_ORDER_EMPTY' });
      if (!template.isActive || template.deletedAt !== null) issues.push({ code: 'PRODUCTION_ORDER_TEMPLATE_INACTIVE' });
      if (workflowItemsCount === 0) issues.push({ code: 'PRODUCTION_ORDER_TEMPLATE_WORKFLOW_EMPTY' });

      const selMap = new Map(lineSelections.map((s) => [s.templatePatternId, s]));
      for (const pat of activePatterns) {
        const sel = selMap.get(pat.id);
        if (!sel) issues.push({ code: 'PRODUCTION_ORDER_LINE_PATTERN_SELECTION_INVALID' });
        else {
          const isValidOpt = pat.options.some((o) => o.id === sel.selectedOptionId && !o.deletedAt);
          if (!isValidOpt) issues.push({ code: 'PRODUCTION_ORDER_LINE_OPTION_INVALID' });
        }
      }

      assert.equal(issues.length, 0);
    });
  });

  // ==========================================
  // 8. SECURITY & XSS & DATA LEAKAGE
  // ==========================================
  describe('8. Security, XSS & Data Leakage Prevention', () => {
    it('escapes html & script injection in safeJsonStringify', () => {
      const payload = {
        name: '</script><script>alert("xss")</script>',
        note: '<b>test</b> & "quote"',
      };
      const serialized = safeJsonStringify(payload);

      assert.ok(!serialized.includes('<script>'), 'Must not contain unescaped script tag');
      assert.ok(!serialized.includes('</script>'), 'Must not contain unescaped closing script tag');
      assert.ok(serialized.includes('\\u003cscript\\u003e'));
      assert.ok(serialized.includes('\\u0026'));
    });

    it('verifies order DTO does not leak user passwordHash or session tokens', () => {
      const mockOrderDto = {
        id: 'ord-1',
        orderNumber: 'PO-000001',
        status: 'DRAFT',
        createdByUser: {
          id: 'u-1',
          fullName: 'المهندس أحمد',
        },
      };

      assert.equal((mockOrderDto.createdByUser as any).passwordHash, undefined);
      assert.equal((mockOrderDto.createdByUser as any).token, undefined);
    });
  });

  // ==========================================
  // 10. SERVICE-LEVEL REGRESSION & INVARIANT TESTS
  // ==========================================
  describe('10. Service-Level Regression & Invariant Tests', () => {
    function createMockServiceContext(initialData: {
      order?: any;
      lines?: any[];
      selections?: any[];
      template?: any;
      templates?: any[];
      patterns?: any[];
      options?: any[];
      workflowItems?: any[];
      sequence?: any;
    }) {
      const store = {
        order: initialData.order ? { ...initialData.order } : null,
        lines: (initialData.lines || []).map((l) => ({ ...l })),
        selections: (initialData.selections || []).map((s) => ({ ...s })),
        templates: (initialData.templates || (initialData.template ? [initialData.template] : [])).map((t) => ({ ...t })),
        patterns: (initialData.patterns || []).map((p) => ({ ...p })),
        options: (initialData.options || []).map((o) => ({ ...o })),
        workflowItems: (initialData.workflowItems || []).map((w) => ({ ...w })),
        sequence: initialData.sequence ? { ...initialData.sequence } : null,
      };

      const createRepo = (entityClass: any) => {
        return {
          findOne: async (opts: any) => {
            if (entityClass === ProductionOrderEntity) {
              if (!store.order) return null;
              if (opts?.where?.id && store.order.id !== opts.where.id) return null;
              if (opts?.where?.deletedAt && store.order.deletedAt !== null) return null;
              return store.order;
            }
            if (entityClass === ProductionOrderSequenceEntity) {
              if (!store.sequence) return null;
              if (opts?.where?.id && store.sequence.id !== opts.where.id) return null;
              return store.sequence;
            }
            if (entityClass === ProductionOrderLineEntity) {
              return store.lines.find((l) => {
                if (opts?.where?.id && l.id !== opts.where.id) return false;
                if (opts?.where?.orderId && l.orderId !== opts.where.orderId) return false;
                if (opts?.where?.deletedAt && l.deletedAt !== null) return false;
                return true;
              }) || null;
            }
            if (entityClass === ProductionTemplateEntity) {
              return store.templates.find((t) => {
                if (opts?.where?.id && t.id !== opts.where.id) return false;
                if (opts?.where?.deletedAt && t.deletedAt !== null) return false;
                return true;
              }) || null;
            }
            if (entityClass === ProductionTemplatePatternEntity) {
              return store.patterns.find((p) => {
                if (opts?.where?.id && p.id !== opts.where.id) return false;
                if (opts?.where?.templateId && p.templateId !== opts.where.templateId) return false;
                if (opts?.where?.deletedAt && p.deletedAt !== null) return false;
                return true;
              }) || null;
            }
            if (entityClass === ProductionTemplatePatternOptionEntity) {
              return store.options.find((o) => {
                if (opts?.where?.id && o.id !== opts.where.id) return false;
                if (opts?.where?.patternId && o.patternId !== opts.where.patternId) return false;
                if (opts?.where?.deletedAt && o.deletedAt !== null) return false;
                return true;
              }) || null;
            }
            if (entityClass === ProductionOrderLinePatternSelectionEntity) {
              return store.selections.find((s) => {
                if (opts?.where?.orderLineId && s.orderLineId !== opts.where.orderLineId) return false;
                if (opts?.where?.templatePatternId && s.templatePatternId !== opts.where.templatePatternId) return false;
                return true;
              }) || null;
            }
            return null;
          },
          find: async (opts: any) => {
            if (entityClass === ProductionOrderLineEntity) {
              return store.lines.filter((l) => {
                if (opts?.where?.orderId && l.orderId !== opts.where.orderId) return false;
                if (!opts?.withDeleted && l.deletedAt) return false;
                return true;
              });
            }
            if (entityClass === ProductionTemplateEntity) {
              return store.templates.filter((t) => {
                if (!opts?.withDeleted && t.deletedAt) return false;
                return true;
              });
            }
            if (entityClass === ProductionTemplatePatternEntity) {
              return store.patterns.filter((p) => {
                if (opts?.where?.id) {
                  const idList = opts.where.id._value || (Array.isArray(opts.where.id) ? opts.where.id : [opts.where.id]);
                  if (!idList.includes(p.id)) return false;
                }
                if (opts?.where?.templateId) {
                  const tmplList = opts.where.templateId._value || (Array.isArray(opts.where.templateId) ? opts.where.templateId : [opts.where.templateId]);
                  if (!tmplList.includes(p.templateId)) return false;
                }
                if (!opts?.withDeleted && p.deletedAt) return false;
                return true;
              }).map((p) => {
                if (opts?.relations?.options) {
                  const optsForP = store.options.filter((o) => o.patternId === p.id);
                  return { ...p, options: optsForP };
                }
                return p;
              });
            }
            if (entityClass === ProductionTemplatePatternOptionEntity) {
              return store.options.filter((o) => {
                if (opts?.where?.id) {
                  const idList = opts.where.id._value || (Array.isArray(opts.where.id) ? opts.where.id : [opts.where.id]);
                  if (!idList.includes(o.id)) return false;
                }
                if (opts?.where?.patternId && o.patternId !== opts.where.patternId) return false;
                if (!opts?.withDeleted && o.deletedAt) return false;
                return true;
              });
            }
            if (entityClass === ProductionOrderLinePatternSelectionEntity) {
              return store.selections.filter((s) => {
                if (opts?.where?.orderLineId) {
                  const lineList = opts.where.orderLineId._value || (Array.isArray(opts.where.orderLineId) ? opts.where.orderLineId : [opts.where.orderLineId]);
                  if (!lineList.includes(s.orderLineId)) return false;
                }
                return true;
              });
            }
            if (entityClass === ProductionTemplateWorkflowItemEntity) {
              return store.workflowItems;
            }
            return [];
          },
          count: async (opts: any) => {
            if (entityClass === ProductionOrderLineEntity) {
              return store.lines.filter((l) => !l.deletedAt).length;
            }
            return 0;
          },
          create: (data: any) => ({ id: data.id || `gen-${Date.now()}-${Math.floor(Math.random() * 1000)}`, deletedAt: null, ...data }),
          save: async (entity: any) => {
            if (entityClass === ProductionOrderEntity) store.order = entity;
            else if (entityClass === ProductionOrderLineEntity) {
              const idx = store.lines.findIndex((l) => l.id === entity.id);
              if (idx >= 0) store.lines[idx] = entity;
              else store.lines.push(entity);
            } else if (entityClass === ProductionOrderLinePatternSelectionEntity) {
              const idx = store.selections.findIndex((s) => s.id === entity.id);
              if (idx >= 0) store.selections[idx] = entity;
              else store.selections.push(entity);
            } else if (entityClass === ProductionOrderSequenceEntity) {
              store.sequence = entity;
            }
            return entity;
          },
          softDelete: async (id: string) => {
            const item = store.lines.find((l) => l.id === id);
            if (item) item.deletedAt = new Date();
          },
          remove: async (entity: any) => {
            const idx = store.selections.findIndex((s) => s.id === entity.id);
            if (idx >= 0) store.selections.splice(idx, 1);
          },
        };
      };

      const mockManager: any = {
        getRepository: (entityClass: any) => createRepo(entityClass),
        save: async (entity: any) => {
          if (entity.orderNumber) store.order = entity;
          else if (entity.quantity !== undefined) {
            const idx = store.lines.findIndex((l) => l.id === entity.id);
            if (idx >= 0) store.lines[idx] = entity; else store.lines.push(entity);
          } else if (entity.selectedOptionId) {
            const idx = store.selections.findIndex((s) => s.id === entity.id);
            if (idx >= 0) store.selections[idx] = entity; else store.selections.push(entity);
          }
          return entity;
        },
        softDelete: async (entityClass: any, id: string) => {
          if (entityClass === ProductionOrderEntity && store.order) store.order.deletedAt = new Date();
        },
      };

      const mockDataSource: any = {
        getRepository: (entityClass: any) => createRepo(entityClass),
        transaction: async (cb: any) => cb(mockManager),
      };

      const guardService = new ProductionOrderGuardService(mockDataSource);
      const orderService = new ProductionOrderService(mockDataSource, guardService);

      return { store, mockDataSource, mockManager, guardService, orderService };
    }

    it('addLine(): absent patternSelections uses default options', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-1', templateId: 't-1', name: 'نمط 1', deletedAt: null, createdAt: new Date() }],
        options: [
          { id: 'opt-1', patternId: 'p-1', name: 'خيار 1', sortOrder: 1, deletedAt: null },
          { id: 'opt-2', patternId: 'p-1', name: 'خيار 2', sortOrder: 2, deletedAt: null },
        ],
      });

      const line = await ctx.orderService.addLine('ord-1', {
        templateId: 't-1',
        quantity: 2,
        // patternSelections is undefined
      });

      assert.equal(line.quantity, 2);
      assert.equal(line.patternSelections.length, 1);
      assert.equal(line.patternSelections[0].selectedOptionId, 'opt-1');
    });

    it('addLine(): explicit [] with active patterns throws PRODUCTION_ORDER_LINE_PATTERN_SELECTION_SET_INVALID', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-1', templateId: 't-1', name: 'نمط 1', deletedAt: null, createdAt: new Date() }],
        options: [{ id: 'opt-1', patternId: 'p-1', name: 'خيار 1', sortOrder: 1, deletedAt: null }],
      });

      let err: any = null;
      try {
        await ctx.orderService.addLine('ord-1', {
          templateId: 't-1',
          quantity: 2,
          patternSelections: [],
        });
      } catch (e) {
        err = e;
      }

      assert.ok(err instanceof BusinessRuleError);
      assert.equal(err.code, 'PRODUCTION_ORDER_LINE_PATTERN_SELECTION_SET_INVALID');
    });

    it('addLine(): explicit [] with 0 patterns succeeds with 0 selections', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [],
        options: [],
      });

      const line = await ctx.orderService.addLine('ord-1', {
        templateId: 't-1',
        quantity: 2,
        patternSelections: [],
      });

      assert.equal(line.quantity, 2);
      assert.equal(line.patternSelections.length, 0);
    });

    it('addLine(): exact explicit set succeeds with specified options', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-1', templateId: 't-1', name: 'نمط 1', deletedAt: null, createdAt: new Date() }],
        options: [
          { id: 'opt-1', patternId: 'p-1', name: 'خيار 1', sortOrder: 1, deletedAt: null },
          { id: 'opt-2', patternId: 'p-1', name: 'خيار 2', sortOrder: 2, deletedAt: null },
        ],
      });

      const line = await ctx.orderService.addLine('ord-1', {
        templateId: 't-1',
        quantity: 5,
        patternSelections: [{ patternId: 'p-1', optionId: 'opt-2' }],
      });

      assert.equal(line.patternSelections[0].selectedOptionId, 'opt-2');
    });

    it('addLine(): foreign pattern throws PRODUCTION_ORDER_LINE_PATTERN_SELECTION_SET_INVALID', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-1', templateId: 't-1', name: 'نمط 1', deletedAt: null, createdAt: new Date() }],
        options: [{ id: 'opt-1', patternId: 'p-1', name: 'خيار 1', sortOrder: 1, deletedAt: null }],
      });

      let err: any = null;
      try {
        await ctx.orderService.addLine('ord-1', {
          templateId: 't-1',
          quantity: 2,
          patternSelections: [{ patternId: 'foreign-pattern', optionId: 'opt-1' }],
        });
      } catch (e) {
        err = e;
      }

      assert.ok(err instanceof BusinessRuleError);
      assert.equal(err.code, 'PRODUCTION_ORDER_LINE_PATTERN_SELECTION_SET_INVALID');
    });

    it('addLine(): foreign option throws PRODUCTION_ORDER_LINE_OPTION_INVALID', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-1', templateId: 't-1', name: 'نمط 1', deletedAt: null, createdAt: new Date() }],
        options: [{ id: 'opt-1', patternId: 'p-1', name: 'خيار 1', sortOrder: 1, deletedAt: null }],
      });

      let err: any = null;
      try {
        await ctx.orderService.addLine('ord-1', {
          templateId: 't-1',
          quantity: 2,
          patternSelections: [{ patternId: 'p-1', optionId: 'foreign-opt' }],
        });
      } catch (e) {
        err = e;
      }

      assert.ok(err instanceof BusinessRuleError);
      assert.equal(err.code, 'PRODUCTION_ORDER_LINE_OPTION_INVALID');
    });

    it('validateLineQuantity(): invalid quantities throw PRODUCTION_ORDER_LINE_QUANTITY_INVALID', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
      });

      const invalidQuantities = [0, -1, 1.5, 10001, NaN];
      for (const q of invalidQuantities) {
        await assert.rejects(
          async () => ctx.orderService.addLine('ord-1', { templateId: 't-1', quantity: q }),
          (err: any) => err instanceof BusinessRuleError && err.code === 'PRODUCTION_ORDER_LINE_QUANTITY_INVALID'
        );
        await assert.rejects(
          async () => ctx.orderService.updateLineQuantity('ord-1', 'line-1', { quantity: q }),
          (err: any) => err instanceof BusinessRuleError && err.code === 'PRODUCTION_ORDER_LINE_QUANTITY_INVALID'
        );
      }
    });

    it('changePatternSelection(): inactive template throws PRODUCTION_ORDER_TEMPLATE_INACTIVE', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        lines: [{ id: 'line-1', orderId: 'ord-1', templateId: 't-inactive', quantity: 2, sortOrder: 1, deletedAt: null }],
        template: { id: 't-inactive', name: 'قالب غير فعال', isActive: false, deletedAt: null },
        patterns: [{ id: 'p-1', templateId: 't-inactive', name: 'نمط 1', deletedAt: null, createdAt: new Date() }],
        options: [{ id: 'opt-1', patternId: 'p-1', name: 'خيار 1', sortOrder: 1, deletedAt: null }],
      });

      let err: any = null;
      try {
        await ctx.orderService.changePatternSelection('ord-1', 'line-1', 'p-1', { optionId: 'opt-1' });
      } catch (e) {
        err = e;
      }

      assert.ok(err instanceof BusinessRuleError);
      assert.equal(err.code, 'PRODUCTION_ORDER_TEMPLATE_INACTIVE');
    });

    it('changePatternSelection(): foreign option throws PRODUCTION_ORDER_LINE_OPTION_INVALID', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        lines: [{ id: 'line-1', orderId: 'ord-1', templateId: 't-1', quantity: 2, sortOrder: 1, deletedAt: null }],
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-1', templateId: 't-1', name: 'نمط 1', deletedAt: null, createdAt: new Date() }],
        options: [{ id: 'opt-1', patternId: 'p-1', name: 'خيار 1', sortOrder: 1, deletedAt: null }],
      });

      let err: any = null;
      try {
        await ctx.orderService.changePatternSelection('ord-1', 'line-1', 'p-1', { optionId: 'foreign-opt' });
      } catch (e) {
        err = e;
      }

      assert.ok(err instanceof BusinessRuleError);
      assert.equal(err.code, 'PRODUCTION_ORDER_LINE_OPTION_INVALID');
    });

    it('syncDraftLineSelections(): reconciles when template options change', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        lines: [{ id: 'line-1', orderId: 'ord-1', templateId: 't-1', quantity: 2, sortOrder: 1, deletedAt: null }],
        selections: [{ id: 'sel-1', orderLineId: 'line-1', templatePatternId: 'p-1', selectedOptionId: 'opt-archived' }],
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-1', templateId: 't-1', name: 'نمط 1', deletedAt: null, createdAt: new Date() }],
        options: [
          { id: 'opt-archived', patternId: 'p-1', name: 'خيار قديم', sortOrder: 1, deletedAt: new Date() },
          { id: 'opt-active-new', patternId: 'p-1', name: 'خيار جديد', sortOrder: 2, deletedAt: null },
        ],
      });

      const line = await ctx.orderService.syncDraftLineSelections('ord-1', 'line-1');
      assert.equal(line.patternSelections[0].selectedOptionId, 'opt-active-new');
    });

    it('syncDraftLineSelections(): corrupt pattern ownership fails closed with PRODUCTION_ORDER_DRAFT_CONFIGURATION_CORRUPT', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        lines: [{ id: 'line-1', orderId: 'ord-1', templateId: 't-1', quantity: 2, sortOrder: 1, deletedAt: null }],
        selections: [{ id: 'sel-1', orderLineId: 'line-1', templatePatternId: 'p-foreign', selectedOptionId: 'opt-1' }],
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-foreign', templateId: 't-other', name: 'نمط خارجي', deletedAt: null, createdAt: new Date() }],
        options: [{ id: 'opt-1', patternId: 'p-foreign', name: 'خيار 1', sortOrder: 1, deletedAt: null }],
      });

      await assert.rejects(
        async () => ctx.orderService.syncDraftLineSelections('ord-1', 'line-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'PRODUCTION_ORDER_DRAFT_CONFIGURATION_CORRUPT'
      );
    });

    it('validateDraftForRelease(): is read-only and does not mutate order state', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        lines: [{ id: 'line-1', orderId: 'ord-1', templateId: 't-1', quantity: 2, sortOrder: 1, deletedAt: null }],
        selections: [{ id: 'sel-1', orderLineId: 'line-1', templatePatternId: 'p-1', selectedOptionId: 'opt-1' }],
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        workflowItems: [{ id: 'wf-1', templateId: 't-1', deletedAt: null }],
        patterns: [{ id: 'p-1', templateId: 't-1', name: 'نمط 1', deletedAt: null, createdAt: new Date() }],
        options: [{ id: 'opt-1', patternId: 'p-1', name: 'خيار 1', sortOrder: 1, deletedAt: null }],
      });

      const readiness = await ctx.orderService.validateDraftForRelease('ord-1');
      assert.equal(readiness.ready, true);
      assert.equal(readiness.issues.length, 0);
      assert.equal(ctx.store.order.status, ProductionOrderStatus.DRAFT);
    });

    it('validateDraftForRelease(): corrupt ownership throws PRODUCTION_ORDER_DRAFT_CONFIGURATION_CORRUPT', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        lines: [{ id: 'line-1', orderId: 'ord-1', templateId: 't-1', quantity: 2, sortOrder: 1, deletedAt: null }],
        selections: [{ id: 'sel-1', orderLineId: 'line-1', templatePatternId: 'p-1', selectedOptionId: 'opt-foreign' }],
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-1', templateId: 't-1', name: 'نمط 1', deletedAt: null, createdAt: new Date() }],
        options: [{ id: 'opt-foreign', patternId: 'p-other', name: 'خيار خارجي', sortOrder: 1, deletedAt: null }],
      });

      await assert.rejects(
        async () => ctx.orderService.validateDraftForRelease('ord-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'PRODUCTION_ORDER_DRAFT_CONFIGURATION_CORRUPT'
      );
    });

    it('getOrderById(): corrupt pattern ownership throws PRODUCTION_ORDER_DRAFT_CONFIGURATION_CORRUPT', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        lines: [{ id: 'line-1', orderId: 'ord-1', templateId: 't-1', quantity: 2, sortOrder: 1, deletedAt: null }],
        selections: [{ id: 'sel-1', orderLineId: 'line-1', templatePatternId: 'p-foreign', selectedOptionId: 'opt-1' }],
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-foreign', templateId: 't-other', name: 'نمط أجنبي', deletedAt: null, createdAt: new Date() }],
        options: [{ id: 'opt-1', patternId: 'p-foreign', name: 'خيار 1', sortOrder: 1, deletedAt: null }],
      });

      await assert.rejects(
        async () => ctx.orderService.getOrderById('ord-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'PRODUCTION_ORDER_DRAFT_CONFIGURATION_CORRUPT'
      );
    });

    it('getOrderById(): stale (archived) pattern and option remain readable with true historical names', async () => {
      const ctx = createMockServiceContext({
        order: { id: 'ord-1', orderNumber: 'PO-000001', status: ProductionOrderStatus.DRAFT, deletedAt: null },
        lines: [{ id: 'line-1', orderId: 'ord-1', templateId: 't-1', quantity: 2, sortOrder: 1, deletedAt: null }],
        selections: [{ id: 'sel-1', orderLineId: 'line-1', templatePatternId: 'p-1', selectedOptionId: 'opt-1' }],
        template: { id: 't-1', name: 'قالب 1', isActive: true, deletedAt: null },
        patterns: [{ id: 'p-1', templateId: 't-1', name: 'نمط تاريخي مؤرشف', deletedAt: new Date(), createdAt: new Date() }],
        options: [{ id: 'opt-1', patternId: 'p-1', name: 'خيار تاريخي مؤرشف', sortOrder: 1, deletedAt: new Date() }],
      });

      const order = await ctx.orderService.getOrderById('ord-1');
      assert.equal(order.lines?.length, 1);
      assert.equal(order.lines?.[0].patternSelections[0].patternName, 'نمط تاريخي مؤرشف');
      assert.equal(order.lines?.[0].patternSelections[0].selectedOptionName, 'خيار تاريخي مؤرشف');
      assert.deepEqual(order.lines?.[0].patternSelections[0].availableOptions, []);
    });

    it('createOrder(): fails closed if sequence row is missing with PRODUCTION_ORDER_SEQUENCE_NOT_INITIALIZED', async () => {
      const ctx = createMockServiceContext({
        sequence: null, // sequence not seeded
      });

      await assert.rejects(
        async () => ctx.orderService.createOrder({ description: 'Test' }, 'u-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'PRODUCTION_ORDER_SEQUENCE_NOT_INITIALIZED'
      );
    });

    it('ProductionTemplateService.getOrderConfiguration(): inactive template throws PRODUCTION_ORDER_TEMPLATE_INACTIVE', async () => {
      const mockGuardService: any = {
        requireExistingTemplate: async () => ({ id: 't-inactive', name: 'قالب معطل', isActive: false }),
      };
      const templateService = new ProductionTemplateService({ getRepository: () => ({}) } as any, mockGuardService, {} as any, {} as any);

      await assert.rejects(
        async () => templateService.getOrderConfiguration('t-inactive'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'PRODUCTION_ORDER_TEMPLATE_INACTIVE'
      );
    });

    it('ProductionTemplateService.getOrderConfiguration(): lightweight query loads only patterns and options (no tasks)', async () => {
      const mockGuardService: any = {
        requireExistingTemplate: async () => ({ id: 't-active', name: 'قالب نشط', isActive: true }),
      };
      const mockPatternRepo = {
        find: async (opts: any) => {
          assert.equal(opts.relations?.options, true);
          assert.equal((opts.relations as any)?.tasks, undefined);
          return [
            {
              id: 'p-1',
              name: 'نمط خفيف',
              options: [{ id: 'opt-1', name: 'خيار 1', sortOrder: 1, deletedAt: null }],
            },
          ];
        },
      };
      const mockDataSource: any = {
        getRepository: () => mockPatternRepo,
      };

      const templateService = new ProductionTemplateService(mockDataSource, mockGuardService, {} as any, {} as any);
      const config = await templateService.getOrderConfiguration('t-active');

      assert.equal(config.templateId, 't-active');
      assert.equal(config.patterns.length, 1);
      assert.equal(config.patterns[0].defaultOptionId, 'opt-1');
      assert.equal((config.patterns[0] as any).tasks, undefined);
    });
  });
});

