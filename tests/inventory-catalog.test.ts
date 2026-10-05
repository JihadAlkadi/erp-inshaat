import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DataSource, EntityManager, Repository, SelectQueryBuilder, QueryFailedError } from 'typeorm';

import { CreateInventoryCategoryDto } from '../src/modules/inventory/category/dto/create-inventory-category.dto.js';
import { UpdateInventoryCategoryDto } from '../src/modules/inventory/category/dto/update-inventory-category.dto.js';
import { CategoryOptionsQueryDto } from '../src/modules/inventory/category/dto/category-options-query.dto.js';
import { CreateInventoryProductDto } from '../src/modules/inventory/product/dto/create-product.dto.js';
import { UpdateInventoryProductDto } from '../src/modules/inventory/product/dto/update-product.dto.js';
import { CreateInventoryProductUnitDto } from '../src/modules/inventory/product/dto/create-product-unit.dto.js';
import { UpdateInventoryProductUnitDto } from '../src/modules/inventory/product/dto/update-product-unit.dto.js';

import { InventoryCategoryService } from '../src/modules/inventory/category/inventory-category.service.js';
import { InventoryProductService } from '../src/modules/inventory/product/inventory-product.service.js';
import { InventoryCategoryEntity } from '../src/modules/inventory/category/inventory-category.entity.js';
import { InventoryProductEntity } from '../src/modules/inventory/product/inventory-product.entity.js';
import { InventoryProductUnitEntity } from '../src/modules/inventory/product/inventory-product-unit.entity.js';
import { BusinessRuleError } from '../src/common/errors/business-rule.error.js';
import { ConflictError } from '../src/common/errors/conflict.error.js';
import { NotFoundError } from '../src/common/errors/not-found.error.js';
import { databaseConfig } from '../src/config/database.config.js';
import { HardenInventoryCatalogConstraints1710000000006 } from '../src/database/migrations/1710000000006-HardenInventoryCatalogConstraints.js';

// --- Test Mock Infrastructure ---

interface MockStore {
  categories: Map<string, InventoryCategoryEntity>;
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
      return entity;
    }) as any,

    findOne: (async (options: any) => {
      const where = options?.where || {};
      const withDeleted = !!options?.withDeleted;

      for (const item of map.values()) {
        if (!withDeleted && item.deletedAt) continue;

        let match = true;
        for (const [key, val] of Object.entries(where)) {
          if (item[key as keyof T] !== val) {
            match = false;
            break;
          }
        }
        if (match) {
          // Clone to simulate DB entity
          const clone = Object.assign(new entityClass(), item);
          return clone;
        }
      }
      return null;
    }) as any,

    count: (async (options: any) => {
      const where = options?.where || {};
      let count = 0;
      for (const item of map.values()) {
        if (item.deletedAt) continue;
        let match = true;
        for (const [key, val] of Object.entries(where)) {
          if (item[key as keyof T] !== val) {
            match = false;
            break;
          }
        }
        if (match) count++;
      }
      return count;
    }) as any,

    save: (async (entity: any) => {
      if (!entity.id) entity.id = 'mock-id-' + Math.random().toString(36).substring(2, 9);
      if (entity.deletedAt === undefined) entity.deletedAt = null;
      map.set(entity.id, Object.assign(new entityClass(), entity));
      return entity;
    }) as any,

    createQueryBuilder: ((_alias: string) => {
      let skipCount = 0;
      let takeCount = 50;

      const qb: Partial<SelectQueryBuilder<T>> = {
        where: () => qb as any,
        andWhere: () => qb as any,
        leftJoinAndSelect: () => qb as any,
        addSelect: () => qb as any,
        orderBy: () => qb as any,
        addOrderBy: () => qb as any,
        setParameter: () => qb as any,
        skip: (val: number) => {
          skipCount = val;
          return qb as any;
        },
        take: (val: number) => {
          takeCount = val;
          return qb as any;
        },
        getCount: async () => {
          let cnt = 0;
          for (const item of map.values()) {
            if (!item.deletedAt) cnt++;
          }
          return cnt;
        },
        getMany: async () => {
          const list: T[] = [];
          for (const item of map.values()) {
            if (!item.deletedAt) list.push(item);
          }
          return list.slice(skipCount, skipCount + takeCount);
        },
        getRawAndEntities: async () => {
          const raw: any[] = [];
          const entities: T[] = [];
          for (const item of map.values()) {
            if (!item.deletedAt) {
              const entity = Object.assign(new entityClass(), item);

              if (entityClass === InventoryProductEntity) {
                const prod = entity as unknown as InventoryProductEntity;
                if (prod.baseUnitId && store.units.has(prod.baseUnitId)) {
                  prod.baseUnit = Object.assign(new InventoryProductUnitEntity(), store.units.get(prod.baseUnitId));
                } else {
                  prod.baseUnit = null;
                }
              }

              entities.push(entity);
              raw.push({ children_count: '0', product_count: '0', unit_count: '1' });
            }
          }
          return {
            raw: raw.slice(skipCount, skipCount + takeCount),
            entities: entities.slice(skipCount, skipCount + takeCount),
          };
        },
      };
      return qb as SelectQueryBuilder<T>;
    }) as any,
  };

  return repo as Repository<T>;
}

function createMockDataSource(store: MockStore): DataSource {
  const categoryRepo = createMockRepo(store.categories, InventoryCategoryEntity, store);
  const productRepo = createMockRepo(store.products, InventoryProductEntity, store);
  const unitRepo = createMockRepo(store.units, InventoryProductUnitEntity, store);

  const mockManager: Partial<EntityManager> = {
    getRepository: ((target: any) => {
      if (target === InventoryCategoryEntity) return categoryRepo;
      if (target === InventoryProductEntity) return productRepo;
      if (target === InventoryProductUnitEntity) return unitRepo;
      throw new Error('Unknown repository target in mock EntityManager');
    }) as any,
    query: async () => [],
  };

  const mockDataSource: Partial<DataSource> = {
    getRepository: ((target: any) => {
      if (target === InventoryCategoryEntity) return categoryRepo;
      if (target === InventoryProductEntity) return productRepo;
      if (target === InventoryProductUnitEntity) return unitRepo;
      throw new Error('Unknown repository target in mock DataSource');
    }) as any,
    transaction: (async (runInTransaction: (manager: EntityManager) => Promise<any>) => {
      return await runInTransaction(mockManager as EntityManager);
    }) as any,
  };

  return mockDataSource as DataSource;
}

// --- Test Suite ---

describe('Inventory Product Catalog Hardening & Service Regression Tests', () => {

  // =========================================================================
  // 1. PATCH DTO Null Contract Tests
  // =========================================================================
  describe('1. PATCH DTO Null Handling Contracts', () => {
    it('UpdateInventoryCategoryDto: rejects null for name and isActive, accepts null for description and parentId', async () => {
      // 1. name = null -> reject
      const dto1 = plainToInstance(UpdateInventoryCategoryDto, { name: null });
      const err1 = await validate(dto1);
      assert.ok(err1.some((e) => e.property === 'name'), 'Expected name=null to be rejected');

      // 2. isActive = null -> reject
      const dto2 = plainToInstance(UpdateInventoryCategoryDto, { isActive: null });
      const err2 = await validate(dto2);
      assert.ok(err2.some((e) => e.property === 'isActive'), 'Expected isActive=null to be rejected');

      // 3. description = null -> accept (clear description)
      const dto3 = plainToInstance(UpdateInventoryCategoryDto, { description: null });
      const err3 = await validate(dto3);
      assert.equal(err3.filter((e) => e.property === 'description').length, 0, 'Expected description=null to be valid');

      // 4. parentId = null -> accept (move to root)
      const dto4 = plainToInstance(UpdateInventoryCategoryDto, { parentId: null });
      const err4 = await validate(dto4);
      assert.equal(err4.filter((e) => e.property === 'parentId').length, 0, 'Expected parentId=null to be valid');

      // 5. valid update -> accept
      const dto5 = plainToInstance(UpdateInventoryCategoryDto, {
        name: 'خرسانة مسلحة',
        isActive: true,
        parentId: '11111111-1111-4111-8111-111111111111',
      });
      const err5 = await validate(dto5);
      assert.equal(err5.length, 0);
    });

    it('UpdateInventoryProductDto: rejects null for name and isActive, accepts null for description, locationName, categoryId', async () => {
      // 1. name = null -> reject
      const dto1 = plainToInstance(UpdateInventoryProductDto, { name: null });
      const err1 = await validate(dto1);
      assert.ok(err1.some((e) => e.property === 'name'), 'Expected name=null to be rejected');

      // 2. isActive = null -> reject
      const dto2 = plainToInstance(UpdateInventoryProductDto, { isActive: null });
      const err2 = await validate(dto2);
      assert.ok(err2.some((e) => e.property === 'isActive'), 'Expected isActive=null to be rejected');

      // 3. description = null -> accept
      const dto3 = plainToInstance(UpdateInventoryProductDto, { description: null });
      const err3 = await validate(dto3);
      assert.equal(err3.filter((e) => e.property === 'description').length, 0);

      // 4. locationName = null -> accept
      const dto4 = plainToInstance(UpdateInventoryProductDto, { locationName: null });
      const err4 = await validate(dto4);
      assert.equal(err4.filter((e) => e.property === 'locationName').length, 0);

      // 5. categoryId = null -> accept
      const dto5 = plainToInstance(UpdateInventoryProductDto, { categoryId: null });
      const err5 = await validate(dto5);
      assert.equal(err5.filter((e) => e.property === 'categoryId').length, 0);
    });

    it('UpdateInventoryProductUnitDto: rejects null for name, price, conversionQuantity, equivalentToUnitId; accepts null for barcode, specifications', async () => {
      // 1. name = null -> reject
      const dto1 = plainToInstance(UpdateInventoryProductUnitDto, { name: null });
      const err1 = await validate(dto1);
      assert.ok(err1.some((e) => e.property === 'name'));

      // 2. price = null -> reject
      const dto2 = plainToInstance(UpdateInventoryProductUnitDto, { price: null });
      const err2 = await validate(dto2);
      assert.ok(err2.some((e) => e.property === 'price'));

      // 3. conversionQuantity = null -> reject
      const dto3 = plainToInstance(UpdateInventoryProductUnitDto, { conversionQuantity: null });
      const err3 = await validate(dto3);
      assert.ok(err3.some((e) => e.property === 'conversionQuantity'));

      // 4. equivalentToUnitId = null -> reject
      const dto4 = plainToInstance(UpdateInventoryProductUnitDto, { equivalentToUnitId: null });
      const err4 = await validate(dto4);
      assert.ok(err4.some((e) => e.property === 'equivalentToUnitId'));

      // 5. barcode = null -> accept (clear barcode)
      const dto5 = plainToInstance(UpdateInventoryProductUnitDto, { barcode: null });
      const err5 = await validate(dto5);
      assert.equal(err5.filter((e) => e.property === 'barcode').length, 0);

      // 6. specifications = null -> accept (clear specifications)
      const dto6 = plainToInstance(UpdateInventoryProductUnitDto, { specifications: null });
      const err6 = await validate(dto6);
      assert.equal(err6.filter((e) => e.property === 'specifications').length, 0);
    });
  });

  // =========================================================================
  // 2. Technical Codes & Decimal Validation
  // =========================================================================
  describe('2. Technical Codes & Decimal Validation', () => {
    it('Price boundaries DECIMAL(18,4)', async () => {
      const valid = ['0', '1', '1.1234', '99999999999999.9999'];
      for (const price of valid) {
        const dto = plainToInstance(CreateInventoryProductUnitDto, {
          name: 'قطعة',
          price,
          equivalentToUnitId: '11111111-1111-4111-8111-111111111111',
          conversionQuantity: '1.000000',
        });
        const errs = await validate(dto);
        assert.equal(errs.length, 0, `Expected price ${price} to be valid`);
      }

      const invalid = ['-1', '1.12345', '100000000000000', 'abc'];
      for (const price of invalid) {
        const dto = plainToInstance(CreateInventoryProductUnitDto, {
          name: 'قطعة',
          price,
          equivalentToUnitId: '11111111-1111-4111-8111-111111111111',
          conversionQuantity: '1.000000',
        });
        const errs = await validate(dto);
        assert.ok(errs.length > 0, `Expected price ${price} to be invalid`);
      }
    });

    it('Conversion quantity boundaries DECIMAL(18,6) > 0', async () => {
      const valid = ['0.000001', '1', '1.123456', '999999999999.999999'];
      for (const qty of valid) {
        const dto = plainToInstance(CreateInventoryProductUnitDto, {
          name: 'كرتونة',
          price: '10.0000',
          equivalentToUnitId: '11111111-1111-4111-8111-111111111111',
          conversionQuantity: qty,
        });
        const errs = await validate(dto);
        assert.equal(errs.length, 0, `Expected qty ${qty} to be valid`);
      }

      const invalid = ['0', '-1', '0.0000001', '1.1234567', '1000000000000'];
      for (const qty of invalid) {
        const dto = plainToInstance(CreateInventoryProductUnitDto, {
          name: 'كرتونة',
          price: '10.0000',
          equivalentToUnitId: '11111111-1111-4111-8111-111111111111',
          conversionQuantity: qty,
        });
        const errs = await validate(dto);
        assert.ok(errs.length > 0, `Expected qty ${qty} to be invalid`);
      }
    });
  });

  // =========================================================================
  // 3. Real InventoryCategoryService Invariant Tests
  // =========================================================================
  describe('3. InventoryCategoryService Invariants', () => {
    it('Hierarchy 1: Self parent -> rejects with INVENTORY_CATEGORY_CYCLE', async () => {
      const store: MockStore = {
        categories: new Map([
          ['cat-1', { id: 'cat-1', name: 'Cat 1', code: 'CAT1', parentId: null, isActive: true, deletedAt: null } as any],
        ]),
        products: new Map(),
        units: new Map(),
      };
      const service = new InventoryCategoryService(createMockDataSource(store));

      await assert.rejects(
        service.updateCategory('cat-1', { parentId: 'cat-1' }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_CATEGORY_CYCLE'
      );
    });

    it('Hierarchy 2: Descendant as parent -> rejects cycle with INVENTORY_CATEGORY_CYCLE', async () => {
      // Tree: cat-1 -> cat-2 -> cat-3
      // Trying to make cat-1 parent of cat-3 => cycle (cat-1 parent becomes cat-3)
      const store: MockStore = {
        categories: new Map([
          ['cat-1', { id: 'cat-1', name: 'Cat 1', code: 'CAT1', parentId: null, isActive: true, deletedAt: null } as any],
          ['cat-2', { id: 'cat-2', name: 'Cat 2', code: 'CAT2', parentId: 'cat-1', isActive: true, deletedAt: null } as any],
          ['cat-3', { id: 'cat-3', name: 'Cat 3', code: 'CAT3', parentId: 'cat-2', isActive: true, deletedAt: null } as any],
        ]),
        products: new Map(),
        units: new Map(),
      };
      const service = new InventoryCategoryService(createMockDataSource(store));

      await assert.rejects(
        service.updateCategory('cat-1', { parentId: 'cat-3' }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_CATEGORY_CYCLE'
      );
    });

    it('Hierarchy 3 & 4: Missing ancestor -> fails closed with INVENTORY_CATEGORY_HIERARCHY_INCONSISTENT', async () => {
      const store: MockStore = {
        categories: new Map([
          ['cat-target', { id: 'cat-target', name: 'Target', code: 'TGT', parentId: null, isActive: true, deletedAt: null } as any],
          ['cat-parent', { id: 'cat-parent', name: 'Parent', code: 'PAR', parentId: 'missing-ancestor', isActive: true, deletedAt: null } as any],
        ]),
        products: new Map(),
        units: new Map(),
      };
      const service = new InventoryCategoryService(createMockDataSource(store));

      await assert.rejects(
        service.updateCategory('cat-target', { parentId: 'cat-parent' }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_CATEGORY_HIERARCHY_INCONSISTENT'
      );
    });

    it('Hierarchy 5: Soft-deleted ancestor -> fails closed with INVENTORY_CATEGORY_HIERARCHY_INCONSISTENT', async () => {
      const store: MockStore = {
        categories: new Map([
          ['cat-target', { id: 'cat-target', name: 'Target', code: 'TGT', parentId: null, isActive: true, deletedAt: null } as any],
          ['cat-parent', { id: 'cat-parent', name: 'Parent', code: 'PAR', parentId: 'cat-grand', isActive: true, deletedAt: null } as any],
          ['cat-grand', { id: 'cat-grand', name: 'Grand', code: 'GRN', parentId: null, isActive: true, deletedAt: new Date() } as any],
        ]),
        products: new Map(),
        units: new Map(),
      };
      const service = new InventoryCategoryService(createMockDataSource(store));

      await assert.rejects(
        service.updateCategory('cat-target', { parentId: 'cat-parent' }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_CATEGORY_HIERARCHY_INCONSISTENT'
      );
    });

    it('Disable 6 & 7: Reject disabling category if child category exists', async () => {
      const store: MockStore = {
        categories: new Map([
          ['cat-parent', { id: 'cat-parent', name: 'Parent', code: 'PAR', parentId: null, isActive: true, deletedAt: null } as any],
          ['cat-child', { id: 'cat-child', name: 'Child', code: 'CHD', parentId: 'cat-parent', isActive: false, deletedAt: null } as any],
        ]),
        products: new Map(),
        units: new Map(),
      };
      const service = new InventoryCategoryService(createMockDataSource(store));

      await assert.rejects(
        service.updateCategory('cat-parent', { isActive: false }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_CATEGORY_HAS_CHILDREN'
      );
    });

    it('Disable 8 & 9: Reject disabling category if product exists', async () => {
      const store: MockStore = {
        categories: new Map([
          ['cat-1', { id: 'cat-1', name: 'Cat 1', code: 'CAT1', parentId: null, isActive: true, deletedAt: null } as any],
        ]),
        products: new Map([
          ['prod-1', { id: 'prod-1', name: 'P1', code: 'P1', categoryId: 'cat-1', baseUnitId: 'u1', isActive: false, deletedAt: null } as any],
        ]),
        units: new Map(),
      };
      const service = new InventoryCategoryService(createMockDataSource(store));

      await assert.rejects(
        service.updateCategory('cat-1', { isActive: false }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_CATEGORY_HAS_PRODUCTS'
      );
    });

    it('Archive 10 & 11: Reject archiving category if child category or product exists', async () => {
      const storeWithChild: MockStore = {
        categories: new Map([
          ['cat-p', { id: 'cat-p', name: 'Parent', code: 'PAR', parentId: null, isActive: true, deletedAt: null } as any],
          ['cat-c', { id: 'cat-c', name: 'Child', code: 'CHD', parentId: 'cat-p', isActive: false, deletedAt: null } as any],
        ]),
        products: new Map(),
        units: new Map(),
      };
      const service1 = new InventoryCategoryService(createMockDataSource(storeWithChild));
      await assert.rejects(
        service1.softDeleteCategory('cat-p'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_CATEGORY_HAS_CHILDREN'
      );

      const storeWithProd: MockStore = {
        categories: new Map([
          ['cat-1', { id: 'cat-1', name: 'Cat 1', code: 'CAT1', parentId: null, isActive: true, deletedAt: null } as any],
        ]),
        products: new Map([
          ['prod-1', { id: 'prod-1', name: 'P1', code: 'P1', categoryId: 'cat-1', baseUnitId: 'u1', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map(),
      };
      const service2 = new InventoryCategoryService(createMockDataSource(storeWithProd));
      await assert.rejects(
        service2.softDeleteCategory('cat-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_CATEGORY_HAS_PRODUCTS'
      );
    });
  });

  // =========================================================================
  // 4. Real InventoryProductService Base Unit Invariant Tests
  // =========================================================================
  describe('4. InventoryProductService Base Unit Invariants', () => {
    it('Base Unit 1: Product missing baseUnitId -> fails closed with INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: null, isActive: true, deletedAt: null } as any],
        ]),
        units: new Map(),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.getProductById('p-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    });

    it('Base Unit 2: Base Unit row missing -> fails closed with INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-missing', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map(),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.getProductById('p-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    });

    it('Base Unit 3: Base Unit row soft-deleted -> fails closed with INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-1', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-1', { id: 'u-1', productId: 'p-1', name: 'Unit 1', price: '10', deletedAt: new Date() } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.getProductById('p-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    });

    it('Base Unit 4: Base Unit belongs to another Product -> fails closed with INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-2', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-2', { id: 'u-2', productId: 'p-OTHER', name: 'Unit 2', price: '10', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.getProductById('p-1'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    });

    it('Base Unit 5: Valid Base Unit -> succeeds', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-1', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-1', { id: 'u-1', productId: 'p-1', name: 'Piece', price: '10', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));
      const res = await service.getProductById('p-1');
      assert.equal(res.id, 'p-1');
      assert.equal(res.baseUnitName, 'Piece');
    });

    it('Base Unit 6: listProducts fails closed when encountering a corrupt Base Unit', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          // Product with missing baseUnit
          ['p-corrupt', { id: 'p-corrupt', name: 'Corrupt', code: 'CORRUPT', baseUnitId: 'u-nonexistent', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map(),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.listProducts({ page: 1, limit: 20 }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    });

    it('Base Unit 7, 8, 9, 10: Unit operations fail closed if Base Unit is corrupt', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: null, isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-add', { id: 'u-add', productId: 'p-1', name: 'Add', price: '10', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      // listUnits
      await assert.rejects(
        service.listUnits('p-1', { page: 1, limit: 20 }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );

      // createUnit
      await assert.rejects(
        service.createUnit('p-1', { name: 'Box', price: '10', equivalentToUnitId: 'u-add', conversionQuantity: '5' }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );

      // updateUnit
      await assert.rejects(
        service.updateUnit('p-1', 'u-add', { price: '20' }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );

      // softDeleteUnit
      await assert.rejects(
        service.softDeleteUnit('p-1', 'u-add'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT'
      );
    });
  });

  // =========================================================================
  // 5. Unit Conversion Chain Invariant Tests
  // =========================================================================
  describe('5. Unit Conversion Invariants', () => {
    it('Conversion 1: Base Unit cannot have conversion changed on updateUnit', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-base', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-base', { id: 'u-base', productId: 'p-1', name: 'Base', price: '10', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.updateUnit('p-1', 'u-base', { conversionQuantity: '5' }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_CONVERSION_IMMUTABLE'
      );
    });

    it('Conversion 2: Base Unit cannot be deleted', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-base', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-base', { id: 'u-base', productId: 'p-1', name: 'Base', price: '10', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.softDeleteUnit('p-1', 'u-base'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_BASE_UNIT_CANNOT_BE_DELETED'
      );
    });

    it('Conversion 3: Equivalent Unit from another Product rejected', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-base-1', isActive: true, deletedAt: null } as any],
          ['p-2', { id: 'p-2', name: 'P2', code: 'P2', baseUnitId: 'u-base-2', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-base-1', { id: 'u-base-1', productId: 'p-1', name: 'Base1', price: '10', deletedAt: null } as any],
          ['u-base-2', { id: 'u-base-2', productId: 'p-2', name: 'Base2', price: '20', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.createUnit('p-1', {
          name: 'Pack',
          price: '50',
          equivalentToUnitId: 'u-base-2',
          conversionQuantity: '10',
        }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_UNIT_REFERENCE_OUTSIDE_PRODUCT'
      );
    });

    it('Conversion 4: Equivalent Unit missing rejected', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-base', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-base', { id: 'u-base', productId: 'p-1', name: 'Base', price: '10', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.createUnit('p-1', {
          name: 'Pack',
          price: '50',
          equivalentToUnitId: 'non-existent-unit',
          conversionQuantity: '10',
        }),
        (err: any) => err instanceof NotFoundError && err.code === 'INVENTORY_PRODUCT_UNIT_REFERENCE_NOT_FOUND'
      );
    });

    it('Conversion 5 & 6: Self-reference and direct cycle rejected on updateUnit', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-base', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-base', { id: 'u-base', productId: 'p-1', name: 'Base', price: '10', deletedAt: null } as any],
          ['u-pack', { id: 'u-pack', productId: 'p-1', name: 'Pack', equivalentToUnitId: 'u-base', conversionQuantity: '5', price: '50', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.updateUnit('p-1', 'u-pack', { equivalentToUnitId: 'u-pack' }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_UNIT_CONVERSION_CYCLE'
      );
    });

    it('Conversion 7 & 8: Indirect cycle & broken chain rejected', async () => {
      // Chain: u-box -> u-pack -> u-base
      // Trying to set u-pack -> u-box would create cycle
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-base', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-base', { id: 'u-base', productId: 'p-1', name: 'Base', price: '10', deletedAt: null } as any],
          ['u-pack', { id: 'u-pack', productId: 'p-1', name: 'Pack', equivalentToUnitId: 'u-base', conversionQuantity: '5', price: '50', deletedAt: null } as any],
          ['u-box', { id: 'u-box', productId: 'p-1', name: 'Box', equivalentToUnitId: 'u-pack', conversionQuantity: '10', price: '500', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.updateUnit('p-1', 'u-pack', { equivalentToUnitId: 'u-box' }),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_UNIT_CONVERSION_CYCLE'
      );
    });

    it('Conversion 9: Chain terminating correctly at Base Unit is accepted', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-base', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-base', { id: 'u-base', productId: 'p-1', name: 'Base', price: '10', deletedAt: null } as any],
          ['u-pack', { id: 'u-pack', productId: 'p-1', name: 'Pack', equivalentToUnitId: 'u-base', conversionQuantity: '5', price: '50', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      const created = await service.createUnit('p-1', {
        name: 'Pallet',
        price: '1000',
        equivalentToUnitId: 'u-pack',
        conversionQuantity: '20',
      });

      assert.equal(created.name, 'Pallet');
      assert.equal(created.equivalentToUnitId, 'u-pack');
    });

    it('Conversion 10: Unit with dependents cannot be archived', async () => {
      const store: MockStore = {
        categories: new Map(),
        products: new Map([
          ['p-1', { id: 'p-1', name: 'P1', code: 'P1', baseUnitId: 'u-base', isActive: true, deletedAt: null } as any],
        ]),
        units: new Map([
          ['u-base', { id: 'u-base', productId: 'p-1', name: 'Base', price: '10', deletedAt: null } as any],
          ['u-pack', { id: 'u-pack', productId: 'p-1', name: 'Pack', equivalentToUnitId: 'u-base', conversionQuantity: '5', price: '50', deletedAt: null } as any],
          ['u-box', { id: 'u-box', productId: 'p-1', name: 'Box', equivalentToUnitId: 'u-pack', conversionQuantity: '10', price: '500', deletedAt: null } as any],
        ]),
      };
      const service = new InventoryProductService(createMockDataSource(store));

      await assert.rejects(
        service.softDeleteUnit('p-1', 'u-pack'),
        (err: any) => err instanceof BusinessRuleError && err.code === 'INVENTORY_PRODUCT_UNIT_HAS_DEPENDENTS'
      );
    });
  });

  // =========================================================================
  // 6. Real Service MySQL Duplicate Key Error Mapping Tests (1062 / ER_DUP_ENTRY)
  // =========================================================================
  describe('6. MySQL Duplicate Key Error Mapping', () => {
    it('Product Service maps QueryFailedError with driverError 1062 for product code to INVENTORY_PRODUCT_CODE_ALREADY_EXISTS', async () => {
      const qfError = new QueryFailedError('query', [], new Error('Duplicate entry'));
      (qfError as any).driverError = {
        code: 'ER_DUP_ENTRY',
        errno: 1062,
        sqlMessage: "Duplicate entry 'PRD01' for key 'inventory_product.UQ_inventory_product_code'",
      };

      const failingDataSource: Partial<DataSource> = {
        getRepository: (() => ({
          findOne: async () => null, // pre-check passes
        })) as any,
        transaction: (async () => {
          throw qfError;
        }) as any,
      };

      const service = new InventoryProductService(failingDataSource as DataSource);

      await assert.rejects(
        service.createProduct({
          name: 'Concrete',
          code: 'PRD01',
          baseUnit: { name: 'm3', price: '100' },
        }),
        (err: any) => err instanceof ConflictError && err.code === 'INVENTORY_PRODUCT_CODE_ALREADY_EXISTS'
      );
    });

    it('Product Service maps QueryFailedError with driverError 1062 for unit barcode to INVENTORY_PRODUCT_UNIT_BARCODE_ALREADY_EXISTS', async () => {
      const qfError = new QueryFailedError('query', [], new Error('Duplicate entry'));
      (qfError as any).driverError = {
        code: 'ER_DUP_ENTRY',
        errno: 1062,
        sqlMessage: "Duplicate entry '123456789' for key 'inventory_product_unit.UQ_inventory_product_unit_barcode'",
      };

      const failingDataSource: Partial<DataSource> = {
        getRepository: (() => ({
          findOne: async () => null,
        })) as any,
        transaction: (async () => {
          throw qfError;
        }) as any,
      };

      const service = new InventoryProductService(failingDataSource as DataSource);

      await assert.rejects(
        service.createProduct({
          name: 'Concrete',
          code: 'PRD02',
          baseUnit: { name: 'm3', price: '100', barcode: '123456789' },
        }),
        (err: any) => err instanceof ConflictError && err.code === 'INVENTORY_PRODUCT_UNIT_BARCODE_ALREADY_EXISTS'
      );
    });

    it('Product Service maps QueryFailedError with driverError 1062 for unit name to INVENTORY_PRODUCT_UNIT_NAME_ALREADY_EXISTS', async () => {
      const qfError = new QueryFailedError('query', [], new Error('Duplicate entry'));
      (qfError as any).driverError = {
        code: 'ER_DUP_ENTRY',
        errno: 1062,
        sqlMessage: "Duplicate entry 'p1-Box' for key 'inventory_product_unit.UQ_inventory_product_unit_product_name'",
      };

      const failingDataSource: Partial<DataSource> = {
        getRepository: (() => ({
          findOne: async () => null,
        })) as any,
        transaction: (async () => {
          throw qfError;
        }) as any,
      };

      const service = new InventoryProductService(failingDataSource as DataSource);

      await assert.rejects(
        service.createUnit('p-1', {
          name: 'Box',
          price: '10',
          equivalentToUnitId: 'u-base',
          conversionQuantity: '5',
        }),
        (err: any) => err instanceof ConflictError && err.code === 'INVENTORY_PRODUCT_UNIT_NAME_ALREADY_EXISTS'
      );
    });
  });

  // =========================================================================
  // 7. Category Options Pagination Test
  // =========================================================================
  describe('7. Category Options Pagination', () => {
    it('CategoryOptionsQueryDto validates page and limit parameters', async () => {
      const dto = plainToInstance(CategoryOptionsQueryDto, { page: 2, limit: 100, search: 'test' });
      const errs = await validate(dto);
      assert.equal(errs.length, 0);

      const invalidDto = plainToInstance(CategoryOptionsQueryDto, { page: 0, limit: 150 });
      const errsInvalid = await validate(invalidDto);
      assert.ok(errsInvalid.some((e) => e.property === 'page'));
      assert.ok(errsInvalid.some((e) => e.property === 'limit'));
    });

    it('InventoryCategoryService.listOptions supports pagination across pages without truncation', async () => {
      const categoriesMap = new Map<string, InventoryCategoryEntity>();
      for (let i = 1; i <= 25; i++) {
        const id = `cat-${i}`;
        categoriesMap.set(id, {
          id,
          name: `Category ${i.toString().padStart(2, '0')}`,
          code: `CAT_${i}`,
          parentId: null,
          isActive: true,
          deletedAt: null,
        } as any);
      }

      const store: MockStore = {
        categories: categoriesMap,
        products: new Map(),
        units: new Map(),
      };
      const service = new InventoryCategoryService(createMockDataSource(store));

      // Fetch page 1 (limit 10)
      const page1 = await service.listOptions({ page: 1, limit: 10 });
      assert.equal(page1.page, 1);
      assert.equal(page1.limit, 10);
      assert.equal(page1.total, 25);
      assert.equal(page1.totalPages, 3);
      assert.equal(page1.items.length, 10);

      // Fetch page 2 (limit 10)
      const page2 = await service.listOptions({ page: 2, limit: 10 });
      assert.equal(page2.page, 2);
      assert.equal(page2.items.length, 10);

      // Fetch page 3 (limit 10)
      const page3 = await service.listOptions({ page: 3, limit: 10 });
      assert.equal(page3.page, 3);
      assert.equal(page3.items.length, 5);

      // All 25 items retrieved without truncation
      const allIds = [...page1.items, ...page2.items, ...page3.items].map((c) => c.id);
      assert.equal(allIds.length, 25);
    });
  });

  // =========================================================================
  // 8. Migration Registration Invariant Test
  // =========================================================================
  describe('8. Migration Registration Invariant', () => {
    it('databaseConfig.migrations explicitly includes HardenInventoryCatalogConstraints1710000000006', () => {
      assert.ok(Array.isArray(databaseConfig.migrations), 'databaseConfig.migrations must be an array');
      const migrations = databaseConfig.migrations as unknown[];
      assert.ok(
        migrations.includes(HardenInventoryCatalogConstraints1710000000006),
        'HardenInventoryCatalogConstraints1710000000006 must be registered in databaseConfig.migrations'
      );
    });
  });
});
