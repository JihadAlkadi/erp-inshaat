import { DataSource, EntityManager } from 'typeorm';
import { PermissionEntity } from '../permission.entity.js';
import { RoleEntity } from '../../role/role.entity.js';
import { PermissionGrantEntity } from '../../permission-grant/permission-grant.entity.js';
import { AccessRuleEntity } from '../../access-rule/access-rule.entity.js';
import { SystemRole } from '../../role/constants/system-role.enum.js';
import { ALL_SYSTEM_PERMISSION_DEFINITIONS } from '../constants/system-permission.registry.js';

export interface ReconciliationResult {
  permissionsSynced: number;
  grantsReconciled: number;
  rulesReconciled: number;
}

export interface ReconciliationOptions {
  grantedByUserId?: string | null;
}

/**
 * Reconciles code-defined permissions with the database, and guarantees that
 * the SYSTEM_ADMIN role possesses active Role Grants and valid ALLOW ALL access rules
 * for every active system permission.
 *
 * This operation is fully idempotent: running it multiple times will not create
 * duplicate permissions, grants, or access rules.
 */
export async function reconcileSystemPermissions(
  managerOrDataSource: EntityManager | DataSource,
  options?: ReconciliationOptions,
): Promise<ReconciliationResult> {
  if ('transaction' in managerOrDataSource && typeof managerOrDataSource.transaction === 'function') {
    return managerOrDataSource.transaction(async (trxManager) => {
      return executeReconciliation(trxManager, options);
    });
  }

  return executeReconciliation(managerOrDataSource as EntityManager, options);
}

async function executeReconciliation(
  manager: EntityManager,
  options?: ReconciliationOptions,
): Promise<ReconciliationResult> {
  const permissionRepo = manager.getRepository(PermissionEntity);
  const roleRepo = manager.getRepository(RoleEntity);
  const grantRepo = manager.getRepository(PermissionGrantEntity);
  const ruleRepo = manager.getRepository(AccessRuleEntity);

  let permissionsSynced = 0;
  let grantsReconciled = 0;
  let rulesReconciled = 0;

  // 1. Synchronize code-defined permissions to system_permission table
  for (const def of ALL_SYSTEM_PERMISSION_DEFINITIONS) {
    let perm = await permissionRepo.findOne({
      where: { name: def.name },
    });

    if (!perm) {
      perm = permissionRepo.create({
        name: def.name,
        description: def.description,
        isActive: true,
      });
      await permissionRepo.save(perm);
      permissionsSynced++;
    } else {
      let needsUpdate = false;
      if (perm.description !== def.description) {
        perm.description = def.description;
        needsUpdate = true;
      }
      if (!perm.isActive) {
        perm.isActive = true;
        needsUpdate = true;
      }
      if (needsUpdate) {
        await permissionRepo.save(perm);
        permissionsSynced++;
      }
    }
  }

  // 2. Locate SYSTEM_ADMIN role. If not yet created (e.g. before initial seed), exit safely.
  const adminRole = await roleRepo.findOne({
    where: { code: SystemRole.SYSTEM_ADMIN },
  });

  if (!adminRole) {
    return {
      permissionsSynced,
      grantsReconciled: 0,
      rulesReconciled: 0,
    };
  }

  // 3. Fetch all active permissions from the database
  const activePermissions = await permissionRepo.find({
    where: { isActive: true },
  });

  // 4. Ensure Role Grant and ALLOW ALL Access Rule for SYSTEM_ADMIN on every active permission
  for (const permission of activePermissions) {
    let grant = await grantRepo.findOne({
      where: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    });

    if (!grant) {
      grant = grantRepo.create({
        roleId: adminRole.id,
        permissionId: permission.id,
        userId: null,
        canDelegate: true,
        grantedBy: options?.grantedByUserId ?? null,
        reason: 'Automatic SYSTEM_ADMIN role grant',
        isActive: true,
        expiresAt: null,
      });
      grant = await grantRepo.save(grant);
      grantsReconciled++;
    } else {
      let grantNeedsUpdate = false;
      if (!grant.isActive) {
        grant.isActive = true;
        grantNeedsUpdate = true;
      }
      if (grant.expiresAt !== null) {
        grant.expiresAt = null;
        grantNeedsUpdate = true;
      }
      if (!grant.canDelegate) {
        grant.canDelegate = true;
        grantNeedsUpdate = true;
      }
      if (grant.userId !== null) {
        grant.userId = null;
        grantNeedsUpdate = true;
      }
      if (grantNeedsUpdate) {
        grant = await grantRepo.save(grant);
        grantsReconciled++;
      }
    }

    // 5. Ensure ALLOW ALL access rule for this grant
    let rule = await ruleRepo.findOne({
      where: {
        permissionGrantId: grant.id,
        effect: 'ALLOW',
        scopeType: 'ALL',
      },
    });

    if (!rule) {
      rule = ruleRepo.create({
        permissionGrantId: grant.id,
        effect: 'ALLOW',
        scopeType: 'ALL',
        scope: null,
        isActive: true,
        description: 'السماح لمدير النظام بالوصول إلى جميع بيانات هذا المورد',
      });
      await ruleRepo.save(rule);
      rulesReconciled++;
    } else {
      let ruleNeedsUpdate = false;
      if (!rule.isActive) {
        rule.isActive = true;
        ruleNeedsUpdate = true;
      }
      if (rule.scope !== null) {
        rule.scope = null;
        ruleNeedsUpdate = true;
      }
      if (ruleNeedsUpdate) {
        await ruleRepo.save(rule);
        rulesReconciled++;
      }
    }
  }

  return {
    permissionsSynced,
    grantsReconciled,
    rulesReconciled,
  };
}
