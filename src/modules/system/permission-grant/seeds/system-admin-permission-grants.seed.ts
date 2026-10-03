import { EntityManager } from 'typeorm';
import { PermissionGrantEntity } from '../permission-grant.entity.js';
import { PermissionEntity } from '../../permission/permission.entity.js';
import { RoleEntity } from '../../role/role.entity.js';
import { UserEntity } from '../../user/user.entity.js';

export async function seedSystemAdminPermissionGrants(
  manager: EntityManager,
  adminRole: RoleEntity,
  adminUser: UserEntity,
  permissions?: PermissionEntity[],
): Promise<PermissionGrantEntity[]> {
  const grantRepository = manager.getRepository(PermissionGrantEntity);
  const permissionRepository = manager.getRepository(PermissionEntity);

  // SYSTEM_ADMIN automatically receives all active permissions
  const targetPermissions =
    permissions ?? (await permissionRepository.find({ where: { isActive: true } }));

  const grants: PermissionGrantEntity[] = [];

  for (const permission of targetPermissions) {
    let grant = await grantRepository.findOne({
      where: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    });

    if (!grant) {
      grant = grantRepository.create({
        roleId: adminRole.id,
        permissionId: permission.id,
        userId: null,
        canDelegate: true,
        grantedBy: adminUser.id,
        reason: 'Initial system seed',
        isActive: true,
        expiresAt: null,
      });
      grant = await grantRepository.save(grant);
    } else {
      let needsUpdate = false;
      if (!grant.isActive) {
        grant.isActive = true;
        needsUpdate = true;
      }
      if (grant.expiresAt !== null) {
        grant.expiresAt = null;
        needsUpdate = true;
      }
      if (!grant.canDelegate) {
        grant.canDelegate = true;
        needsUpdate = true;
      }
      if (grant.userId !== null) {
        grant.userId = null;
        needsUpdate = true;
      }
      if (needsUpdate) {
        grant = await grantRepository.save(grant);
      }
    }

    grants.push(grant);
  }

  console.log('[seed] permission grants ready');
  return grants;
}
