import 'reflect-metadata';
import { DataSource } from 'typeorm';
import mysql from 'mysql2/promise';
import { envConfig } from '../src/config/env.config.js';
import { databaseConfig } from '../src/config/database.config.js';
import { hashLineConfiguration } from '../src/modules/production/order-line/production-order-line-configuration.helper.js';

async function createRawConnection(): Promise<mysql.Connection> {
  return await mysql.createConnection({
    host: envConfig.db.host,
    port: envConfig.db.port,
    user: envConfig.db.username,
    password: envConfig.db.password,
    multipleStatements: true,
  });
}

async function runScenario1Fresh(): Promise<void> {
  console.log('\n======================================================');
  console.log('--- Scenario 1: Fresh DB Migration 0001 -> 0014 ---');
  console.log('======================================================');

  const rawConn = await createRawConnection();
  const dbName = `test_po_fresh_${Date.now()}`;

  try {
    await rawConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created disposable database: ${dbName}`);

    const freshDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      logging: false,
    });

    await freshDs.initialize();

    console.log('Running all migrations (0001 -> 0014)...');
    await freshDs.runMigrations();
    console.log('Migrations 0001 -> 0014 applied successfully.');

    // 1. Verify tables exist
    for (const table of [
      'production_order_sequence',
      'production_order',
      'production_order_line',
      'production_order_line_pattern_selection',
    ]) {
      const [row] = await freshDs.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [dbName, table]
      );
      if (!row) throw new Error(`Assertion failed: table ${table} missing`);
      console.log(`✔ ${table} table exists`);
    }

    // 2. Verify active_configuration_hash column on production_order_line
    const [hashCol] = await freshDs.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_order_line' AND COLUMN_NAME = 'active_configuration_hash'`,
      [dbName]
    );
    if (!hashCol || hashCol.COLUMN_NAME !== 'active_configuration_hash') {
      throw new Error('Assertion failed: active_configuration_hash column missing on production_order_line');
    }
    console.log('✔ active_configuration_hash column exists on production_order_line (VARCHAR(64) NULL)');

    // 3. Verify unique index UQ_prod_order_line_order_config_hash
    const hashIndexes = await freshDs.query(
      `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_order_line' AND INDEX_NAME = 'UQ_prod_order_line_order_config_hash'`,
      [dbName]
    );
    if (hashIndexes.length !== 2) {
      throw new Error('Assertion failed: composite UNIQUE index UQ_prod_order_line_order_config_hash missing');
    }
    console.log('✔ UQ_prod_order_line_order_config_hash composite UNIQUE index verified on (order_id, active_configuration_hash)');

    // 4. Test unique index enforcement:
    const roleId = '00000000-0000-0000-0000-000000000001';
    const userId = '00000000-0000-0000-0000-000000000002';
    const tmplId = '00000000-0000-0000-0000-000000000003';
    const orderId = '00000000-0000-0000-0000-000000000004';

    await freshDs.query(`INSERT INTO system_role (id, name, code) VALUES (?, 'Admin', 'ADMIN')`, [roleId]);
    await freshDs.query(`INSERT INTO system_user (id, full_name, phone, password_hash, role_id, is_active) VALUES (?, 'User', '1234567890', 'hash', ?, 1)`, [userId, roleId]);
    await freshDs.query(`INSERT INTO production_template (id, name, code, is_active) VALUES (?, 'Template', 'T-1', 1)`, [tmplId]);
    await freshDs.query(`INSERT INTO production_order (id, order_number, status, created_by_user_id) VALUES (?, 'PO-000001', 'DRAFT', ?)`, [orderId, userId]);

    const testHash = 'a'.repeat(64);
    await freshDs.query(
      `INSERT INTO production_order_line (id, order_id, template_id, quantity, sort_order, active_configuration_hash) VALUES ('line-1', ?, ?, 1, 1, ?)`,
      [orderId, tmplId, testHash]
    );

    // Duplicate insert on same order with same hash MUST fail
    let duplicateRejected = false;
    try {
      await freshDs.query(
        `INSERT INTO production_order_line (id, order_id, template_id, quantity, sort_order, active_configuration_hash) VALUES ('line-2', ?, ?, 2, 2, ?)`,
        [orderId, tmplId, testHash]
      );
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        duplicateRejected = true;
        console.log('✔ Duplicate active_configuration_hash on same order correctly rejected by MySQL UNIQUE index');
      }
    }
    if (!duplicateRejected) throw new Error('Assertion failed: duplicate hash should have been rejected');

    // Multiple lines with NULL active_configuration_hash (archived lines) MUST be allowed
    await freshDs.query(
      `INSERT INTO production_order_line (id, order_id, template_id, quantity, sort_order, active_configuration_hash, deleted_at) VALUES ('line-archived-1', ?, ?, 1, 3, NULL, NOW())`,
      [orderId, tmplId]
    );
    await freshDs.query(
      `INSERT INTO production_order_line (id, order_id, template_id, quantity, sort_order, active_configuration_hash, deleted_at) VALUES ('line-archived-2', ?, ?, 1, 4, NULL, NOW())`,
      [orderId, tmplId]
    );
    console.log('✔ Multiple soft-deleted lines with NULL active_configuration_hash successfully co-exist');

    await freshDs.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

async function runScenario2Upgrade(): Promise<void> {
  console.log('\n======================================================');
  console.log('--- Scenario 2: Upgrade Migration 0013 -> 0014 ---');
  console.log('======================================================');

  const rawConn = await createRawConnection();
  const dbName = `test_po_upgrade_${Date.now()}`;

  try {
    await rawConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created disposable database: ${dbName}`);

    // Run migrations through 0013 (excluding 0014)
    const allMigrations = databaseConfig.migrations as Function[];
    const pre0014Migrations = allMigrations.filter((m) => m.name !== 'AddProductionOrderLineConfigurationUniqueness1710000000014');

    const preDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      migrations: pre0014Migrations,
      logging: false,
    });

    await preDs.initialize();
    console.log('Applying migrations through 0013...');
    await preDs.runMigrations();
    console.log('Migrations through 0013 applied.');

    // Seed test data under migration 0013 schema:
    const roleId = '00000000-0000-0000-0000-000000000010';
    const userId = '00000000-0000-0000-0000-000000000011';
    const tmplId1 = '00000000-0000-0000-0000-000000000012';
    const tmplId2 = '00000000-0000-0000-0000-000000000013';
    const patternId1 = '00000000-0000-0000-0000-000000000014';
    const optId1 = '00000000-0000-0000-0000-000000000015';
    const orderId = '00000000-0000-0000-0000-000000000016';

    await preDs.query(`INSERT INTO system_role (id, name, code) VALUES (?, 'Admin', 'ADMIN')`, [roleId]);
    await preDs.query(`INSERT INTO system_user (id, full_name, phone, password_hash, role_id, is_active) VALUES (?, 'User', '1234567890', 'hash', ?, 1)`, [userId, roleId]);
    await preDs.query(`INSERT INTO production_template (id, name, code, is_active) VALUES (?, 'Template with Patterns', 'TMPL-P', 1)`, [tmplId1]);
    await preDs.query(`INSERT INTO production_template (id, name, code, is_active) VALUES (?, 'Template without Patterns', 'TMPL-NP', 1)`, [tmplId2]);
    await preDs.query(`INSERT INTO production_template_pattern (id, template_id, name) VALUES (?, ?, 'Pattern 1')`, [patternId1, tmplId1]);
    await preDs.query(`INSERT INTO production_template_pattern_option (id, pattern_id, name, sort_order) VALUES (?, ?, 'Option 1', 1)`, [optId1, patternId1]);
    await preDs.query(`INSERT INTO production_order (id, order_number, status, created_by_user_id) VALUES (?, 'PO-000001', 'DRAFT', ?)`, [orderId, userId]);

    // Active Line 1: has pattern selection
    const lineId1 = '00000000-0000-0000-0000-000000000021';
    await preDs.query(
      `INSERT INTO production_order_line (id, order_id, template_id, quantity, sort_order) VALUES (?, ?, ?, 5, 1)`,
      [lineId1, orderId, tmplId1]
    );
    await preDs.query(
      `INSERT INTO production_order_line_pattern_selection (id, order_line_id, template_pattern_id, selected_option_id) VALUES ('sel-1', ?, ?, ?)`,
      [lineId1, patternId1, optId1]
    );

    // Active Line 2: no patterns
    const lineId2 = '00000000-0000-0000-0000-000000000022';
    await preDs.query(
      `INSERT INTO production_order_line (id, order_id, template_id, quantity, sort_order) VALUES (?, ?, ?, 3, 2)`,
      [lineId2, orderId, tmplId2]
    );

    // Soft-deleted Line 3: archived
    const lineId3 = '00000000-0000-0000-0000-000000000023';
    await preDs.query(
      `INSERT INTO production_order_line (id, order_id, template_id, quantity, sort_order, deleted_at) VALUES (?, ?, ?, 1, 3, NOW())`,
      [lineId3, orderId, tmplId1]
    );

    await preDs.destroy();

    // Now run Migration 0014 upgrade
    const upgradeDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      logging: false,
    });

    await upgradeDs.initialize();
    console.log('Applying upgrade migration 0014...');
    const applied = await upgradeDs.runMigrations();
    console.log(`Applied ${applied.length} upgrade migration(s):`, applied.map((m) => m.name));

    if (!applied.some((m) => m.name === 'AddProductionOrderLineConfigurationUniqueness1710000000014')) {
      throw new Error('Assertion failed: Migration 0014 was not applied in upgrade scenario');
    }

    // Verify backfilled hashes
    const [rowLine1] = await upgradeDs.query(`SELECT active_configuration_hash FROM production_order_line WHERE id = ?`, [lineId1]);
    const expectedHash1 = hashLineConfiguration(tmplId1, [{ templatePatternId: patternId1, selectedOptionId: optId1 }]);
    if (rowLine1.active_configuration_hash !== expectedHash1) {
      throw new Error(`Backfill failed for Line 1: got ${rowLine1.active_configuration_hash}, expected ${expectedHash1}`);
    }
    console.log('✔ Line 1 correctly backfilled with configuration hash matching its pattern selections');

    const [rowLine2] = await upgradeDs.query(`SELECT active_configuration_hash FROM production_order_line WHERE id = ?`, [lineId2]);
    const expectedHash2 = hashLineConfiguration(tmplId2, []);
    if (rowLine2.active_configuration_hash !== expectedHash2) {
      throw new Error(`Backfill failed for Line 2: got ${rowLine2.active_configuration_hash}, expected ${expectedHash2}`);
    }
    console.log('✔ Line 2 correctly backfilled with configuration hash for template without patterns');

    const [rowLine3] = await upgradeDs.query(`SELECT active_configuration_hash FROM production_order_line WHERE id = ?`, [lineId3]);
    if (rowLine3.active_configuration_hash !== null) {
      throw new Error(`Archived Line 3 should have active_configuration_hash = NULL, got ${rowLine3.active_configuration_hash}`);
    }
    console.log('✔ Archived Line 3 left with active_configuration_hash = NULL');

    await upgradeDs.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

async function runScenario3DuplicateFailLoud(): Promise<void> {
  console.log('\n======================================================');
  console.log('--- Scenario 3: Pre-existing Duplicates Fail Loudly in Migration 0014 ---');
  console.log('======================================================');

  const rawConn = await createRawConnection();
  const dbName = `test_po_fail_loud_${Date.now()}`;

  try {
    await rawConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created disposable database: ${dbName}`);

    const allMigrations = databaseConfig.migrations as Function[];
    const pre0014Migrations = allMigrations.filter((m) => m.name !== 'AddProductionOrderLineConfigurationUniqueness1710000000014');

    const preDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      migrations: pre0014Migrations,
      logging: false,
    });

    await preDs.initialize();
    await preDs.runMigrations();

    // Seed duplicate active lines under 0013
    const roleId = '00000000-0000-0000-0000-000000000030';
    const userId = '00000000-0000-0000-0000-000000000031';
    const tmplId = '00000000-0000-0000-0000-000000000032';
    const orderId = '00000000-0000-0000-0000-000000000033';

    await preDs.query(`INSERT INTO system_role (id, name, code) VALUES (?, 'Admin', 'ADMIN')`, [roleId]);
    await preDs.query(`INSERT INTO system_user (id, full_name, phone, password_hash, role_id, is_active) VALUES (?, 'User', '1234567890', 'hash', ?, 1)`, [userId, roleId]);
    await preDs.query(`INSERT INTO production_template (id, name, code, is_active) VALUES (?, 'Tmpl', 'T-DUP', 1)`, [tmplId]);
    await preDs.query(`INSERT INTO production_order (id, order_number, status, created_by_user_id) VALUES (?, 'PO-DUP', 'DRAFT', ?)`, [orderId, userId]);

    // Insert 2 active duplicate lines with same template and no selections
    await preDs.query(`INSERT INTO production_order_line (id, order_id, template_id, quantity, sort_order) VALUES ('dup-1', ?, ?, 1, 1)`, [orderId, tmplId]);
    await preDs.query(`INSERT INTO production_order_line (id, order_id, template_id, quantity, sort_order) VALUES ('dup-2', ?, ?, 2, 2)`, [orderId, tmplId]);

    await preDs.destroy();

    // Now attempt running Migration 0014 -> must fail loudly with duplicate details!
    const upgradeDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      logging: false,
    });

    await upgradeDs.initialize();
    let migrationFailedLoudly = false;
    try {
      await upgradeDs.runMigrations();
    } catch (err: any) {
      if (err.message?.includes('Pre-existing duplicate line configurations detected in database')) {
        migrationFailedLoudly = true;
        console.log('✔ Migration 0014 failed loudly with detailed diagnostic message when duplicate configurations existed in DB');
      } else {
        console.error('Migration threw unexpected error:', err);
      }
    }

    if (!migrationFailedLoudly) {
      throw new Error('Assertion failed: Migration 0014 should have failed loudly due to duplicate lines');
    }

    await upgradeDs.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

async function runScenario4Upgrade0015(): Promise<void> {
  console.log('\n======================================================');
  console.log('--- Scenario 4: Upgrade Migration 0014 -> 0015 ---');
  console.log('======================================================');

  const rawConn = await createRawConnection();
  const dbName = `test_po_upgrade_0015_${Date.now()}`;

  try {
    await rawConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created disposable database: ${dbName}`);

    const allMigrations = databaseConfig.migrations as Function[];
    const pre0015Migrations = allMigrations.filter((m) => m.name !== 'AddProductionOrderApprovalStatus1710000000015');

    const preDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      migrations: pre0015Migrations,
      logging: false,
    });

    await preDs.initialize();
    await preDs.runMigrations();
    console.log('Migrations 0001 -> 0014 applied successfully.');

    // Seed data under 0014
    const roleId = '00000000-0000-0000-0000-000000000040';
    const userId = '00000000-0000-0000-0000-000000000041';
    const orderId = '00000000-0000-0000-0000-000000000042';

    await preDs.query(`INSERT INTO system_role (id, name, code) VALUES (?, 'Admin', 'ADMIN')`, [roleId]);
    await preDs.query(`INSERT INTO system_user (id, full_name, phone, password_hash, role_id, is_active) VALUES (?, 'User', '1234567890', 'hash', ?, 1)`, [userId, roleId]);
    await preDs.query(`INSERT INTO production_order (id, order_number, status, created_by_user_id) VALUES (?, 'PO-UPG15', 'DRAFT', ?)`, [orderId, userId]);

    await preDs.destroy();

    // Now run migration 0015
    const upDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      logging: false,
    });

    await upDs.initialize();
    await upDs.runMigrations();
    console.log('Migration 0015 applied successfully.');

    // Verify columns exist
    const [approvedAtCol] = await upDs.query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_order' AND COLUMN_NAME = 'approved_at'`,
      [dbName]
    );
    if (!approvedAtCol) throw new Error('Assertion failed: approved_at column missing on production_order');

    const [approvedByCol] = await upDs.query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_order' AND COLUMN_NAME = 'approved_by_user_id'`,
      [dbName]
    );
    if (!approvedByCol) throw new Error('Assertion failed: approved_by_user_id column missing on production_order');

    console.log('✔ approved_at and approved_by_user_id columns verified on production_order');

    // Test check constraint allows APPROVED
    await upDs.query(
      `UPDATE production_order SET status = 'APPROVED', approved_at = NOW(), approved_by_user_id = ? WHERE id = ?`,
      [userId, orderId]
    );
    console.log('✔ status = APPROVED successfully allowed by CHK_production_order_status');

    let invalidRejected = false;
    try {
      await upDs.query(
        `UPDATE production_order SET status = 'INVALID_STATUS' WHERE id = ?`,
        [orderId]
      );
    } catch (err: any) {
      if (
        err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' ||
        err.code === 'ER_CONSTRAINT_FAILED' ||
        err.errno === 4025 ||
        err.errno === 3819 ||
        (err.message && err.message.toLowerCase().includes('constraint'))
      ) {
        invalidRejected = true;
        console.log('✔ Invalid status correctly rejected by CHK_production_order_status');
      } else {
        console.error('Unexpected error on check constraint test:', err);
      }
    }
    if (!invalidRejected) throw new Error('Assertion failed: invalid status should have violated check constraint');

    await upDs.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

async function runScenario5Down0015FailLoud(): Promise<void> {
  console.log('\n======================================================');
  console.log('--- Scenario 5: Migration 0015 Down Fails Loudly on APPROVED Data ---');
  console.log('======================================================');

  const rawConn = await createRawConnection();
  const dbName = `test_po_down_fail_${Date.now()}`;

  try {
    await rawConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created disposable database: ${dbName}`);

    const ds = new DataSource({
      ...databaseConfig,
      database: dbName,
      logging: false,
    });

    await ds.initialize();
    await ds.runMigrations();

    // Insert an APPROVED order
    const roleId = '00000000-0000-0000-0000-000000000050';
    const userId = '00000000-0000-0000-0000-000000000051';
    const orderId = '00000000-0000-0000-0000-000000000052';

    await ds.query(`INSERT INTO system_role (id, name, code) VALUES (?, 'Admin', 'ADMIN')`, [roleId]);
    await ds.query(`INSERT INTO system_user (id, full_name, phone, password_hash, role_id, is_active) VALUES (?, 'User', '1234567890', 'hash', ?, 1)`, [userId, roleId]);
    await ds.query(`INSERT INTO production_order (id, order_number, status, created_by_user_id, approved_at, approved_by_user_id) VALUES (?, 'PO-APP5', 'APPROVED', ?, NOW(), ?)`, [orderId, userId, userId]);

    // Now try to undo last migration (0015) -> MUST fail loudly because of APPROVED rows!
    let downFailedLoudly = false;
    try {
      await ds.undoLastMigration();
    } catch (err: any) {
      if (
        err.message?.includes('APPROVED production orders exist in database') ||
        err.message?.includes('Cannot revert')
      ) {
        downFailedLoudly = true;
        console.log('✔ Down migration 0015 failed loudly as expected when APPROVED rows exist');
      } else {
        console.error('Down migration threw unexpected error:', err);
      }
    }

    if (!downFailedLoudly) {
      throw new Error('Assertion failed: Migration 0015 down must fail loudly when APPROVED rows exist');
    }

    // Now update order to DRAFT and clear approved metadata -> down migration should now succeed!
    await ds.query(`UPDATE production_order SET status = 'DRAFT', approved_at = NULL, approved_by_user_id = NULL WHERE id = ?`, [orderId]);
    await ds.undoLastMigration();
    console.log('✔ Down migration 0015 succeeded cleanly after clearing APPROVED rows');

    await ds.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

async function main() {
  console.log('Starting Migration 0014 and 0015 Verification Tests on MySQL...');
  await runScenario1Fresh();
  await runScenario2Upgrade();
  await runScenario3DuplicateFailLoud();
  await runScenario4Upgrade0015();
  await runScenario5Down0015FailLoud();
  console.log('\n======================================================');
  console.log('ALL MIGRATION SCENARIOS (0001 -> 0015) PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});

