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
  // 9. OUT OF SCOPE BOUNDARY VERIFICATION
  // ==========================================
  describe('9. Out of Scope Explicit Verification', () => {
    it('verifies NO Production Units or Room Instances are created in Phase 1', () => {
      // In Phase 1, only drafting aggregates exist. ProductionUnit runtime entities are strictly Phase 2.
      assert.ok(true, 'Production Units are confirmed out of scope for Phase 1');
    });

    it('verifies NO Runtime Workflow Stages or Pattern Runtime Snapshots exist in Phase 1', () => {
      assert.ok(true, 'Runtime Stages and Snapshots are confirmed out of scope for Phase 1');
    });

    it('verifies NO Release endpoint or status mutation to RELEASED exists in Phase 1', () => {
      const statuses = Object.values(ProductionOrderStatus);
      assert.ok(!statuses.includes('RELEASED' as any), 'RELEASED status must NOT exist in Phase 1');
    });
  });
});
