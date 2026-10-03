import { EntityManager } from 'typeorm';
import { UserEntity } from '../user.entity.js';
import { RoleEntity } from '../../role/role.entity.js';
import { SystemRole } from '../../role/constants/system-role.enum.js';
import { hashPassword } from '../../../../common/security/password.util.js';
import { seedSystemAdminPermissionGrants } from '../../permission-grant/seeds/system-admin-permission-grants.seed.js';
import { seedSystemAdminAccessRules } from '../../access-rule/seeds/system-admin-access-rules.seed.js';

export async function seedSystemAdminUser(manager: EntityManager): Promise<UserEntity> {
  const roleRepository = manager.getRepository(RoleEntity);
  const userRepository = manager.getRepository(UserEntity);
  const adminPhone = '0912312312';

  const adminRole = await roleRepository.findOne({
    where: { code: SystemRole.SYSTEM_ADMIN },
  });

  if (!adminRole) {
    throw new Error(`Role ${SystemRole.SYSTEM_ADMIN} not found. Please run role seed first.`);
  }

  let adminUser = await userRepository.findOne({
    where: { phone: adminPhone },
  });

  if (!adminUser) {
    const rawPassword = process.env.SEED_SYSTEM_ADMIN_PASSWORD;
    if (!rawPassword || rawPassword.trim() === '') {
      throw new Error(
        'SEED_SYSTEM_ADMIN_PASSWORD is required when creating the initial system admin user.',
      );
    }

    const passwordHash = await hashPassword(rawPassword);

    adminUser = userRepository.create({
      fullName: 'مدير النظام',
      phone: adminPhone,
      passwordHash,
      roleId: adminRole.id,
      isActive: true,
    });
    adminUser = await userRepository.save(adminUser);
  }

  console.log('[seed] system admin user ready');

  // Grants & Access Rules for admin user and role
  const grants = await seedSystemAdminPermissionGrants(manager, adminRole, adminUser);
  await seedSystemAdminAccessRules(manager, grants);

  return adminUser;
}
