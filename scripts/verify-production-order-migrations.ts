import 'reflect-metadata';
import { DataSource } from 'typeorm';
import mysql from 'mysql2/promise';
import { envConfig } from '../src/config/env.config.js';
import { databaseConfig } from '../src/config/database.config.js';

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
  console.log('--- Scenario 1: Fresh DB Migration 0001 -> 0013 ---');
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

    console.log('Running all migrations (0001 -> 0013)...');
    await freshDs.runMigrations();
    console.log('Migrations 0001 -> 0013 applied successfully.');

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

    // 2. Verify sequence seed row
    const [seqRow] = await freshDs.query(
      `SELECT id, current_value FROM production_order_sequence WHERE id = 'PRODUCTION_ORDER'`
    );
    if (!seqRow || seqRow.id !== 'PRODUCTION_ORDER') {
      throw new Error('Assertion failed: sequence seed row missing');
    }
    console.log('✔ production_order_sequence seeded with PRODUCTION_ORDER');

    // 3. Verify unique index on production_order.order_number
    const poIndexes = await freshDs.query(
      `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_order' AND COLUMN_NAME = 'order_number'`,
      [dbName]
    );
    const uniqueOrderNumber = poIndexes.find((idx: any) => Number(idx.NON_UNIQUE) === 0);
    if (!uniqueOrderNumber) {
      console.log('poIndexes found:', poIndexes);
      throw new Error('Assertion failed: UNIQUE index on order_number missing');
    }
    console.log('✔ UNIQUE index on production_order.order_number verified');

    // 4. Verify unique index on production_order_line_pattern_selection (order_line_id, template_pattern_id)
    const selIndexes = await freshDs.query(
      `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_order_line_pattern_selection' AND INDEX_NAME = 'UQ_prod_order_line_pattern'`,
      [dbName]
    );
    if (selIndexes.length !== 2) {
      throw new Error('Assertion failed: composite UNIQUE index UQ_prod_order_line_pattern missing');
    }
    console.log('✔ UQ_prod_order_line_pattern composite UNIQUE constraint verified');

    // 5. Test CHECK constraints live:
    // 5a. production_order status != DRAFT should fail
    const roleId = '00000000-0000-0000-0000-000000000000';
    const userId = '00000000-0000-0000-0000-000000000001';
    // Insert a dummy system role and user first
    await freshDs.query(
      `INSERT INTO system_role (id, name, code) VALUES (?, 'Admin', 'ADMIN')`,
      [roleId]
    );
    await freshDs.query(
      `INSERT INTO system_user (id, full_name, phone, password_hash, role_id, is_active) VALUES (?, 'Test User', '1234567890', 'hash', ?, 1)`,
      [userId, roleId]
    );

    let checkFailed = false;
    try {
      await freshDs.query(
        `INSERT INTO production_order (id, order_number, status, created_by_user_id) VALUES ('po-invalid-1', 'PO-TEST01', 'RELEASED', ?)`,
        [userId]
      );
    } catch (err: any) {
      checkFailed = true;
      console.log('✔ CHK_production_order_status successfully rejected status = RELEASED');
    }
    if (!checkFailed) throw new Error('Assertion failed: status = RELEASED should have been rejected by CHECK constraint');

    // 5b. production_order_line quantity = 0 should fail
    // Insert valid template first
    const tmplId = '00000000-0000-0000-0000-000000000002';
    await freshDs.query(
      `INSERT INTO production_template (id, name, code, is_active) VALUES (?, 'Template A', 'TMPL-A', 1)`,
      [tmplId]
    );
    const validOrderId = '00000000-0000-0000-0000-000000000003';
    await freshDs.query(
      `INSERT INTO production_order (id, order_number, status, created_by_user_id) VALUES (?, 'PO-000001', 'DRAFT', ?)`,
      [validOrderId, userId]
    );

    let qtyFailed = false;
    try {
      await freshDs.query(
        `INSERT INTO production_order_line (id, order_id, template_id, quantity, sort_order) VALUES ('line-bad', ?, ?, 0, 1)`,
        [validOrderId, tmplId]
      );
    } catch (err: any) {
      qtyFailed = true;
      console.log('✔ CHK_production_order_line_quantity successfully rejected quantity = 0');
    }
    if (!qtyFailed) throw new Error('Assertion failed: quantity = 0 should have been rejected');

    await freshDs.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

async function runScenario2Upgrade(): Promise<void> {
  console.log('\n======================================================');
  console.log('--- Scenario 2: Upgrade Migration 0012 -> 0013 ---');
  console.log('======================================================');

  const rawConn = await createRawConnection();
  const dbName = `test_po_upgrade_${Date.now()}`;

  try {
    await rawConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created disposable database: ${dbName}`);

    // All migrations except 0013
    const allMigrations = databaseConfig.migrations as Function[];
    const pre0013Migrations = allMigrations.filter((m) => m.name !== 'CreateProductionOrderDraftingFoundation1710000000013');

    const preDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      migrations: pre0013Migrations,
      logging: false,
    });

    await preDs.initialize();
    console.log('Applying migrations through 0012...');
    await preDs.runMigrations();
    console.log('Migrations through 0012 applied.');
    await preDs.destroy();

    // Now initialize with all migrations (including 0013) and upgrade
    const upgradeDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      logging: false,
    });

    await upgradeDs.initialize();
    console.log('Applying upgrade migration 0013...');
    const applied = await upgradeDs.runMigrations();
    console.log(`Applied ${applied.length} upgrade migration(s):`, applied.map((m) => m.name));

    if (!applied.some((m) => m.name === 'CreateProductionOrderDraftingFoundation1710000000013')) {
      throw new Error('Assertion failed: Migration 0013 was not applied in upgrade scenario');
    }

    // Verify tables exist
    for (const table of [
      'production_order_sequence',
      'production_order',
      'production_order_line',
      'production_order_line_pattern_selection',
    ]) {
      const [row] = await upgradeDs.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [dbName, table]
      );
      if (!row) throw new Error(`Assertion failed in upgrade: table ${table} missing`);
      console.log(`✔ ${table} table exists after upgrade`);
    }

    await upgradeDs.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

async function main() {
  console.log('Starting Migration 0013 Verification Tests on MySQL...');
  await runScenario1Fresh();
  await runScenario2Upgrade();
  console.log('\n======================================================');
  console.log('ALL MIGRATION 0013 SCENARIOS PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
