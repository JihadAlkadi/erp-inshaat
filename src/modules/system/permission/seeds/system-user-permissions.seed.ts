import { EntityManager } from 'typeorm';
import { PermissionEntity } from '../permission.entity.js';
import { SystemPermission } from '../constants/system-permission.enum.js';

interface PermissionDefinition {
  name: SystemPermission;
  description: string;
}

const SYSTEM_USER_PERMISSIONS: PermissionDefinition[] = [
  {
    name: SystemPermission.USER_VIEW,
    description: 'عرض المستخدمين',
  },
  {
    name: SystemPermission.USER_CREATE,
    description: 'إنشاء مستخدم',
  },
  {
    name: SystemPermission.USER_UPDATE,
    description: 'تعديل بيانات المستخدم',
  },
  {
    name: SystemPermission.USER_DELETE,
    description: 'حذف المستخدم',
  },
];

export async function seedSystemUserPermissions(
  manager: EntityManager,
): Promise<PermissionEntity[]> {
  const permissionRepository = manager.getRepository(PermissionEntity);
  const permissions: PermissionEntity[] = [];

  for (const def of SYSTEM_USER_PERMISSIONS) {
    let permission = await permissionRepository.findOne({
      where: { name: def.name },
    });

    if (!permission) {
      permission = permissionRepository.create({
        name: def.name,
        description: def.description,
        isActive: true,
      });
      permission = await permissionRepository.save(permission);
    }

    permissions.push(permission);
  }

  console.log('[seed] system user permissions ready');
  return permissions;
}
