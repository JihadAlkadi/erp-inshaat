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
import { UpdateTemplateSpecificationDto } from '../src/modules/production/template-specification/dto/update-specification.dto.js';
import { ReorderTemplateSpecificationsDto } from '../src/modules/production/template-specification/dto/reorder-specifications.dto.js';
import { AddTemplateStageMaterialDto } from '../src/modules/production/template-stage-material/dto/add-stage-material.dto.js';
import { UpdateTemplateStageMaterialDto } from '../src/modules/production/template-stage-material/dto/update-stage-material.dto.js';
import { UpdateStageAttachmentDto } from '../src/modules/production/template-stage-attachment/dto/update-stage-attachment.dto.js';
import { ReorderStageAttachmentsDto } from '../src/modules/production/template-stage-attachment/dto/reorder-stage-attachments.dto.js';

// Helpers & Types
import { calculateConsecutiveDepartmentGroups } from '../src/modules/production/template-stage/consecutive-department-grouping.helper.js';
import { safeJsonStringify } from '../src/modules/production/template/production-template.types.js';
import { toStageMaterialDto } from '../src/modules/production/template-stage-material/production-template-stage-material.types.js';
import { toStageAttachmentDto } from '../src/modules/production/template-stage-attachment/production-template-stage-attachment.types.js';

// Entities
import { ProductionTemplateEntity } from '../src/modules/production/template/production-template.entity.js';
import { ProductionTemplateStageEntity } from '../src/modules/production/template-stage/production-template-stage.entity.js';
import { ProductionTemplateSpecificationEntity } from '../src/modules/production/template-specification/production-template-specification.entity.js';
import { ProductionTemplateStageMaterialEntity } from '../src/modules/production/template-stage-material/production-template-stage-material.entity.js';
import { ProductionTemplateStageAttachmentEntity } from '../src/modules/production/template-stage-attachment/production-template-stage-attachment.entity.js';
import { InventoryProductEntity } from '../src/modules/inventory/product/inventory-product.entity.js';
import { InventoryProductUnitEntity } from '../src/modules/inventory/product/inventory-product-unit.entity.js';

// Services
import { InventoryProductReferenceService } from '../src/modules/inventory/product/inventory-product-reference.service.js';
import {
  TemplateStageAttachmentStorageService,
  ATTACHMENT_MAX_FILE_SIZE_BYTES,
} from '../src/modules/production/template-stage-attachment/template-stage-attachment-storage.service.js';
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

    it('verifies 5 segregated submodules exist under src/modules/production/', () => {
      const baseProd = path.resolve(process.cwd(), 'src/modules/production');
      assert.strictEqual(fs.existsSync(path.join(baseProd, 'template')), true);
      assert.strictEqual(fs.existsSync(path.join(baseProd, 'template-specification')), true);
      assert.strictEqual(fs.existsSync(path.join(baseProd, 'template-stage')), true);
      assert.strictEqual(fs.existsSync(path.join(baseProd, 'template-stage-material')), true);
      assert.strictEqual(fs.existsSync(path.join(baseProd, 'template-stage-attachment')), true);
    });

    it('verifies databaseConfig includes all 5 production template entities and migrations 008, 009', () => {
      const entities = (databaseConfig.entities as Function[]).map((e) => e.name);
      assert.ok(entities.includes('ProductionTemplateEntity'));
      assert.ok(entities.includes('ProductionTemplateSpecificationEntity'));
      assert.ok(entities.includes('ProductionTemplateStageEntity'));
      assert.ok(entities.includes('ProductionTemplateStageMaterialEntity'));
      assert.ok(entities.includes('ProductionTemplateStageAttachmentEntity'));

      const migrations = (databaseConfig.migrations as Function[]).map((m) => m.name);
      assert.ok(migrations.includes('MigrateStudiesToProductionTemplateTables1710000000008'));
      assert.ok(migrations.includes('HardenProductionTemplateCoreAndStageAttachments1710000000009'));
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
    it('CreateProductionTemplateDto: normalizes code to uppercase and enforces pattern ^[A-Z][A-Z0-9_-]*$', async () => {
      const valid = plainToInstance(CreateProductionTemplateDto, {
        code: 'TPL-ROOM_01',
        name: 'قالب غرفة نموذجية',
      });
      const validErrors = await validate(valid);
      assert.strictEqual(validErrors.length, 0);

      // Normalization: lowercase room-a is transformed to uppercase ROOM-A before validation
      const normalizedLower = plainToInstance(CreateProductionTemplateDto, {
        code: 'room-a',
        name: 'قالب غرفة',
      });
      assert.strictEqual(normalizedLower.code, 'ROOM-A');
      const lowerErrors = await validate(normalizedLower);
      assert.strictEqual(lowerErrors.length, 0);

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

    it('UpdateTemplateSpecificationDto: excludes sortOrder and validates required fields', async () => {
      const valid = plainToInstance(UpdateTemplateSpecificationDto, {
        name: 'الطول',
        value: '6',
        unit: 'متر',
      });
      const errors = await validate(valid);
      assert.strictEqual(errors.length, 0);
      assert.strictEqual('sortOrder' in (valid as Record<string, unknown>), false, 'sortOrder must be removed from UpdateTemplateSpecificationDto');
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

    it('escapes html and script payloads in stage attachment original filenames', () => {
      const maliciousAttachment = {
        id: 'att-1',
        originalFileName: '</script><script>alert("hack")</script>.pdf',
        description: '<b>خطير</b>',
      };
      const serialized = safeJsonStringify(maliciousAttachment);
      assert.strictEqual(serialized.includes('<'), false);
      assert.strictEqual(serialized.includes('>'), false);
      const parsed = JSON.parse(serialized);
      assert.strictEqual(parsed.originalFileName, '</script><script>alert("hack")</script>.pdf');
    });
  });

  // =========================================================================
  // 7. Stage Reference Attachments & Storage Abstraction Invariants
  // =========================================================================
  describe('7. Stage Reference Documents & Storage Abstraction Invariants', () => {
    const testStorageDir = path.resolve(process.cwd(), 'storage/test-stage-attachments');
    const storageService = new TemplateStageAttachmentStorageService(testStorageDir);

    it('saves a valid PDF file under an opaque generated storage key', async () => {
      const stageId = 'stage-001';
      const file = {
        originalname: 'مخطط تسليح الأرضية.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 test content'),
      };

      const result = await storageService.saveFile(stageId, file);
      assert.ok(result.storageKey.startsWith('production-template-stage/stage-001/'));
      assert.ok(result.storageKey.endsWith('.pdf'));
      assert.strictEqual(result.sizeBytes, 1024);
      assert.strictEqual(result.mimeType, 'application/pdf');

      // Verify file exists on disk at resolved path
      const resolvedPath = storageService.resolveAbsolutePath(result.storageKey);
      assert.strictEqual(fs.existsSync(resolvedPath), true);

      // Clean up test file
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    });

    it('saves valid images (png, jpg, webp) under opaque keys', async () => {
      const stageId = 'stage-002';
      const imgFile = {
        originalname: 'تفاصيل-الصب.PNG',
        mimetype: 'image/png',
        size: 2048,
        buffer: Buffer.from('fake-png-data'),
      };

      const result = await storageService.saveFile(stageId, imgFile);
      assert.ok(result.storageKey.endsWith('.png'));
      assert.strictEqual(result.mimeType, 'image/png');

      fs.rmSync(testStorageDir, { recursive: true, force: true });
    });

    it('rejects files larger than 20 MB with ATTACHMENT_FILE_TOO_LARGE', async () => {
      const stageId = 'stage-003';
      const oversizedFile = {
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        size: 21 * 1024 * 1024, // 21 MB
        buffer: Buffer.alloc(10),
      };

      await assert.rejects(
        async () => storageService.saveFile(stageId, oversizedFile),
        (err: BusinessRuleError) => {
          assert.strictEqual(err.code, 'ATTACHMENT_FILE_TOO_LARGE');
          return true;
        }
      );
    });

    it('rejects empty files with ATTACHMENT_FILE_EMPTY', async () => {
      const stageId = 'stage-004';
      const emptyFile = {
        originalname: 'empty.pdf',
        mimetype: 'application/pdf',
        size: 0,
        buffer: Buffer.alloc(0),
      };

      await assert.rejects(
        async () => storageService.saveFile(stageId, emptyFile),
        (err: BusinessRuleError) => {
          assert.strictEqual(err.code, 'ATTACHMENT_FILE_EMPTY');
          return true;
        }
      );
    });

    it('rejects unsupported MIME types with ATTACHMENT_UNSUPPORTED_MIME_TYPE', async () => {
      const stageId = 'stage-005';
      const forbiddenMimes = ['text/html', 'application/x-msdownload', 'image/svg+xml', 'application/javascript'];

      for (const mime of forbiddenMimes) {
        const file = {
          originalname: 'file.pdf',
          mimetype: mime,
          size: 500,
          buffer: Buffer.from('test'),
        };
        await assert.rejects(
          async () => storageService.saveFile(stageId, file),
          (err: BusinessRuleError) => {
            assert.strictEqual(err.code, 'ATTACHMENT_UNSUPPORTED_MIME_TYPE');
            return true;
          }
        );
      }
    });

    it('rejects unsupported extensions with ATTACHMENT_UNSUPPORTED_EXTENSION', async () => {
      const stageId = 'stage-006';
      const forbiddenExts = ['test.exe', 'script.js', 'page.html', 'vector.svg', 'batch.bat', 'shell.ps1'];

      for (const filename of forbiddenExts) {
        const file = {
          originalname: filename,
          mimetype: 'application/pdf',
          size: 500,
          buffer: Buffer.from('test'),
        };
        await assert.rejects(
          async () => storageService.saveFile(stageId, file),
          (err: BusinessRuleError) => {
            assert.strictEqual(err.code, 'ATTACHMENT_UNSUPPORTED_EXTENSION');
            return true;
          }
        );
      }
    });

    it('prevents path traversal attack in original filename from escaping storage root', async () => {
      const stageId = 'stage-traversal';
      const maliciousFile = {
        originalname: '../../../../windows/system32/cmd.exe.pdf',
        mimetype: 'application/pdf',
        size: 100,
        buffer: Buffer.from('safe test content'),
      };

      const result = await storageService.saveFile(stageId, maliciousFile);
      // The storageKey must only contain generated uuid and safe extension, no ../
      assert.strictEqual(result.storageKey.includes('..'), false);
      assert.ok(result.storageKey.startsWith('production-template-stage/stage-traversal/'));

      const absolutePath = storageService.resolveAbsolutePath(result.storageKey);
      assert.ok(absolutePath.startsWith(testStorageDir));

      fs.rmSync(testStorageDir, { recursive: true, force: true });
    });

    it('resolveAbsolutePath throws on path traversal attempts in storageKey', () => {
      assert.throws(
        () => storageService.resolveAbsolutePath('../escaped.pdf'),
        (err: BusinessRuleError) => {
          assert.strictEqual(err.code, 'ATTACHMENT_INVALID_KEY');
          return true;
        }
      );
      assert.throws(
        () => storageService.resolveAbsolutePath('folder/\0/test.pdf'),
        (err: BusinessRuleError) => {
          assert.strictEqual(err.code, 'ATTACHMENT_INVALID_KEY');
          return true;
        }
      );
    });

    it('toStageAttachmentDto strictly omits server filesystem paths and returns safe client DTO', () => {
      const att = new ProductionTemplateStageAttachmentEntity();
      att.id = 'att-uuid-001';
      att.stageId = 'stage-uuid-001';
      att.originalFileName = 'مخطط.pdf';
      att.storageKey = 'production-template-stage/stage-uuid-001/random-uuid.pdf';
      att.mimeType = 'application/pdf';
      att.sizeBytes = 204800;
      att.description = 'مخطط تفصيلي معتمد';
      att.sortOrder = 1;
      att.createdByUserId = 'user-001';
      att.createdAt = new Date();
      att.updatedAt = new Date();
      att.deletedAt = null;

      const dto = toStageAttachmentDto(att, 'tpl-001');

      assert.strictEqual(dto.id, 'att-uuid-001');
      assert.strictEqual(dto.originalFileName, 'مخطط.pdf');
      assert.strictEqual(dto.downloadUrl, '/api/production/templates/tpl-001/stages/stage-uuid-001/attachments/att-uuid-001/file');
      assert.strictEqual('storageKey' in (dto as Record<string, unknown>), false, 'storageKey must not be leaked');
      assert.strictEqual('absolutePath' in (dto as Record<string, unknown>), false, 'absolutePath must not be leaked');
      assert.strictEqual('serverRoot' in (dto as Record<string, unknown>), false, 'serverRoot must not be leaked');
    });

    it('ReorderStageAttachmentsDto enforces array of UUIDs and not empty', async () => {
      const valid = plainToInstance(ReorderStageAttachmentsDto, {
        attachmentIds: ['a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002'],
      });
      const validErrors = await validate(valid);
      assert.strictEqual(validErrors.length, 0);

      const invalidEmpty = plainToInstance(ReorderStageAttachmentsDto, {
        attachmentIds: [],
      });
      const emptyErrors = await validate(invalidEmpty);
      assert.ok(emptyErrors.some((e) => e.property === 'attachmentIds'));

      const invalidNonUuid = plainToInstance(ReorderStageAttachmentsDto, {
        attachmentIds: ['not-a-uuid'],
      });
      const nonUuidErrors = await validate(invalidNonUuid);
      assert.ok(nonUuidErrors.some((e) => e.property === 'attachmentIds'));
    });
  });

  // =========================================================================
  // 8. Material API Data Leakage Elimination Invariants
  // =========================================================================
  describe('8. Material API Data Leakage Elimination Invariants', () => {
    it('toStageMaterialDto returns minimal DTO and strictly does not leak internal inventory fields', () => {
      const mat = new ProductionTemplateStageMaterialEntity();
      mat.id = 'mat-uuid-1';
      mat.stageId = 'stage-uuid-1';
      mat.productId = 'prod-uuid-1';
      mat.productUnitId = 'unit-uuid-1';
      mat.plannedQuantity = '15.5000';
      mat.createdAt = new Date();
      mat.updatedAt = new Date();

      // Entity loaded with full product & unit relation including sensitive internals
      const fullProduct = new InventoryProductEntity();
      fullProduct.id = 'prod-uuid-1';
      fullProduct.name = 'حديد تسليح 12 مم';
      fullProduct.code = 'REBAR_12';
      fullProduct.baseUnitId = 'unit-uuid-1';
      (fullProduct as unknown as Record<string, unknown>).price = '2500.00';
      (fullProduct as unknown as Record<string, unknown>).barcode = '6281000123456';
      (fullProduct as unknown as Record<string, unknown>).locationName = 'مستودع أ - رف 3';
      (fullProduct as unknown as Record<string, unknown>).specifications = { origin: 'Saudi Arabia', grade: 'Grade 60' };
      mat.product = fullProduct;

      const fullUnit = new InventoryProductUnitEntity();
      fullUnit.id = 'unit-uuid-1';
      fullUnit.productId = 'prod-uuid-1';
      fullUnit.name = 'طن';
      (fullUnit as unknown as Record<string, unknown>).conversionQuantity = '1.0000';
      (fullUnit as unknown as Record<string, unknown>).barcode = '6281000123457';
      mat.productUnit = fullUnit;

      const dto = toStageMaterialDto(mat);

      // Verify minimal contract
      assert.strictEqual(dto.id, 'mat-uuid-1');
      assert.strictEqual(dto.stageId, 'stage-uuid-1');
      assert.strictEqual(dto.plannedQuantity, '15.5000');
      assert.deepStrictEqual(dto.product, {
        id: 'prod-uuid-1',
        name: 'حديد تسليح 12 مم',
        code: 'REBAR_12',
      });
      assert.deepStrictEqual(dto.productUnit, {
        id: 'unit-uuid-1',
        name: 'طن',
        isBase: true,
      });

      // Assert data leakage elimination
      const rawDto = dto as unknown as Record<string, unknown>;
      const rawProd = (dto.product || {}) as Record<string, unknown>;
      const rawUnit = (dto.productUnit || {}) as Record<string, unknown>;

      assert.strictEqual('price' in rawDto, false, 'Root DTO must not have price');
      assert.strictEqual('barcode' in rawDto, false, 'Root DTO must not have barcode');
      assert.strictEqual('locationName' in rawDto, false, 'Root DTO must not have locationName');
      assert.strictEqual('price' in rawProd, false, 'Product in DTO must not have price');
      assert.strictEqual('barcode' in rawProd, false, 'Product in DTO must not have barcode');
      assert.strictEqual('locationName' in rawProd, false, 'Product in DTO must not have locationName');
      assert.strictEqual('specifications' in rawProd, false, 'Product in DTO must not have specifications');
      assert.strictEqual('conversionQuantity' in rawUnit, false, 'ProductUnit in DTO must not have conversionQuantity');
      assert.strictEqual('barcode' in rawUnit, false, 'ProductUnit in DTO must not have barcode');
    });
  });

  // =========================================================================
  // 9. Catalog Product Reference Search & Pagination Beyond 100 Invariants
  // =========================================================================
  describe('9. Catalog Product Reference Search & Pagination Beyond 100 Invariants', () => {
    // Generate 150 mock products
    const mockProducts: InventoryProductEntity[] = [];
    for (let i = 1; i <= 150; i++) {
      const p = new InventoryProductEntity();
      p.id = `prod-${String(i).padStart(3, '0')}`;
      p.name = `منتج تصنيعي رقم ${i}`;
      p.code = `PRD-${String(i).padStart(3, '0')}`;
      p.isActive = true;
      p.deletedAt = null;
      mockProducts.push(p);
    }

    const mockRepo = {
      createQueryBuilder: (_alias: string) => {
        let filtered = [...mockProducts];
        let skipVal = 0;
        let takeVal = 20;

        const qb = {
          where: () => qb,
          andWhere: (_condition: string, params?: { term?: string }) => {
            if (params?.term) {
              const term = params.term.replace(/%/g, '').toLowerCase();
              filtered = filtered.filter(
                (p) => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
              );
            }
            return qb;
          },
          select: () => qb,
          orderBy: () => qb,
          skip: (s: number) => {
            skipVal = s;
            return qb;
          },
          take: (t: number) => {
            takeVal = t;
            return qb;
          },
          getCount: async () => filtered.length,
          getMany: async () => filtered.slice(skipVal, skipVal + takeVal),
        };
        return qb;
      },
    } as unknown as Repository<InventoryProductEntity>;

    const refService = new InventoryProductReferenceService(
      {} as any,
      mockRepo,
      {} as unknown as Repository<InventoryProductUnitEntity>
    );

    it('paginates correctly on page 1 with limit 20 (total 150, totalPages 8)', async () => {
      const result = await refService.searchProductReferences(undefined, 1, 20);
      assert.strictEqual(result.items.length, 20);
      assert.strictEqual(result.total, 150);
      assert.strictEqual(result.page, 1);
      assert.strictEqual(result.limit, 20);
      assert.strictEqual(result.totalPages, 8);
      assert.strictEqual(result.items[0].code, 'PRD-001');
      assert.strictEqual(result.items[19].code, 'PRD-020');
    });

    it('allows reaching products beyond the first 100 on page 6 (items 101 to 120)', async () => {
      const result = await refService.searchProductReferences(undefined, 6, 20);
      assert.strictEqual(result.items.length, 20);
      assert.strictEqual(result.page, 6);
      assert.strictEqual(result.items[0].code, 'PRD-101');
      assert.strictEqual(result.items[19].code, 'PRD-120');
    });

    it('allows reaching the last page 8 (items 141 to 150)', async () => {
      const result = await refService.searchProductReferences(undefined, 8, 20);
      assert.strictEqual(result.items.length, 10);
      assert.strictEqual(result.page, 8);
      assert.strictEqual(result.items[0].code, 'PRD-141');
      assert.strictEqual(result.items[9].code, 'PRD-150');
    });

    it('clamps limit above 100 down to 100', async () => {
      const result = await refService.searchProductReferences(undefined, 1, 500);
      assert.strictEqual(result.limit, 100);
      assert.strictEqual(result.items.length, 100);
    });
  });
});

