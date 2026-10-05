import 'reflect-metadata';
import { AppDataSource } from './data-source.js';

export async function runMigrations(): Promise<void> {
  console.log('--- Running Migrations ---');

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  try {
    const migrations = await AppDataSource.runMigrations();
    if (migrations.length === 0) {
      console.log('No pending migrations to run.');
    } else {
      console.log(`Successfully applied ${migrations.length} migration(s):`);
      migrations.forEach((m) => console.log(`  - ${m.name}`));
    }
  } catch (error) {
    console.error('--- Migration execution failed ---', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

if (process.argv[1]?.endsWith('run-migrations.ts') || process.argv[1]?.endsWith('run-migrations.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
