import 'reflect-metadata';
import { AppDataSource } from '../data-source.js';
import { seedSystemAdminRole } from '../../modules/system/role/seeds/system-admin-role.seed.js';
import { seedSystemUserPermissions } from '../../modules/system/permission/seeds/system-user-permissions.seed.js';
import { seedSystemAdminUser } from '../../modules/system/user/seeds/system-admin-user.seed.js';

export async function runSystemInitialSeed(): Promise<void> {
  console.log('--- Starting Initial System Seed ---');

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  try {
    await AppDataSource.transaction(async (manager) => {
      // 1. Roles
      await seedSystemAdminRole(manager);

      // 2. Permissions
      await seedSystemUserPermissions(manager);

      // 3. Admin User, Grants & Access Rules
      await seedSystemAdminUser(manager);
    });

    console.log('--- Initial System Seed Completed Successfully ---');
  } catch (error) {
    console.error('--- Initial System Seed Failed ---', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

runSystemInitialSeed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
