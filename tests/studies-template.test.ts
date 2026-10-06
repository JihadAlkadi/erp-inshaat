import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { StudiesTemplateService } from '../src/modules/studies/template/services/studies-template.service.js';
import { StudiesTemplateEntity } from '../src/modules/studies/template/entities/studies-template.entity.js';
import { StudiesTemplateSpecificationEntity } from '../src/modules/studies/template/entities/studies-template-specification.entity.js';
import { StudiesTemplateStageEntity } from '../src/modules/studies/template/entities/studies-template-stage.entity.js';
import { StudiesTemplateStageMaterialEntity } from '../src/modules/studies/template/entities/studies-template-stage-material.entity.js';
import { ProductionDepartmentEntity } from '../src/modules/production/department/production-department.entity.js';
import { InventoryProductEntity } from '../src/modules/inventory/product/inventory-product.entity.js';
import { InventoryProductUnitEntity } from '../src/modules/inventory/product/inventory-product-unit.entity.js';
import { deriveConsecutiveDepartmentGroups } from '../src/modules/studies/template/helpers/consecutive-grouping.helper.js';

import { BusinessRuleError } from '../src/common/errors/business-rule.error.js';
import { ConflictError } from '../src/common/errors/conflict.error.js';
import { NotFoundError } from '../src/common/errors/not-found.error.js';
import { SystemPermission } from '../src/modules/system/permission/constants/system-permission.enum.js';
import { SYSTEM_PERMISSION_DEFINITIONS } from '../src/modules/system/permission/constants/system-permission.registry.js';
import { databaseConfig } from '../src/config/database.config.js';
import { CreateStudiesTemplateCoreTables1710000000007 } from '../src/database/migrations/1710000000007-CreateStudiesTemplateCoreTables.js';

// --- In-Memory Mock Store for Studies Module Testing ---

interface MockStore {
  templates: Map<string, StudiesTemplateEntity>;
  specifications: Map<string, StudiesTemplateSpecificationEntity>;
  stages: Map<string, StudiesTemplateStageEntity>;
  materials: Map<string, StudiesTemplateStageMaterialEntity>;
  departments: Map<string, ProductionDepartmentEntity>;
  products: Map<string, InventoryProductEntity>;
  units: Map<string, InventoryProductUnitEntity>;
}

function createMockRepo<T extends { id: string; deletedAt?: Date | null }>(
  map: Map<string, T>,
  entityClass: new () => T,
  store: MockStore
): Repository<T> {
  const repo: Partial<Repository<T>> = {
    create: ((plain?: Partial<T>) => {
      const entity = new entityClass();
      if (plain) Object.assign(entity, plain);
      if (!entity.id) entity.id = 'mock-id-' + Math.random().toString(36).substring(2, 9);
      if (entity.deletedAt === undefined) entity.deletedAt = null;
      return entity;
    }) as any,

    findOne: (async (options: any) => {
      const where = options?.where || {};
      const withDeleted = !!options?.withDeleted;

      for (const item of map.values()) {
        if (!withDeleted && item.deletedAt) continue;

        let match = true;
        for (const [key, val] of Object.entries(where)) {
          const itemVal = (item as any)[key];
          if (val && typeof val === 'object' && (val as any)._type === 'isNull') {
            if (itemVal !== null && itemVal !== undefined) {
              match = false;
              break;
            }
          } else if (val === null) {
            if (itemVal !== null && itemVal !== undefined) {
              match = false;
              break;
            }
          } else if (itemVal !== val) {
            match = false;
            break;
          }
        }
        if (match) {
          const clone = Object.assign(new entityClass(), item);
          return clone;
        }
      }
      return null;
    }) as any,

    findOneOrFail: (async (options: any) => {
      const found = await repo.findOne!(options);
      if (!found) throw new NotFoundError('Entity not found', 'NOT_FOUND');
      return found;
    }) as any,

    find: (async (options: any) => {
      const where = options?.where || {};
      const withDeleted = !!options?.withDeleted;
      const results: T[] = [];

      for (const item of map.values()) {
        if (!withDeleted && item.deletedAt) continue;

        let match = true;
        for (const [key, val] of Object.entries(where)) {
          const itemVal = (item as any)[key];
          if (val && typeof val === 'object' && (val as any)._type === 'isNull') {
            if (itemVal !== null && itemVal !== undefined) {
              match = false;
              break;
            }
          } else if (val === null) {
            if (itemVal !== null && itemVal !== undefined) {
              match = false;
              break;
            }
          } else if (itemVal !== val) {
            match = false;
            break;
          }
        }
        if (match) results.push(Object.assign(new entityClass(), item));
      }

      if (options?.order) {
        const [orderField, orderDir] = Object.entries(options.order)[0] as [string, 'ASC' | 'DESC'];
        results.sort((a: any, b: any) => {
          if (a[orderField] < b[orderField]) return orderDir === 'ASC' ? -1 : 1;
          if (a[orderField] > b[orderField]) return orderDir === 'ASC' ? 1 : -1;
          return 0;
        });
      }

      return results;
    }) as any,

    save: (async (entityOrEntities: any) => {
      const items = Array.isArray(entityOrEntities) ? entityOrEntities : [entityOrEntities];
      for (const item of items) {
        if (!item.id) {
          item.id = 'mock-id-' + Math.random().toString(36).substring(2, 9);
        }
        if (item.deletedAt === undefined) item.deletedAt = null;
        if (!item.createdAt) item.createdAt = new Date();
        item.updatedAt = new Date();
        map.set(item.id, Object.assign(new entityClass(), item));
      }
      return entityOrEntities;
    }) as any,

    softDelete: (async (id: string) => {
      const entity = map.get(id);
      if (entity) {
        entity.deletedAt = new Date();
      }
    }) as any,

    remove: (async (entity: any) => {
      map.delete(entity.id);
      return entity;
    }) as any,

    count: (async (options: any) => {
      const where = options?.where || {};
      let count = 0;
      for (const item of map.values()) {
        if (item.deletedAt) continue;
        let match = true;
        for (const [key, val] of Object.entries(where)) {
          if ((item as any)[key] !== val) {
            match = false;
            break;
          }
        }
        if (match) count++;
      }
      return count;
    }) as any,
  };

  return repo as Repository<T>;
}

function setupTestEnvironment(): { service: StudiesTemplateService; store: MockStore } {
  const store: MockStore = {
    templates: new Map(),
    specifications: new Map(),
    stages: new Map(),
    materials: new Map(),
    departments: new Map(),
    products: new Map(),
    units: new Map(),
  };

  const templateRepo = createMockRepo(store.templates, StudiesTemplateEntity, store);
  const specRepo = createMockRepo(store.specifications, StudiesTemplateSpecificationEntity, store);
  const stageRepo = createMockRepo(store.stages, StudiesTemplateStageEntity, store);
  const materialRepo = createMockRepo(store.materials, StudiesTemplateStageMaterialEntity, store);
  const deptRepo = createMockRepo(store.departments, ProductionDepartmentEntity, store);
  const productRepo = createMockRepo(store.products, InventoryProductEntity, store);
  const unitRepo = createMockRepo(store.units, InventoryProductUnitEntity, store);

  // Mock EntityManager with transaction support
  const mockEntityManager: Partial<EntityManager> = {
    getRepository: ((target: any) => {
      if (target === StudiesTemplateEntity) return templateRepo;
      if (target === StudiesTemplateSpecificationEntity) return specRepo;
      if (target === StudiesTemplateStageEntity) return stageRepo;
      if (target === StudiesTemplateStageMaterialEntity) return materialRepo;
      if (target === ProductionDepartmentEntity) return deptRepo;
      if (target === InventoryProductEntity) return productRepo;
      if (target === InventoryProductUnitEntity) return unitRepo;
      throw new Error('Unknown repository target: ' + target);
    }) as any,
    findOne: (async (target: any, options: any) => {
      const r = (mockEntityManager as any).getRepository(target);
      return r.findOne(options);
    }) as any,
    find: (async (target: any, options: any) => {
      const r = (mockEntityManager as any).getRepository(target);
      return r.find(options);
    }) as any,
    save: (async (entity: any) => {
      if (entity instanceof StudiesTemplateEntity) return templateRepo.save(entity);
      if (entity instanceof StudiesTemplateSpecificationEntity) return specRepo.save(entity);
      if (entity instanceof StudiesTemplateStageEntity) return stageRepo.save(entity);
      if (entity instanceof StudiesTemplateStageMaterialEntity) return materialRepo.save(entity);
      return entity;
    }) as any,
    create: ((target: any, plain: any) => {
      const r = (mockEntityManager as any).getRepository(target);
      return r.create(plain);
    }) as any,
    update: (async (target: any, criteria: any, partial: any) => {
      const r = (mockEntityManager as any).getRepository(target);
      const found = await r.findOne({ where: criteria });
      if (found) {
        Object.assign(found, partial);
        await r.save(found);
      }
    }) as any,
    createQueryBuilder: (() => ({
      update: () => ({
        set: () => ({
          where: () => ({
            execute: async () => {},
          }),
        }),
      }),
    })) as any,
  };

  const mockQueryRunner = {
    connect: async () => {},
    startTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    release: async () => {},
    manager: mockEntityManager as EntityManager,
  };

  const mockDataSource: Partial<DataSource> = {
    getRepository: ((target: any) => mockEntityManager.getRepository!(target)) as any,
    createQueryRunner: () => mockQueryRunner as any,
    transaction: (async (cb: any) => {
      return cb(mockEntityManager as EntityManager);
    }) as any,
  };

  const service = new StudiesTemplateService(
    mockDataSource as DataSource,
    templateRepo,
    specRepo,
    stageRepo,
    materialRepo,
    deptRepo,
    productRepo,
    unitRepo
  );

  return { service, store };
}

// ========================================================
// TEST SUITES
// ========================================================

describe('Studies Template Core Foundation Tests', () => {

  // --------------------------------------------------------
  // 1. Consecutive Department Grouping Invariants (UI Presentation)
  // --------------------------------------------------------
  describe('1. Consecutive Department Grouping (Section 73 & 74)', () => {
    it('groups ONLY consecutive stages with the same departmentId, preserving separate visual groups for non-consecutive occurrences (Section 73)', () => {
      const castingId = 'dept-casting';
      const qualityId = 'dept-quality';
      const transportId = 'dept-transport';
      const finishingId = 'dept-finishing';

      const mockStages: Partial<StudiesTemplateStageEntity>[] = [
        { id: 's1', sortOrder: 1, departmentId: castingId, name: 'تجهيز القالب' },
        { id: 's2', sortOrder: 2, departmentId: castingId, name: 'صب الأرضية' },
        { id: 's3', sortOrder: 3, departmentId: qualityId, name: 'فحص أولي' },
        { id: 's4', sortOrder: 4, departmentId: castingId, name: 'صب السقف' },
        { id: 's5', sortOrder: 5, departmentId: castingId, name: 'معالجة السقف' },
        { id: 's6', sortOrder: 6, departmentId: transportId, name: 'نقل الغرفة' },
        { id: 's7', sortOrder: 7, departmentId: finishingId, name: 'كهرباء' },
        { id: 's8', sortOrder: 8, departmentId: finishingId, name: 'دهان' },
        { id: 's9', sortOrder: 9, departmentId: qualityId, name: 'فحص نهائي' },
      ];

      const groups = deriveConsecutiveDepartmentGroups(mockStages as StudiesTemplateStageEntity[]);

      // Must have exactly 6 distinct groups
      assert.equal(groups.length, 6, 'Must generate exactly 6 consecutive visual groups');

      // Group 1: Casting [s1, s2]
      assert.equal(groups[0].departmentId, castingId);
      assert.deepEqual(groups[0].stages.map((s) => s.id), ['s1', 's2']);

      // Group 2: Quality [s3]
      assert.equal(groups[1].departmentId, qualityId);
      assert.deepEqual(groups[1].stages.map((s) => s.id), ['s3']);

      // Group 3: Casting [s4, s5] - Must NOT be merged with Group 1!
      assert.equal(groups[2].departmentId, castingId);
      assert.deepEqual(groups[2].stages.map((s) => s.id), ['s4', 's5']);

      // Group 4: Transport [s6]
      assert.equal(groups[3].departmentId, transportId);
      assert.deepEqual(groups[3].stages.map((s) => s.id), ['s6']);

      // Group 5: Finishing [s7, s8]
      assert.equal(groups[4].departmentId, finishingId);
      assert.deepEqual(groups[4].stages.map((s) => s.id), ['s7', 's8']);

      // Group 6: Quality [s9] - Must NOT be merged with Group 2!
      assert.equal(groups[5].departmentId, qualityId);
      assert.deepEqual(groups[5].stages.map((s) => s.id), ['s9']);
    });

    it('reordering stages merges or splits visual groups automatically without altering departmentId (Section 74)', () => {
      const castingId = 'dept-casting';
      const qualityId = 'dept-quality';

      // Initial: Casting A, Casting B, Quality Q, Casting C
      const stagesInitial: Partial<StudiesTemplateStageEntity>[] = [
        { id: 'sA', sortOrder: 1, departmentId: castingId, name: 'Stage A' },
        { id: 'sB', sortOrder: 2, departmentId: castingId, name: 'Stage B' },
        { id: 'sQ', sortOrder: 3, departmentId: qualityId, name: 'Stage Q' },
        { id: 'sC', sortOrder: 4, departmentId: castingId, name: 'Stage C' },
      ];

      const initialGroups = deriveConsecutiveDepartmentGroups(stagesInitial as StudiesTemplateStageEntity[]);
      assert.equal(initialGroups.length, 3, 'Initial: 3 groups [Casting A,B], [Quality Q], [Casting C]');
      assert.deepEqual(initialGroups[0].stages.map((s) => s.id), ['sA', 'sB']);
      assert.deepEqual(initialGroups[1].stages.map((s) => s.id), ['sQ']);
      assert.deepEqual(initialGroups[2].stages.map((s) => s.id), ['sC']);

      // After Reorder: Move Q to the end: Casting A, Casting B, Casting C, Quality Q
      const stagesReordered: Partial<StudiesTemplateStageEntity>[] = [
        { id: 'sA', sortOrder: 1, departmentId: castingId, name: 'Stage A' },
        { id: 'sB', sortOrder: 2, departmentId: castingId, name: 'Stage B' },
        { id: 'sC', sortOrder: 3, departmentId: castingId, name: 'Stage C' },
        { id: 'sQ', sortOrder: 4, departmentId: qualityId, name: 'Stage Q' },
      ];

      const reorderedGroups = deriveConsecutiveDepartmentGroups(stagesReordered as StudiesTemplateStageEntity[]);
      assert.equal(reorderedGroups.length, 2, 'Reordered: 2 groups [Casting A,B,C], [Quality Q]');
      assert.deepEqual(reorderedGroups[0].stages.map((s) => s.id), ['sA', 'sB', 'sC']);
      assert.deepEqual(reorderedGroups[1].stages.map((s) => s.id), ['sQ']);

      // Invariant: No departmentId was changed
      assert.equal(stagesReordered[2].departmentId, castingId);
      assert.equal(stagesReordered[3].departmentId, qualityId);
    });
  });

  // --------------------------------------------------------
  // 2. Template Invariants (Create, Update, Immutable Code, Soft Delete)
  // --------------------------------------------------------
  describe('2. Template CRUD & Technical Code Invariants', () => {
    it('creates a template with normalized uppercase code', async () => {
      const { service, store } = setupTestEnvironment();

      const created = await service.createTemplate({
        name: 'غرفة نموذج A',
        code: 'room-a-01',
        referenceNumber: 'REF-01',
        description: 'وصف الغرفة',
      });

      assert.equal(created.code, 'ROOM-A-01', 'Code must be normalized to uppercase');
      assert.equal(created.name, 'غرفة نموذج A');
      assert.equal(created.isActive, true);
      assert.ok(store.templates.has(created.id));
    });

    it('rejects duplicate code even if previous template is soft-deleted', async () => {
      const { service, store } = setupTestEnvironment();

      // Create and soft-delete first template
      const t1 = await service.createTemplate({
        name: 'غرفة سابقة',
        code: 'ROOM-DUPLICATE',
      });
      await service.softDeleteTemplate(t1.id);
      assert.ok(store.templates.get(t1.id)?.deletedAt, 'Template must be soft-deleted');

      // Attempt to create second template with same code
      await assert.rejects(
        async () => {
          await service.createTemplate({
            name: 'غرفة جديدة بنفس الكود',
            code: 'room-duplicate',
          });
        },
        (err: any) => {
          assert(err instanceof ConflictError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_CODE_ALREADY_EXISTS');
          return true;
        }
      );
    });

    it('updates mutable template fields while technical code remains immutable', async () => {
      const { service, store } = setupTestEnvironment();

      const created = await service.createTemplate({
        name: 'اسم أولي',
        code: 'ROOM-ORIGINAL',
      });

      const updated = await service.updateTemplate(created.id, {
        name: 'اسم محدث',
        referenceNumber: 'REF-NEW',
        description: 'وصف محدث',
        isActive: false,
      });

      assert.equal(updated.name, 'اسم محدث');
      assert.equal(updated.referenceNumber, 'REF-NEW');
      assert.equal(updated.description, 'وصف محدث');
      assert.equal(updated.isActive, false);
      assert.equal(updated.code, 'ROOM-ORIGINAL', 'Code must remain untouched');
    });

    it('soft deletes template without hard deleting records', async () => {
      const { service, store } = setupTestEnvironment();

      const created = await service.createTemplate({
        name: 'غرفة للأرشفة',
        code: 'ROOM-ARCHIVE',
      });

      await service.softDeleteTemplate(created.id);
      const archived = store.templates.get(created.id);
      assert.ok(archived, 'Row must still exist in table');
      assert.ok(archived?.deletedAt, 'deletedAt must be populated');
    });
  });

  // --------------------------------------------------------
  // 3. Dynamic Specifications Invariants
  // --------------------------------------------------------
  describe('3. Dynamic Specifications CRUD & Reorder', () => {
    it('creates specifications with dense sortOrder', async () => {
      const { service } = setupTestEnvironment();

      const t = await service.createTemplate({ name: 'غرفة B', code: 'ROOM-B' });

      const spec1 = await service.addSpecification(t.id, {
        name: 'الطول',
        value: '6',
        unit: 'متر',
      });
      const spec2 = await service.addSpecification(t.id, {
        name: 'العرض',
        value: '3',
        unit: 'متر',
      });

      assert.equal(spec1.sortOrder, 1);
      assert.equal(spec2.sortOrder, 2);
    });

    it('reorders specifications densely and rejects invalid payloads', async () => {
      const { service } = setupTestEnvironment();

      const t = await service.createTemplate({ name: 'غرفة C', code: 'ROOM-C' });
      const spec1 = await service.addSpecification(t.id, { name: 'الطول', value: '6' });
      const spec2 = await service.addSpecification(t.id, { name: 'العرض', value: '3' });

      // Reorder payload with duplicate IDs should be rejected
      await assert.rejects(
        async () => {
          await service.reorderSpecifications(t.id, {
            specificationIds: [spec1.id, spec1.id],
          });
        },
        (err: any) => {
          assert(err instanceof BusinessRuleError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_SPECIFICATION_INVALID_REORDER');
          return true;
        }
      );

      // Valid reorder: swap 2 and 1
      const reordered = await service.reorderSpecifications(t.id, {
        specificationIds: [spec2.id, spec1.id],
      });
      assert.equal(reordered[0].id, spec2.id);
      assert.equal(reordered[0].sortOrder, 1);
      assert.equal(reordered[1].id, spec1.id);
      assert.equal(reordered[1].sortOrder, 2);
    });
  });

  // --------------------------------------------------------
  // 4. Stages Invariants (Global Ordering, Department Reference, Atomic Reorder)
  // --------------------------------------------------------
  describe('4. Stages Global Ordering & Department Reference Invariants', () => {
    it('creates stages referencing active departments and assigns dense global order', async () => {
      const { service, store } = setupTestEnvironment();

      // Seed active department
      const dept = new ProductionDepartmentEntity();
      dept.id = 'dept-casting';
      dept.name = 'قسم الصب';
      dept.code = 'CAST';
      dept.isActive = true;
      dept.deletedAt = null;
      store.departments.set(dept.id, dept);

      const t = await service.createTemplate({ name: 'غرفة D', code: 'ROOM-D' });

      const stage1 = await service.addStage(t.id, {
        name: 'صب الأرضية',
        departmentId: dept.id,
        estimatedDurationMinutes: 180,
      });

      const stage2 = await service.addStage(t.id, {
        name: 'صب الجدران',
        departmentId: dept.id,
        estimatedDurationMinutes: 240,
      });

      assert.equal(stage1.sortOrder, 1);
      assert.equal(stage2.sortOrder, 2);
      assert.equal(stage1.departmentId, dept.id);
    });

    it('rejects stage creation if production department is missing or soft-deleted', async () => {
      const { service, store } = setupTestEnvironment();

      const t = await service.createTemplate({ name: 'غرفة E', code: 'ROOM-E' });

      // 1. Missing Department
      await assert.rejects(
        async () => {
          await service.addStage(t.id, {
            name: 'مرحلة بم department مفقود',
            departmentId: '00000000-0000-0000-0000-000000000000',
          });
        },
        (err: any) => {
          assert(err instanceof NotFoundError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_STAGE_DEPARTMENT_NOT_FOUND');
          return true;
        }
      );

      // 2. Soft-deleted Department
      const deletedDept = new ProductionDepartmentEntity();
      deletedDept.id = 'dept-deleted';
      deletedDept.name = 'قسم مؤرشف';
      deletedDept.code = 'ARCH';
      deletedDept.isActive = false;
      deletedDept.deletedAt = new Date();
      store.departments.set(deletedDept.id, deletedDept);

      await assert.rejects(
        async () => {
          await service.addStage(t.id, {
            name: 'مرحلة بقسم مؤرشف',
            departmentId: deletedDept.id,
          });
        },
        (err: any) => {
          assert(err instanceof BusinessRuleError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_STAGE_DEPARTMENT_ARCHIVED');
          return true;
        }
      );
    });

    it('rejects cross-template stage reorder attacks and duplicate IDs', async () => {
      const { service, store } = setupTestEnvironment();

      const dept = new ProductionDepartmentEntity();
      dept.id = 'dept-general';
      dept.name = 'القسم العام';
      dept.code = 'GEN';
      dept.isActive = true;
      dept.deletedAt = null;
      store.departments.set(dept.id, dept);

      const template1 = await service.createTemplate({ name: 'قالب 1', code: 'TMPL-01' });
      const template2 = await service.createTemplate({ name: 'قالب 2', code: 'TMPL-02' });

      const s1 = await service.addStage(template1.id, { name: 'مرحلة 1', departmentId: dept.id });
      const s2 = await service.addStage(template1.id, { name: 'مرحلة 2', departmentId: dept.id });
      const sForeign = await service.addStage(template2.id, { name: 'مرحلة لقالب آخر', departmentId: dept.id });

      // Attack: Injection of sForeign into template1 reorder
      await assert.rejects(
        async () => {
          await service.reorderStages(template1.id, {
            stageIds: [s1.id, sForeign.id],
          });
        },
        (err: any) => {
          assert(err instanceof BusinessRuleError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_STAGE_INVALID_REORDER');
          return true;
        }
      );

      // Missing stage from set
      await assert.rejects(
        async () => {
          await service.reorderStages(template1.id, {
            stageIds: [s1.id], // missing s2
          });
        },
        (err: any) => {
          assert(err instanceof BusinessRuleError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_STAGE_INVALID_REORDER');
          return true;
        }
      );

      // Duplicate stage IDs
      await assert.rejects(
        async () => {
          await service.reorderStages(template1.id, {
            stageIds: [s1.id, s1.id],
          });
        },
        (err: any) => {
          assert(err instanceof BusinessRuleError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_STAGE_INVALID_REORDER');
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------
  // 5. Planned Materials & Inventory Catalog Validation
  // --------------------------------------------------------
  describe('5. Planned Materials & Inventory Integration Invariants', () => {
    it('adds planned material validating product, unit, positive quantity, and duplicate constraint', async () => {
      const { service, store } = setupTestEnvironment();

      const dept = new ProductionDepartmentEntity();
      dept.id = 'dept-casting';
      dept.name = 'قسم الصب';
      dept.code = 'CAST';
      dept.isActive = true;
      dept.deletedAt = null;
      store.departments.set(dept.id, dept);

      const template = await service.createTemplate({ name: 'غرفة F', code: 'ROOM-F' });
      const stage = await service.addStage(template.id, { name: 'صب الأرضية', departmentId: dept.id });

      // Seed product and unit in inventory catalog
      const product = new InventoryProductEntity();
      product.id = 'prod-cement';
      product.name = 'إسمنت بورتلاندي';
      product.code = 'MAT-CEM-01';
      product.isActive = true;
      product.deletedAt = null;
      store.products.set(product.id, product);

      const unit = new InventoryProductUnitEntity();
      unit.id = 'unit-bag';
      unit.productId = product.id;
      unit.name = 'كيس 50 كغ';
      unit.deletedAt = null;
      store.units.set(unit.id, unit);

      // 1. Success
      const mat = await service.addPlannedMaterial(template.id, stage.id, {
        productId: product.id,
        productUnitId: unit.id,
        plannedQuantity: 15.5,
      });

      assert.equal(mat.stageId, stage.id);
      assert.equal(mat.productId, product.id);
      assert.equal(mat.productUnitId, unit.id);
      assert.equal(parseFloat(mat.plannedQuantity as any), 15.5);

      // 2. Duplicate constraint: same unit on same stage rejected
      await assert.rejects(
        async () => {
          await service.addPlannedMaterial(template.id, stage.id, {
            productId: product.id,
            productUnitId: unit.id,
            plannedQuantity: 5,
          });
        },
        (err: any) => {
          assert(err instanceof ConflictError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_STAGE_MATERIAL_ALREADY_EXISTS');
          return true;
        }
      );
    });

    it('rejects unit belonging to another product', async () => {
      const { service, store } = setupTestEnvironment();

      const dept = new ProductionDepartmentEntity();
      dept.id = 'dept-casting';
      dept.name = 'قسم الصب';
      dept.code = 'CAST';
      dept.isActive = true;
      dept.deletedAt = null;
      store.departments.set(dept.id, dept);

      const template = await service.createTemplate({ name: 'غرفة G', code: 'ROOM-G' });
      const stage = await service.addStage(template.id, { name: 'المرحلة', departmentId: dept.id });

      const prod1 = new InventoryProductEntity();
      prod1.id = 'prod-1';
      prod1.name = 'حديد';
      prod1.code = 'FE-01';
      prod1.isActive = true;
      prod1.deletedAt = null;
      store.products.set(prod1.id, prod1);

      const prod2 = new InventoryProductEntity();
      prod2.id = 'prod-2';
      prod2.name = 'رمل';
      prod2.code = 'SND-01';
      prod2.isActive = true;
      prod2.deletedAt = null;
      store.products.set(prod2.id, prod2);

      const unitOfProd2 = new InventoryProductUnitEntity();
      unitOfProd2.id = 'unit-sand-ton';
      unitOfProd2.productId = prod2.id;
      unitOfProd2.name = 'طن';
      unitOfProd2.deletedAt = null;
      store.units.set(unitOfProd2.id, unitOfProd2);

      // Attempt: Link prod1 with unitOfProd2
      await assert.rejects(
        async () => {
          await service.addPlannedMaterial(template.id, stage.id, {
            productId: prod1.id,
            productUnitId: unitOfProd2.id,
            plannedQuantity: 10,
          });
        },
        (err: any) => {
          assert(err instanceof BusinessRuleError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_MATERIAL_UNIT_NOT_BELONG_TO_PRODUCT');
          return true;
        }
      );
    });

    it('rejects archived products or archived units', async () => {
      const { service, store } = setupTestEnvironment();

      const dept = new ProductionDepartmentEntity();
      dept.id = 'dept-casting';
      dept.name = 'قسم الصب';
      dept.code = 'CAST';
      dept.isActive = true;
      dept.deletedAt = null;
      store.departments.set(dept.id, dept);

      const template = await service.createTemplate({ name: 'غرفة H', code: 'ROOM-H' });
      const stage = await service.addStage(template.id, { name: 'المرحلة', departmentId: dept.id });

      // Inactive Product
      const inactiveProd = new InventoryProductEntity();
      inactiveProd.id = 'prod-inactive';
      inactiveProd.name = 'مادة معطلة';
      inactiveProd.code = 'INACT-01';
      inactiveProd.isActive = false;
      inactiveProd.deletedAt = null;
      store.products.set(inactiveProd.id, inactiveProd);

      const unit = new InventoryProductUnitEntity();
      unit.id = 'unit-1';
      unit.productId = inactiveProd.id;
      unit.name = 'متر';
      unit.deletedAt = null;
      store.units.set(unit.id, unit);

      await assert.rejects(
        async () => {
          await service.addPlannedMaterial(template.id, stage.id, {
            productId: inactiveProd.id,
            productUnitId: unit.id,
            plannedQuantity: 5,
          });
        },
        (err: any) => {
          assert(err instanceof BusinessRuleError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_MATERIAL_PRODUCT_INACTIVE');
          return true;
        }
      );

      // Soft-deleted Unit
      const activeProd = new InventoryProductEntity();
      activeProd.id = 'prod-active';
      activeProd.name = 'مادة نشطة';
      activeProd.code = 'ACT-01';
      activeProd.isActive = true;
      activeProd.deletedAt = null;
      store.products.set(activeProd.id, activeProd);

      const deletedUnit = new InventoryProductUnitEntity();
      deletedUnit.id = 'unit-archived';
      deletedUnit.productId = activeProd.id;
      deletedUnit.name = 'وحدة مؤرشفة';
      deletedUnit.deletedAt = new Date();
      store.units.set(deletedUnit.id, deletedUnit);

      await assert.rejects(
        async () => {
          await service.addPlannedMaterial(template.id, stage.id, {
            productId: activeProd.id,
            productUnitId: deletedUnit.id,
            plannedQuantity: 5,
          });
        },
        (err: any) => {
          assert(err instanceof BusinessRuleError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_MATERIAL_UNIT_ARCHIVED');
          return true;
        }
      );
    });

    it('rejects planned quantity <= 0 or invalid decimal', async () => {
      const { service, store } = setupTestEnvironment();

      const dept = new ProductionDepartmentEntity();
      dept.id = 'dept-casting';
      dept.name = 'قسم الصب';
      dept.code = 'CAST';
      dept.isActive = true;
      dept.deletedAt = null;
      store.departments.set(dept.id, dept);

      const template = await service.createTemplate({ name: 'غرفة I', code: 'ROOM-I' });
      const stage = await service.addStage(template.id, { name: 'المرحلة', departmentId: dept.id });

      const prod = new InventoryProductEntity();
      prod.id = 'prod-valid';
      prod.name = 'مادة صالحة';
      prod.code = 'VAL-01';
      prod.isActive = true;
      prod.deletedAt = null;
      store.products.set(prod.id, prod);

      const unit = new InventoryProductUnitEntity();
      unit.id = 'unit-valid';
      unit.productId = prod.id;
      unit.name = 'قطعة';
      unit.deletedAt = null;
      store.units.set(unit.id, unit);

      await assert.rejects(
        async () => {
          await service.addPlannedMaterial(template.id, stage.id, {
            productId: prod.id,
            productUnitId: unit.id,
            plannedQuantity: 0,
          });
        },
        (err: any) => {
          assert(err instanceof BusinessRuleError);
          assert.equal(err.code, 'STUDIES_TEMPLATE_STAGE_MATERIAL_INVALID_QUANTITY');
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------
  // 6. Permission Registry & Migration Integration
  // --------------------------------------------------------
  describe('6. Permissions & Migration Registration', () => {
    it('verifies all 4 Studies Template permissions exist in registry', () => {
      const expectedPermissions = [
        SystemPermission.STUDIES_TEMPLATE_VIEW,
        SystemPermission.STUDIES_TEMPLATE_CREATE,
        SystemPermission.STUDIES_TEMPLATE_UPDATE,
        SystemPermission.STUDIES_TEMPLATE_DELETE,
      ];

      for (const perm of expectedPermissions) {
        assert.ok(
          SYSTEM_PERMISSION_DEFINITIONS[perm],
          `Permission definition must exist for ${perm}`
        );
        assert.equal(
          SYSTEM_PERMISSION_DEFINITIONS[perm].name,
          perm
        );
      }
    });

    it('verifies migration 1710000000007 is explicitly registered in databaseConfig', () => {
      const migrations = databaseConfig.migrations as any[];
      assert.ok(Array.isArray(migrations), 'databaseConfig.migrations must be an array');
      const found = migrations.some(
        (m) => m === CreateStudiesTemplateCoreTables1710000000007 || m.name === 'CreateStudiesTemplateCoreTables1710000000007'
      );
      assert.ok(found, 'CreateStudiesTemplateCoreTables1710000000007 must be registered in databaseConfig.migrations');
    });
  });
});
