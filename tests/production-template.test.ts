import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import { SystemPermission } from '../src/modules/system/permission/constants/system-permission.enum.js';
import {
  ALL_SYSTEM_PERMISSION_DEFINITIONS,
  SYSTEM_PERMISSION_DEFINITIONS,
} from '../src/modules/system/permission/constants/system-permission.registry.js';
import { AccessScopeCapabilityRegistry } from '../src/modules/system/authorization/access-administration/access-scope-capability.registry.js';
import { AccessScopePreset } from '../src/modules/system/authorization/access-administration/access-scope-preset.constants.js';
import { databaseConfig } from '../src/config/database.config.js';

// DTOs
import { CreateProductionTemplateDto } from '../src/modules/production/template/dto/create-template.dto.js';
import { UpdateProductionTemplateDto } from '../src/modules/production/template/dto/update-template.dto.js';
import { CreateTemplateStageDto } from '../src/modules/production/template-stage/dto/create-stage.dto.js';
import { UpdateTemplateStageDto } from '../src/modules/production/template-stage/dto/update-stage.dto.js';
import { ReorderTemplateStagesDto } from '../src/modules/production/template-stage/dto/reorder-stages.dto.js';
import { CreateTemplateSpecificationDto } from '../src/modules/production/template-specification/dto/create-specification.dto.js';
import { ReorderTemplateSpecificationsDto } from '../src/modules/production/template-specification/dto/reorder-specifications.dto.js';
import { AddTemplateStageMaterialDto } from '../src/modules/production/template-stage-material/dto/add-stage-material.dto.js';
import { UpdateTemplateStageMaterialDto } from '../src/modules/production/template-stage-material/dto/update-stage-material.dto.js';

// Helpers & Types
import { calculateConsecutiveDepartmentGroups } from '../src/modules/production/template-stage/consecutive-department-grouping.helper.js';
import { safeJsonStringify } from '../src/modules/production/template/production-template.types.js';

// Entities
import { ProductionTemplateEntity } from '../src/modules/production/template/production-template.entity.js';
import { ProductionTemplateStageEntity } from '../src/modules/production/template-stage/production-template-stage.entity.js';
import { ProductionTemplateSpecificationEntity } from '../src/modules/production/template-specification/production-template-specification.entity.js';
import { ProductionTemplateStageMaterialEntity } from '../src/modules/production/template-stage-material/production-template-stage-material.entity.js';
import { InventoryProductEntity } from '../src/modules/inventory/product/inventory-product.entity.js';
import { InventoryProductUnitEntity } from '../src/modules/inventory/product/inventory-product-unit.entity.js';

// Services
import { InventoryProductReferenceService } from '../src/modules/inventory/product/inventory-product-reference.service.js';
import { BusinessRuleError } from '../src/common/errors/business-rule.error.js';
import { NotFoundError } from '../src/common/errors/not-found.error.js';

describe('Production Template Core Hardening & Architectural Invariants', () => {
  // =========================================================================
  // 1. Architectural File System & Route Boundaries
  // =========================================================================
  describe('1. Architectural Boundaries & Remnants Cleanliness', () => {
    it('verifies src/modules/studies directory does not exist on disk', () => {
      const studiesModulePath = path.resolve(process.cwd(), 'src/modules/studies');
      assert.strictEqual(
        fs.existsSync(studiesModulePath),
        false,
        'src/modules/studies must not exist. Templates belong to Production Application.'
      );
    });

    it('verifies src/views/dashboard/studies directory does not exist on disk', () => {
      const studiesViewPath = path.resolve(process.cwd(), 'src/views/dashboard/studies');
      assert.strictEqual(
        fs.existsSync(studiesViewPath),
        false,
        'src/views/dashboard/studies must not exist.'
      );
    });

    it('verifies 4 segregated submodules exist under src/modules/production/', () => {
      const baseProd = path.resolve(process.cwd(), 'src/modules/production');
      assert.strictEqual(fs.existsSync(path.join(baseProd, 'template')), true);
      assert.strictEqual(fs.existsSync(path.join(baseProd, 'template-specification')), true);
      assert.strictEqual(fs.existsSync(path.join(baseProd, 'template-stage')), true);
      assert.strictEqual(fs.existsSync(path.join(baseProd, 'template-stage-material')), true);
    });

    it('verifies databaseConfig includes all 4 production template entities and migration 008', () => {
      const entities = (databaseConfig.entities as Function[]).map((e) => e.name);
      assert.ok(entities.includes('ProductionTemplateEntity'));
      assert.ok(entities.includes('ProductionTemplateSpecificationEntity'));
      assert.ok(entities.includes('ProductionTemplateStageEntity'));
      assert.ok(entities.includes('ProductionTemplateStageMaterialEntity'));

      const migrations = (databaseConfig.migrations as Function[]).map((m) => m.name);
      assert.ok(migrations.includes('MigrateStudiesToProductionTemplateTables1710000000008'));
    });
  });

  // =========================================================================
  // 2. Permissions Registry & Capability Scopes
  // =========================================================================
  describe('2. Permissions Registry & Capability Registry Invariants', () => {
    it('defines all 4 production template permissions with correct values', () => {
      assert.strictEqual(SystemPermission.PRODUCTION_TEMPLATE_VIEW, 'production.template.view');
      assert.strictEqual(SystemPermission.PRODUCTION_TEMPLATE_CREATE, 'production.template.create');
      assert.strictEqual(SystemPermission.PRODUCTION_TEMPLATE_UPDATE, 'production.template.update');
      assert.strictEqual(SystemPermission.PRODUCTION_TEMPLATE_DELETE, 'production.template.delete');
    });

    it('registers all 4 production template permissions under module "production"', () => {
      const prodPermissions = ALL_SYSTEM_PERMISSION_DEFINITIONS.filter((p) => p.module === 'production');
      const codes = prodPermissions.map((p) => p.name);

      assert.ok(codes.includes(SystemPermission.PRODUCTION_TEMPLATE_VIEW));
      assert.ok(codes.includes(SystemPermission.PRODUCTION_TEMPLATE_CREATE));
      assert.ok(codes.includes(SystemPermission.PRODUCTION_TEMPLATE_UPDATE));
      assert.ok(codes.includes(SystemPermission.PRODUCTION_TEMPLATE_DELETE));
    });

    it('capability registry explicitly allows [ALL] preset for production template permissions', () => {
      const viewPresets = AccessScopeCapabilityRegistry.getAllowedPresetsForPermission(
        SystemPermission.PRODUCTION_TEMPLATE_VIEW
      );
      assert.deepStrictEqual(viewPresets, [AccessScopePreset.ALL]);

      const createPresets = AccessScopeCapabilityRegistry.getAllowedPresetsForPermission(
        SystemPermission.PRODUCTION_TEMPLATE_CREATE
      );
      assert.deepStrictEqual(createPresets, [AccessScopePreset.ALL]);

      const updatePresets = AccessScopeCapabilityRegistry.getAllowedPresetsForPermission(
        SystemPermission.PRODUCTION_TEMPLATE_UPDATE
      );
      assert.deepStrictEqual(updatePresets, [AccessScopePreset.ALL]);

      const deletePresets = AccessScopeCapabilityRegistry.getAllowedPresetsForPermission(
        SystemPermission.PRODUCTION_TEMPLATE_DELETE
      );
      assert.deepStrictEqual(deletePresets, [AccessScopePreset.ALL]);
    });

    it('capability registry fails closed ([]) for unknown production permissions', () => {
      const unknownPresets = AccessScopeCapabilityRegistry.getAllowedPresetsForPermission(
        'production.unknown_feature.action' as SystemPermission
      );
      assert.deepStrictEqual(unknownPresets, [], 'Unknown production permissions must fail closed to empty presets');
    });
  });

  // =========================================================================
  // 3. DTO Validation Rules
  // =========================================================================
  describe('3. DTO Validation & Input Constraints', () => {
    it('CreateProductionTemplateDto: enforces uppercase code pattern ^[A-Z][A-Z0-9_-]*$', async () => {
      const valid = plainToInstance(CreateProductionTemplateDto, {
        code: 'TPL-ROOM_01',
        name: 'قالب غرفة نموذجية',
      });
      const validErrors = await validate(valid);
      assert.strictEqual(validErrors.length, 0);

      const invalidLower = plainToInstance(CreateProductionTemplateDto, {
        code: 'tpl-room-01',
        name: 'قالب غرفة',
      });
      const lowerErrors = await validate(invalidLower);
      assert.ok(lowerErrors.some((e) => e.property === 'code'));

      const invalidLeadingNumber = plainToInstance(CreateProductionTemplateDto, {
        code: '1TPL',
        name: 'قالب غرفة',
      });
      const leadingNumErrors = await validate(invalidLeadingNumber);
      assert.ok(leadingNumErrors.some((e) => e.property === 'code'));

      const invalidSpace = plainToInstance(CreateProductionTemplateDto, {
        code: 'TPL ROOM',
        name: 'قالب غرفة',
      });
      const spaceErrors = await validate(invalidSpace);
      assert.ok(spaceErrors.some((e) => e.property === 'code'));
    });

    it('UpdateProductionTemplateDto: does not allow code mutation and rejects empty name', async () => {
      const dto = plainToInstance(UpdateProductionTemplateDto, {
        name: 'اسم محدث',
        description: 'وصف جديد',
        referenceNumber: 'REF-001',
        isActive: true,
      });
      const errors = await validate(dto);
      assert.strictEqual(errors.length, 0);

      const invalidDto = plainToInstance(UpdateProductionTemplateDto, {
        name: '',
      });
      const emptyNameErrors = await validate(invalidDto);
      assert.ok(emptyNameErrors.some((e) => e.property === 'name'));
    });

    it('CreateTemplateStageDto: rejects negative estimatedDurationMinutes and estimatedCost', async () => {
      const validStage = plainToInstance(CreateTemplateStageDto, {
        name: 'مرحلة الصب',
        departmentId: 'a0000000-0000-4000-8000-000000000001',
        estimatedDurationMinutes: 120,
        estimatedCost: '500.00',
      });
      const validErrors = await validate(validStage);
      assert.strictEqual(validErrors.length, 0);

      const negativeDuration = plainToInstance(CreateTemplateStageDto, {
        name: 'مرحلة الصب',
        departmentId: 'a0000000-0000-4000-8000-000000000001',
        estimatedDurationMinutes: -10,
        estimatedCost: '500.00',
      });
      const negDurErrors = await validate(negativeDuration);
      assert.ok(negDurErrors.some((e) => e.property === 'estimatedDurationMinutes'));

      const negativeCost = plainToInstance(CreateTemplateStageDto, {
        name: 'مرحلة الصب',
        departmentId: 'a0000000-0000-4000-8000-000000000001',
        estimatedDurationMinutes: 60,
        estimatedCost: '-5.00',
      });
      const negCostErrors = await validate(negativeCost);
      assert.ok(negCostErrors.some((e) => e.property === 'estimatedCost'));
    });

    it('AddTemplateStageMaterialDto: enforces plannedQuantity > 0 decimal string', async () => {
      const validMat = plainToInstance(AddTemplateStageMaterialDto, {
        productId: 'a0000000-0000-4000-8000-000000000001',
        productUnitId: 'a0000000-0000-4000-8000-000000000002',
        plannedQuantity: '10.500000',
      });
      const validErrors = await validate(validMat);
      assert.strictEqual(validErrors.length, 0);

      const zeroQty = plainToInstance(AddTemplateStageMaterialDto, {
        productId: 'a0000000-0000-4000-8000-000000000001',
        productUnitId: 'a0000000-0000-4000-8000-000000000002',
        plannedQuantity: '0',
      });
      const zeroQtyErrors = await validate(zeroQty);
      assert.ok(zeroQtyErrors.some((e) => e.property === 'plannedQuantity'));

      const negQty = plainToInstance(AddTemplateStageMaterialDto, {
        productId: 'a0000000-0000-4000-8000-000000000001',
        productUnitId: 'a0000000-0000-4000-8000-000000000002',
        plannedQuantity: '-5.00',
      });
      const negQtyErrors = await validate(negQty);
      assert.ok(negQtyErrors.some((e) => e.property === 'plannedQuantity'));
    });
  });

  // =========================================================================
  // 4. Consecutive Department Grouping & Dense Stage Ordering
  // =========================================================================
  describe('4. Consecutive Department Grouping Invariants', () => {
    it('returns empty array when stages list is empty', () => {
      const groups = calculateConsecutiveDepartmentGroups([]);
      assert.deepStrictEqual(groups, []);
    });

    it('groups contiguous stages in the same department into one group', () => {
      const stages: any[] = [
        {
          id: 's1',
          name: 'تجهيز القالب',
          sortOrder: 1,
          departmentId: 'dept-carpentry',
          department: { id: 'dept-carpentry', name: 'النجارة والحدادة', code: 'CARP' },
        },
        {
          id: 's2',
          name: 'تسليح الحديد',
          sortOrder: 2,
          departmentId: 'dept-carpentry',
          department: { id: 'dept-carpentry', name: 'النجارة والحدادة', code: 'CARP' },
        },
        {
          id: 's3',
          name: 'صب الخرسانة',
          sortOrder: 3,
          departmentId: 'dept-casting',
          department: { id: 'dept-casting', name: 'الصب', code: 'CAST' },
        },
      ];

      const groups = calculateConsecutiveDepartmentGroups(stages);
      assert.strictEqual(groups.length, 2);
      assert.strictEqual(groups[0].departmentId, 'dept-carpentry');
      assert.strictEqual(groups[0].stages.length, 2);
      assert.strictEqual(groups[1].departmentId, 'dept-casting');
      assert.strictEqual(groups[1].stages.length, 1);
    });

    it('splits non-consecutive occurrences of the same department into distinct groups (A -> B -> A)', () => {
      const stages: any[] = [
        {
          id: 's1',
          sortOrder: 1,
          departmentId: 'dept-A',
          department: { id: 'dept-A', name: 'القسم أ', code: 'DEPT_A' },
        },
        {
          id: 's2',
          sortOrder: 2,
          departmentId: 'dept-B',
          department: { id: 'dept-B', name: 'القسم ب', code: 'DEPT_B' },
        },
        {
          id: 's3',
          sortOrder: 3,
          departmentId: 'dept-A',
          department: { id: 'dept-A', name: 'القسم أ', code: 'DEPT_A' },
        },
      ];

      const groups = calculateConsecutiveDepartmentGroups(stages);
      assert.strictEqual(groups.length, 3, 'A -> B -> A must produce 3 separate consecutive groups');
      assert.strictEqual(groups[0].departmentId, 'dept-A');
      assert.strictEqual(groups[1].departmentId, 'dept-B');
      assert.strictEqual(groups[2].departmentId, 'dept-A');
    });
  });

  // =========================================================================
  // 5. Inventory Reference Boundary & Fail-Closed Planned Material Validation
  // =========================================================================
  describe('5. Inventory Reference Boundary & Fail-Closed Invariants', () => {
    // In-memory mock repositories
    let products: Map<string, InventoryProductEntity>;
    let units: Map<string, InventoryProductUnitEntity>;
    let referenceService: InventoryProductReferenceService;

    const setupMockRepos = () => {
      products = new Map();
      units = new Map();

      const productRepo = {
        findOne: async (options: any) => {
          const where = options?.where || {};
          for (const p of products.values()) {
            if (options?.withDeleted ? false : p.deletedAt) continue;
            let match = true;
            for (const [k, v] of Object.entries(where)) {
              if ((p as any)[k] !== v) {
                match = false;
                break;
              }
            }
            if (match) return p;
          }
          return null;
        },
        createQueryBuilder: () => ({
          where: function () { return this; },
          andWhere: function () { return this; },
          select: function () { return this; },
          orderBy: function () { return this; },
          skip: function () { return this; },
          take: function () { return this; },
          getCount: async () => products.size,
          getMany: async () => Array.from(products.values()),
        }),
      } as unknown as Repository<InventoryProductEntity>;

      const unitRepo = {
        findOne: async (options: any) => {
          const where = options?.where || {};
          for (const u of units.values()) {
            if (options?.withDeleted ? false : u.deletedAt) continue;
            let match = true;
            for (const [k, v] of Object.entries(where)) {
              if ((u as any)[k] !== v) {
                match = false;
                break;
              }
            }
            if (match) return u;
          }
          return null;
        },
        find: async (options: any) => {
          const where = options?.where || {};
          const results: InventoryProductUnitEntity[] = [];
          for (const u of units.values()) {
            if (options?.withDeleted ? false : u.deletedAt) continue;
            let match = true;
            for (const [k, v] of Object.entries(where)) {
              if ((u as any)[k] !== v) {
                match = false;
                break;
              }
            }
            if (match) results.push(u);
          }
          return results;
        },
      } as unknown as Repository<InventoryProductUnitEntity>;

      const mockDataSource = {
        getRepository: (entity: any) => {
          if (entity === InventoryProductEntity) return productRepo;
          if (entity === InventoryProductUnitEntity) return unitRepo;
          return null;
        },
      } as unknown as any;

      referenceService = new InventoryProductReferenceService(mockDataSource, productRepo, unitRepo);
    };

    it('fails closed when product does not exist', async () => {
      setupMockRepos();
      await assert.rejects(
        referenceService.validatePlannedMaterialUnit('missing-prod', 'any-unit'),
        (err: any) => err instanceof NotFoundError && err.code === 'INVENTORY_PRODUCT_NOT_FOUND'
      );
    });

    it('fails closed when product is inactive', async () => {
      setupMockRepos();
      const p = new InventoryProductEntity();
      p.id = 'prod-1';
      p.name = 'حديد 12';
      p.code = 'STEEL_12';
      p.isActive = false;
      p.baseUnitId = 'unit-1';
      p.deletedAt = null;
      products.set(p.id, p);

      await assert.rejects(
        referenceService.validatePlannedMaterialUnit('prod-1', 'unit-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_INACTIVE'
      );
    });

    it('fails closed when product base unit is missing or corrupt', async () => {
      setupMockRepos();
      const p = new InventoryProductEntity();
      p.id = 'prod-1';
      p.name = 'حديد 12';
      p.code = 'STEEL_12';
      p.isActive = true;
      p.baseUnitId = 'missing-base-unit';
      p.deletedAt = null;
      products.set(p.id, p);

      await assert.rejects(
        referenceService.validatePlannedMaterialUnit('prod-1', 'unit-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    });

    it('fails closed when base unit belongs to another product', async () => {
      setupMockRepos();
      const p = new InventoryProductEntity();
      p.id = 'prod-1';
      p.name = 'حديد 12';
      p.code = 'STEEL_12';
      p.isActive = true;
      p.baseUnitId = 'foreign-unit';
      p.deletedAt = null;
      products.set(p.id, p);

      const foreignU = new InventoryProductUnitEntity();
      foreignU.id = 'foreign-unit';
      foreignU.productId = 'prod-2'; // belongs to another product!
      foreignU.deletedAt = null;
      units.set(foreignU.id, foreignU);

      await assert.rejects(
        referenceService.validatePlannedMaterialUnit('prod-1', 'foreign-unit'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    });

    it('fails closed when selected unit belongs to another product', async () => {
      setupMockRepos();
      const p1 = new InventoryProductEntity();
      p1.id = 'prod-1';
      p1.name = 'حديد 12';
      p1.code = 'STEEL_12';
      p1.isActive = true;
      p1.baseUnitId = 'base-1';
      p1.deletedAt = null;
      products.set(p1.id, p1);

      const base1 = new InventoryProductUnitEntity();
      base1.id = 'base-1';
      base1.productId = 'prod-1';
      base1.deletedAt = null;
      units.set(base1.id, base1);

      const foreignUnit = new InventoryProductUnitEntity();
      foreignUnit.id = 'unit-from-other-prod';
      foreignUnit.productId = 'prod-99';
      foreignUnit.isActive = true;
      foreignUnit.deletedAt = null;
      units.set(foreignUnit.id, foreignUnit);

      await assert.rejects(
        referenceService.validatePlannedMaterialUnit('prod-1', 'unit-from-other-prod'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_UNIT_NOT_BELONG_TO_PRODUCT'
      );
    });

    it('fails closed when unit conversion chain has a cycle', async () => {
      setupMockRepos();
      const p1 = new InventoryProductEntity();
      p1.id = 'prod-1';
      p1.name = 'حديد 12';
      p1.code = 'STEEL_12';
      p1.isActive = true;
      p1.baseUnitId = 'base-1';
      p1.deletedAt = null;
      products.set(p1.id, p1);

      const base1 = new InventoryProductUnitEntity();
      base1.id = 'base-1';
      base1.productId = 'prod-1';
      base1.equivalentToUnitId = null;
      base1.deletedAt = null;
      units.set(base1.id, base1);

      // Unit A -> Unit B -> Unit A (Cycle)
      const unitA = new InventoryProductUnitEntity();
      unitA.id = 'unit-A';
      unitA.productId = 'prod-1';
      unitA.isActive = true;
      unitA.equivalentToUnitId = 'unit-B';
      unitA.deletedAt = null;
      units.set(unitA.id, unitA);

      const unitB = new InventoryProductUnitEntity();
      unitB.id = 'unit-B';
      unitB.productId = 'prod-1';
      unitB.isActive = true;
      unitB.equivalentToUnitId = 'unit-A';
      unitB.deletedAt = null;
      units.set(unitB.id, unitB);

      await assert.rejects(
        referenceService.validatePlannedMaterialUnit('prod-1', 'unit-A'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_UNIT_CONVERSION_CYCLE'
      );
    });

    it('fails closed when unit conversion chain does not terminate at base unit', async () => {
      setupMockRepos();
      const p1 = new InventoryProductEntity();
      p1.id = 'prod-1';
      p1.name = 'حديد 12';
      p1.code = 'STEEL_12';
      p1.isActive = true;
      p1.baseUnitId = 'base-1';
      p1.deletedAt = null;
      products.set(p1.id, p1);

      const base1 = new InventoryProductUnitEntity();
      base1.id = 'base-1';
      base1.productId = 'prod-1';
      base1.equivalentToUnitId = null;
      base1.deletedAt = null;
      units.set(base1.id, base1);

      // Unit X has equivalentToUnitId = null, but is NOT the base unit
      const unitX = new InventoryProductUnitEntity();
      unitX.id = 'unit-X';
      unitX.productId = 'prod-1';
      unitX.isActive = true;
      unitX.equivalentToUnitId = null;
      unitX.deletedAt = null;
      units.set(unitX.id, unitX);

      await assert.rejects(
        referenceService.validatePlannedMaterialUnit('prod-1', 'unit-X'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_UNIT_CONVERSION_INCONSISTENT'
      );
    });

    it('succeeds and returns clean reference DTO for valid base unit', async () => {
      setupMockRepos();
      const p1 = new InventoryProductEntity();
      p1.id = 'prod-1';
      p1.name = 'حديد 12';
      p1.code = 'STEEL_12';
      p1.isActive = true;
      p1.baseUnitId = 'base-1';
      p1.deletedAt = null;
      products.set(p1.id, p1);

      const base1 = new InventoryProductUnitEntity();
      base1.id = 'base-1';
      base1.productId = 'prod-1';
      base1.name = 'طن';
      base1.isActive = true;
      base1.equivalentToUnitId = null;
      base1.deletedAt = null;
      units.set(base1.id, base1);

      const result = await referenceService.validatePlannedMaterialUnit('prod-1', 'base-1');
      assert.deepStrictEqual(result, {
        product: {
          id: 'prod-1',
          name: 'حديد 12',
          code: 'STEEL_12',
        },
        unit: {
          id: 'base-1',
          name: 'طن',
          isBase: true,
        },
      });
    });

    it('succeeds and returns clean reference DTO for additional unit converting to base unit', async () => {
      setupMockRepos();
      const p1 = new InventoryProductEntity();
      p1.id = 'prod-1';
      p1.name = 'حديد 12';
      p1.code = 'STEEL_12';
      p1.isActive = true;
      p1.baseUnitId = 'base-1';
      p1.deletedAt = null;
      products.set(p1.id, p1);

      const base1 = new InventoryProductUnitEntity();
      base1.id = 'base-1';
      base1.productId = 'prod-1';
      base1.name = 'طن';
      base1.isActive = true;
      base1.equivalentToUnitId = null;
      base1.deletedAt = null;
      units.set(base1.id, base1);

      const bundleUnit = new InventoryProductUnitEntity();
      bundleUnit.id = 'bundle-1';
      bundleUnit.productId = 'prod-1';
      bundleUnit.name = 'حزمة 2 طن';
      bundleUnit.isActive = true;
      bundleUnit.equivalentToUnitId = 'base-1';
      bundleUnit.deletedAt = null;
      units.set(bundleUnit.id, bundleUnit);

      const result = await referenceService.validatePlannedMaterialUnit('prod-1', 'bundle-1');
      assert.deepStrictEqual(result, {
        product: {
          id: 'prod-1',
          name: 'حديد 12',
          code: 'STEEL_12',
        },
        unit: {
          id: 'bundle-1',
          name: 'حزمة 2 طن',
          isBase: false,
        },
      });
    });
  });

  // =========================================================================
  // 6. Stored XSS Prevention & Safe JSON Serialization
  // =========================================================================
  describe('6. Stored XSS Prevention & Safe JSON Serialization', () => {
    it('escapes script tags and html characters in safeJsonStringify', () => {
      const maliciousPayload = {
        name: '</script><script>alert("xss")</script>',
        description: '<img src=x onerror=alert(1)> & "hello"',
        lineTerminator: 'test\u2028line\u2029split',
      };

      const serialized = safeJsonStringify(maliciousPayload);

      // Verify that literal <, >, & and line separators are escaped
      assert.strictEqual(serialized.includes('<'), false, 'Serialized string must not contain unescaped <');
      assert.strictEqual(serialized.includes('>'), false, 'Serialized string must not contain unescaped >');
      assert.strictEqual(serialized.includes('&'), false, 'Serialized string must not contain unescaped &');
      assert.strictEqual(serialized.includes('\u2028'), false, 'Serialized string must not contain unescaped \\u2028');
      assert.strictEqual(serialized.includes('\u2029'), false, 'Serialized string must not contain unescaped \\u2029');

      // Verify JSON.parse recovers original text correctly
      const parsed = JSON.parse(serialized);
      assert.strictEqual(parsed.name, '</script><script>alert("xss")</script>');
      assert.strictEqual(parsed.description, '<img src=x onerror=alert(1)> & "hello"');
    });
  });
});
