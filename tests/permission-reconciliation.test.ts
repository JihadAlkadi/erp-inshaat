import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EntityManager, Repository } from 'typeorm';

import { PermissionEntity } from '../src/modules/system/permission/permission.entity.js';
import { RoleEntity } from '../src/modules/system/role/role.entity.js';
import { PermissionGrantEntity } from '../src/modules/system/permission-grant/permission-grant.entity.js';
import { AccessRuleEntity } from '../src/modules/system/access-rule/access-rule.entity.js';
import { SystemPermission } from '../src/modules/system/permission/constants/system-permission.enum.js';
import { SystemRole } from '../src/modules/system/role/constants/system-role.enum.js';
import {
  reconcileSystemPermissions,
} from '../src/modules/system/permission/services/permission-reconciliation.service.js';
import {
  ALL_SYSTEM_PERMISSION_DEFINITIONS,
  SYSTEM_PERMISSION_DEFINITIONS,
} from '../src/modules/system/permission/constants/system-permission.registry.js';

// --- In-Memory Mock Store for Permissions, Roles, Grants, and Access Rules ---

interface MockStore {
  permissions: Map<string, PermissionEntity>;
  roles: Map<string, RoleEntity>;
  grants: Map<string, PermissionGrantEntity>;
  rules: Map<string, AccessRuleEntity>;
}

function createMockRepository<T extends { id: string }>(
  map: Map<string, T>,
  entityClass: new () => T,
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
      for (const item of map.values()) {
        let match = true;
        for (const [key, val] of Object.entries(where)) {
          if (item[key as keyof T] !== val) {
            match = false;
            break;
          }
        }
        if (match) return item;
      }
      return null;
    }) as any,

    find: (async (options: any) => {
      const where = options?.where || {};
      const results: T[] = [];
      for (const item of map.values()) {
        let match = true;
        for (const [key, val] of Object.entries(where)) {
          if (item[key as keyof T] !== val) {
            match = false;
            break;
          }
        }
        if (match) results.push(item);
      }
      return results;
    }) as any,

    save: (async (entity: any) => {
      if (!entity.id) entity.id = 'mock-id-' + Math.random().toString(36).substring(2, 9);
      map.set(entity.id, entity);
      return entity;
    }) as any,
  };

  return repo as Repository<T>;
}

function createMockEntityManager(store: MockStore): EntityManager {
  const permRepo = createMockRepository(store.permissions, PermissionEntity);
  const roleRepo = createMockRepository(store.roles, RoleEntity);
  const grantRepo = createMockRepository(store.grants, PermissionGrantEntity);
  const ruleRepo = createMockRepository(store.rules, AccessRuleEntity);

  const manager: Partial<EntityManager> = {
    getRepository: ((target: any) => {
      if (target === PermissionEntity) return permRepo;
      if (target === RoleEntity) return roleRepo;
      if (target === PermissionGrantEntity) return grantRepo;
      if (target === AccessRuleEntity) return ruleRepo;
      throw new Error('Unsupported repository target: ' + target?.name);
    }) as any,
  };

  return manager as EntityManager;
}

describe('SYSTEM_ADMIN Permission Registry and Runtime Reconciliation Tests', () => {
  it('1. Exhaustive Registry: Every SystemPermission enum value has a definition', () => {
    const enumValues = Object.values(SystemPermission);
    assert.strictEqual(
      ALL_SYSTEM_PERMISSION_DEFINITIONS.length,
      enumValues.length,
      'Registry must define exactly every enum value'
    );

    for (const val of enumValues) {
      assert.ok(
        SYSTEM_PERMISSION_DEFINITIONS[val],
        `Missing permission definition for: ${val}`
      );
      assert.strictEqual(
        SYSTEM_PERMISSION_DEFINITIONS[val].name,
        val,
        `Definition name must match key for ${val}`
      );
    }
  });

  it('2. Initial Reconciliation: Registers all permissions and assigns active ALLOW ALL to SYSTEM_ADMIN', async () => {
    const store: MockStore = {
      permissions: new Map(),
      roles: new Map(),
      grants: new Map(),
      rules: new Map(),
    };

    // Pre-seed SYSTEM_ADMIN role
    const adminRoleId = 'admin-role-uuid';
    const adminRole = new RoleEntity();
    adminRole.id = adminRoleId;
    adminRole.code = SystemRole.SYSTEM_ADMIN;
    adminRole.name = 'مدير النظام';
    adminRole.isActive = true;
    store.roles.set(adminRoleId, adminRole);

    const manager = createMockEntityManager(store);
    const result = await reconcileSystemPermissions(manager);

    assert.strictEqual(
      result.permissionsSynced,
      ALL_SYSTEM_PERMISSION_DEFINITIONS.length,
      'All code-defined permissions must be synced'
    );
    assert.strictEqual(
      store.permissions.size,
      ALL_SYSTEM_PERMISSION_DEFINITIONS.length,
      'DB must have all permissions registered'
    );
    assert.strictEqual(
      store.grants.size,
      ALL_SYSTEM_PERMISSION_DEFINITIONS.length,
      'SYSTEM_ADMIN must receive a grant for every active permission'
    );
    assert.strictEqual(
      store.rules.size,
      ALL_SYSTEM_PERMISSION_DEFINITIONS.length,
      'SYSTEM_ADMIN must receive an ALLOW ALL rule for every grant'
    );

    // Verify properties of every grant and access rule
    for (const grant of store.grants.values()) {
      assert.strictEqual(grant.roleId, adminRoleId);
      assert.strictEqual(grant.userId, null);
      assert.strictEqual(grant.isActive, true);
      assert.strictEqual(grant.canDelegate, true);
      assert.strictEqual(grant.expiresAt, null);

      // Verify associated rule
      const rule = Array.from(store.rules.values()).find(
        (r) => r.permissionGrantId === grant.id
      );
      assert.ok(rule, `Every grant must have an access rule`);
      assert.strictEqual(rule.effect, 'ALLOW');
      assert.strictEqual(rule.scopeType, 'ALL');
      assert.strictEqual(rule.scope, null);
      assert.strictEqual(rule.isActive, true);
    }
  });

  it('3. Idempotency: Multiple reconciliation runs do not create duplicate permissions, grants, or rules', async () => {
    const store: MockStore = {
      permissions: new Map(),
      roles: new Map(),
      grants: new Map(),
      rules: new Map(),
    };

    const adminRole = new RoleEntity();
    adminRole.id = 'admin-role-uuid';
    adminRole.code = SystemRole.SYSTEM_ADMIN;
    adminRole.name = 'مدير النظام';
    adminRole.isActive = true;
    store.roles.set(adminRole.id, adminRole);

    const manager = createMockEntityManager(store);

    // Run 1
    await reconcileSystemPermissions(manager);
    const count1 = {
      permissions: store.permissions.size,
      grants: store.grants.size,
      rules: store.rules.size,
    };

    // Run 2
    const result2 = await reconcileSystemPermissions(manager);
    assert.strictEqual(result2.permissionsSynced, 0);
    assert.strictEqual(result2.grantsReconciled, 0);
    assert.strictEqual(result2.rulesReconciled, 0);

    // Run 3
    const result3 = await reconcileSystemPermissions(manager);
    assert.strictEqual(result3.permissionsSynced, 0);
    assert.strictEqual(result3.grantsReconciled, 0);
    assert.strictEqual(result3.rulesReconciled, 0);

    assert.strictEqual(store.permissions.size, count1.permissions);
    assert.strictEqual(store.grants.size, count1.grants);
    assert.strictEqual(store.rules.size, count1.rules);
  });

  it('4. System Admin Grant & Access Rule Repair: Reactivates inactive grants and corrupted scopes', async () => {
    const store: MockStore = {
      permissions: new Map(),
      roles: new Map(),
      grants: new Map(),
      rules: new Map(),
    };

    const adminRole = new RoleEntity();
    adminRole.id = 'admin-role-uuid';
    adminRole.code = SystemRole.SYSTEM_ADMIN;
    adminRole.name = 'مدير النظام';
    adminRole.isActive = true;
    store.roles.set(adminRole.id, adminRole);

    const manager = createMockEntityManager(store);
    await reconcileSystemPermissions(manager);

    // Intentionally corrupt state for one grant & rule:
    const firstGrant = Array.from(store.grants.values())[0];
    firstGrant.isActive = false;
    firstGrant.expiresAt = new Date('2020-01-01');
    firstGrant.canDelegate = false;

    const firstRule = Array.from(store.rules.values()).find(
      (r) => r.permissionGrantId === firstGrant.id
    )!;
    firstRule.isActive = false;
    firstRule.scope = { departmentIds: ['dep-1'] } as any;

    // Run reconciliation again
    const repairResult = await reconcileSystemPermissions(manager);
    assert.ok(repairResult.grantsReconciled >= 1, 'Grant was repaired');
    assert.ok(repairResult.rulesReconciled >= 1, 'Rule was repaired');

    // Verify repaired values
    assert.strictEqual(firstGrant.isActive, true, 'Grant reactivated');
    assert.strictEqual(firstGrant.expiresAt, null, 'Grant expiresAt reset to null');
    assert.strictEqual(firstGrant.canDelegate, true, 'Grant canDelegate reset to true');
    assert.strictEqual(firstRule.isActive, true, 'Rule reactivated');
    assert.strictEqual(firstRule.scope, null, 'Corrupted scope reset to null');
  });

  it('5. No Other Role Escalation: Regular roles are never automatically granted permissions or rules', async () => {
    const store: MockStore = {
      permissions: new Map(),
      roles: new Map(),
      grants: new Map(),
      rules: new Map(),
    };

    const adminRole = new RoleEntity();
    adminRole.id = 'admin-role-uuid';
    adminRole.code = SystemRole.SYSTEM_ADMIN;
    adminRole.name = 'مدير النظام';
    adminRole.isActive = true;
    store.roles.set(adminRole.id, adminRole);

    const userRole = new RoleEntity();
    userRole.id = 'user-role-uuid';
    userRole.code = 'PRODUCTION_WORKER';
    userRole.name = 'عامل إنتاج';
    userRole.isActive = true;
    store.roles.set(userRole.id, userRole);

    const manager = createMockEntityManager(store);
    await reconcileSystemPermissions(manager);

    // Verify all grants belong exclusively to SYSTEM_ADMIN
    for (const grant of store.grants.values()) {
      assert.strictEqual(grant.roleId, adminRole.id);
      assert.notStrictEqual(grant.roleId, userRole.id);
    }
  });

  it('6. Inventory Permissions Explicit Verification: SYSTEM_ADMIN has ALLOW ALL for all inventory actions', async () => {
    const store: MockStore = {
      permissions: new Map(),
      roles: new Map(),
      grants: new Map(),
      rules: new Map(),
    };

    const adminRole = new RoleEntity();
    adminRole.id = 'admin-role-uuid';
    adminRole.code = SystemRole.SYSTEM_ADMIN;
    adminRole.name = 'مدير النظام';
    adminRole.isActive = true;
    store.roles.set(adminRole.id, adminRole);

    const manager = createMockEntityManager(store);
    await reconcileSystemPermissions(manager);

    const requiredInventoryPermissions = [
      SystemPermission.INVENTORY_CATEGORY_VIEW,
      SystemPermission.INVENTORY_CATEGORY_CREATE,
      SystemPermission.INVENTORY_CATEGORY_UPDATE,
      SystemPermission.INVENTORY_CATEGORY_DELETE,
      SystemPermission.INVENTORY_PRODUCT_VIEW,
      SystemPermission.INVENTORY_PRODUCT_CREATE,
      SystemPermission.INVENTORY_PRODUCT_UPDATE,
      SystemPermission.INVENTORY_PRODUCT_DELETE,
    ];

    for (const permName of requiredInventoryPermissions) {
      const perm = Array.from(store.permissions.values()).find(
        (p) => p.name === permName
      );
      assert.ok(perm, `Permission ${permName} must exist in database`);
      assert.strictEqual(perm.isActive, true, `Permission ${permName} must be active`);

      const grant = Array.from(store.grants.values()).find(
        (g) => g.permissionId === perm.id && g.roleId === adminRole.id
      );
      assert.ok(grant, `SYSTEM_ADMIN must have grant for ${permName}`);
      assert.strictEqual(grant.isActive, true);
      assert.strictEqual(grant.canDelegate, true);
      assert.strictEqual(grant.expiresAt, null);

      const rule = Array.from(store.rules.values()).find(
        (r) => r.permissionGrantId === grant.id
      );
      assert.ok(rule, `Grant for ${permName} must have an access rule`);
      assert.strictEqual(rule.effect, 'ALLOW');
      assert.strictEqual(rule.scopeType, 'ALL');
      assert.strictEqual(rule.scope, null);
      assert.strictEqual(rule.isActive, true);
    }
  });

  it('7. Pre-Seed Graceful Handling: Does not fail or create users if SYSTEM_ADMIN role is not yet present', async () => {
    const store: MockStore = {
      permissions: new Map(),
      roles: new Map(),
      grants: new Map(),
      rules: new Map(),
    };

    const manager = createMockEntityManager(store);
    const result = await reconcileSystemPermissions(manager);

    assert.strictEqual(result.permissionsSynced, ALL_SYSTEM_PERMISSION_DEFINITIONS.length);
    assert.strictEqual(result.grantsReconciled, 0);
    assert.strictEqual(result.rulesReconciled, 0);
    assert.strictEqual(store.grants.size, 0);
    assert.strictEqual(store.rules.size, 0);
  });
});
