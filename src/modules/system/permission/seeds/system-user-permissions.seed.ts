import { EntityManager } from 'typeorm';
import { PermissionEntity } from '../permission.entity.js';
import { ALL_SYSTEM_PERMISSION_DEFINITIONS } from '../constants/system-permission.registry.js';
import { reconcileSystemPermissions } from '../services/permission-reconciliation.service.js';

export async function seedSystemUserPermissions(
  manager: EntityManager,
): Promise<PermissionEntity[]> {
  await reconcileSystemPermissions(manager);

  const permissionRepository = manager.getRepository(PermissionEntity);
  const permissions = await permissionRepository.find({
    where: { isActive: true },
  });

  console.log('[seed] system user permissions ready');
  return permissions;
}

export { ALL_SYSTEM_PERMISSION_DEFINITIONS };
