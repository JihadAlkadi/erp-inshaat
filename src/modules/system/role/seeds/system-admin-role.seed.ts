import { EntityManager } from 'typeorm';
import { RoleEntity } from '../role.entity.js';
import { SystemRole } from '../constants/system-role.enum.js';

export async function seedSystemAdminRole(manager: EntityManager): Promise<RoleEntity> {
  const roleRepository = manager.getRepository(RoleEntity);

  let adminRole = await roleRepository.findOne({
    where: { code: SystemRole.SYSTEM_ADMIN },
  });

  if (!adminRole) {
    adminRole = roleRepository.create({
      name: 'مدير النظام',
      code: SystemRole.SYSTEM_ADMIN,
      description: 'مدير النظام بصلاحيات إدارة النظام',
      isActive: true,
    });
    adminRole = await roleRepository.save(adminRole);
  }

  console.log('[seed] SYSTEM_ADMIN role ready');
  return adminRole;
}
