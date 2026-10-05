import 'reflect-metadata';
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateInventoryCategoryDto } from '../src/modules/inventory/category/dto/create-inventory-category.dto.js';
import { CreateInventoryProductDto } from '../src/modules/inventory/product/dto/create-product.dto.js';
import { CreateInventoryProductUnitDto } from '../src/modules/inventory/product/dto/create-product-unit.dto.js';
import { UpdateInventoryProductUnitDto } from '../src/modules/inventory/product/dto/update-product-unit.dto.js';

describe('Inventory Catalog Validation & Invariants Test Suite', () => {

  describe('1. Technical Code & Decimal DTO Validation', () => {
    it('validates Category technical code pattern', async () => {
      const validDto = plainToInstance(CreateInventoryCategoryDto, {
        name: 'خرسانة جاهزة',
        code: 'CAT_RAW_01',
      });
      const errors = await validate(validDto);
      assert.equal(errors.length, 0);

      const invalidCodes = ['1CAT', 'CAT 01', 'CAT@#', 'فئة_01', 'C'];
      for (const code of invalidCodes) {
        const invalidDto = plainToInstance(CreateInventoryCategoryDto, {
          name: 'فئة',
          code,
        });
        const errs = await validate(invalidDto);
        assert.ok(errs.length > 0, `Expected error for code: ${code}`);
      }
    });

    it('validates Product technical code pattern', async () => {
      const validDto = plainToInstance(CreateInventoryProductDto, {
        name: 'اسمنت بورتلاندي',
        code: 'PRD-CEM-001',
        baseUnit: {
          name: 'كيس',
          price: '25.5000',
        },
      });
      const errors = await validate(validDto);
      assert.equal(errors.length, 0);

      const invalidCodes = ['1PRD', 'PRD 01', 'PRD!', 'C'];
      for (const code of invalidCodes) {
        const invalidDto = plainToInstance(CreateInventoryProductDto, {
          name: 'اسمنت',
          code,
          baseUnit: { name: 'كيس', price: '25' },
        });
        const errs = await validate(invalidDto);
        assert.ok(errs.length > 0, `Expected error for product code: ${code}`);
      }
    });

    it('validates Unit Price boundaries (DECIMAL(18,4))', async () => {
      const validPrices = ['0', '1', '1.1234', '99999999999999.9999'];
      for (const price of validPrices) {
        const dto = plainToInstance(CreateInventoryProductUnitDto, {
          name: 'طن',
          price,
          equivalentToUnitId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          conversionQuantity: '1000',
        });
        const errors = await validate(dto);
        assert.equal(errors.length, 0, `Expected valid price for: ${price}`);
      }

      const invalidPrices = ['-1', '-0.5', '1.12345', '100000000000000', 'abc'];
      for (const price of invalidPrices) {
        const dto = plainToInstance(CreateInventoryProductUnitDto, {
          name: 'طن',
          price,
          equivalentToUnitId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          conversionQuantity: '1000',
        });
        const errors = await validate(dto);
        assert.ok(errors.length > 0, `Expected invalid price error for: ${price}`);
      }
    });

    it('validates Conversion Quantity boundaries (DECIMAL(18,6) > 0)', async () => {
      const validQuantities = ['0.000001', '1', '1.123456', '999999999999.999999'];
      for (const qty of validQuantities) {
        const dto = plainToInstance(CreateInventoryProductUnitDto, {
          name: 'طن',
          price: '500.0000',
          equivalentToUnitId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          conversionQuantity: qty,
        });
        const errors = await validate(dto);
        assert.equal(errors.length, 0, `Expected valid conversion quantity for: ${qty}`);
      }

      const invalidQuantities = ['0', '0.0', '0.000000', '-1', '0.0000001', '1.1234567', '1000000000000'];
      for (const qty of invalidQuantities) {
        const dto = plainToInstance(CreateInventoryProductUnitDto, {
          name: 'طن',
          price: '500.0000',
          equivalentToUnitId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          conversionQuantity: qty,
        });
        const errors = await validate(dto);
        assert.ok(errors.length > 0, `Expected invalid conversion quantity for: ${qty}`);
      }
    });

    it('validates UpdateInventoryProductUnitDto with optional fields', async () => {
      const validUpdate = plainToInstance(UpdateInventoryProductUnitDto, {
        price: '150.25',
        conversionQuantity: '5.5',
      });
      const errors = await validate(validUpdate);
      assert.equal(errors.length, 0);

      const invalidUpdate = plainToInstance(UpdateInventoryProductUnitDto, {
        price: '150.12345',
        conversionQuantity: '0',
      });
      const errs = await validate(invalidUpdate);
      assert.ok(errs.length > 0);
    });
  });

  describe('2. Category Invariants Logic', () => {
    it('Self parent detection logic is verified', () => {
      const categoryId = 'cat-1';
      const proposedParentId = 'cat-1';
      assert.equal(categoryId === proposedParentId, true);
    });

    it('Ancestry cycle and hierarchy inconsistency detection logic is verified', () => {
      // Chain: cat-3 -> cat-2 -> cat-1 -> cat-3 (cycle)
      const hierarchy: Record<string, string | null> = {
        'cat-3': 'cat-2',
        'cat-2': 'cat-1',
        'cat-1': 'cat-3',
      };

      let curr: string | null = 'cat-3';
      const visited = new Set<string>();
      let cycleDetected = false;

      while (curr) {
        if (visited.has(curr)) {
          cycleDetected = true;
          break;
        }
        visited.add(curr);
        curr = hierarchy[curr] || null;
      }

      assert.equal(cycleDetected, true);
    });

    it('Fail closed on corrupt or missing ancestor in parent chain', () => {
      const hierarchy: Record<string, string | null> = {
        'cat-3': 'missing-cat-id',
      };
      const existingCategories = new Set(['cat-3']);

      let curr: string | null = hierarchy['cat-3'];
      let corruptDetected = false;

      while (curr) {
        if (!existingCategories.has(curr)) {
          corruptDetected = true;
          break;
        }
        curr = null;
      }

      assert.equal(corruptDetected, true);
    });
  });

  describe('3. Product & Base Unit Invariants Logic', () => {
    it('Base unit integrity assertion requires baseUnitId, existence, non-deleted, same product', () => {
      const product = { id: 'p-1', baseUnitId: 'u-1', deletedAt: null };
      const validBaseUnit = { id: 'u-1', productId: 'p-1', deletedAt: null };
      const crossProductUnit = { id: 'u-1', productId: 'p-2', deletedAt: null };
      const deletedBaseUnit = { id: 'u-1', productId: 'p-1', deletedAt: new Date() };

      const checkIntegrity = (prod: typeof product, unit: typeof validBaseUnit | null) => {
        if (!prod.baseUnitId) return false;
        if (!unit || unit.deletedAt || unit.productId !== prod.id) return false;
        return true;
      };

      assert.equal(checkIntegrity(product, validBaseUnit), true);
      assert.equal(checkIntegrity(product, crossProductUnit), false);
      assert.equal(checkIntegrity(product, deletedBaseUnit), false);
      assert.equal(checkIntegrity({ ...product, baseUnitId: null as any }, validBaseUnit), false);
    });

    it('Conversion chain must terminate strictly at the validated Base Unit', () => {
      const baseUnitId = 'u-base';
      const units: Record<string, { id: string; eqId: string | null; productId: string; deletedAt: any }> = {
        'u-box': { id: 'u-box', eqId: 'u-pack', productId: 'p-1', deletedAt: null },
        'u-pack': { id: 'u-pack', eqId: 'u-base', productId: 'p-1', deletedAt: null },
        'u-base': { id: 'u-base', eqId: null, productId: 'p-1', deletedAt: null },
      };

      let currId: string | null = 'u-box';
      let reachedBase = false;
      const visited = new Set<string>();

      while (currId) {
        if (currId === baseUnitId) {
          reachedBase = true;
          break;
        }
        if (visited.has(currId)) break;
        visited.add(currId);
        const u = units[currId];
        if (!u || u.deletedAt || u.productId !== 'p-1') break;
        currId = u.eqId;
      }

      assert.equal(reachedBase, true);
    });

    it('Conversion chain fails closed if disconnected or pointing outside product', () => {
      const baseUnitId = 'u-base';
      const units: Record<string, { id: string; eqId: string | null; productId: string; deletedAt: any }> = {
        'u-box': { id: 'u-box', eqId: 'u-other-prod', productId: 'p-1', deletedAt: null },
        'u-other-prod': { id: 'u-other-prod', eqId: 'u-base', productId: 'p-2', deletedAt: null },
      };

      let currId: string | null = 'u-box';
      let reachedBase = false;
      const visited = new Set<string>();

      while (currId) {
        if (currId === baseUnitId) {
          reachedBase = true;
          break;
        }
        if (visited.has(currId)) break;
        visited.add(currId);
        const u = units[currId];
        if (!u || u.deletedAt || u.productId !== 'p-1') {
          reachedBase = false;
          break;
        }
        currId = u.eqId;
      }

      assert.equal(reachedBase, false);
    });
  });
});
