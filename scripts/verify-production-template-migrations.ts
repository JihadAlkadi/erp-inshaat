import 'reflect-metadata';
import { DataSource } from 'typeorm';
import mysql from 'mysql2/promise';
import { envConfig } from '../src/config/env.config.js';
import { databaseConfig } from '../src/config/database.config.js';

interface CheckConstraintMetadata {
  table: string;
  constraint: string;
}

const REQUIRED_CHECK_CONSTRAINTS: CheckConstraintMetadata[] = [
  { table: 'production_template_pattern_option', constraint: 'CHK_production_pattern_option_sort_order' },
  { table: 'production_template_pattern_option_task', constraint: 'CHK_production_option_task_sort_order' },
  { table: 'production_template_pattern_option_task', constraint: 'CHK_production_option_task_duration' },
  { table: 'production_template_pattern_option_task', constraint: 'CHK_production_option_task_cost' },
  { table: 'production_template_pattern_option_task_material', constraint: 'CHK_production_pattern_task_mat_qty' },
  { table: 'production_template_pattern_option_task_attachment', constraint: 'CHK_production_pattern_task_att_sort_order' },
  { table: 'production_template_pattern_option_task_attachment', constraint: 'CHK_production_pattern_task_att_size' },
  { table: 'production_template_workflow_item', constraint: 'CHK_production_workflow_item_type' },
  { table: 'production_template_workflow_item', constraint: 'CHK_production_workflow_item_sort_order' },
  { table: 'production_template_workflow_item', constraint: 'CHK_production_workflow_item_polymorphic' },
];

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
  console.log('--- Scenario 1: Fresh DB Migration 0000 -> 0012 ---');
  console.log('======================================================');

  const rawConn = await createRawConnection();
  const dbName = `test_fresh_${Date.now()}`;

  try {
    await rawConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created disposable database: ${dbName}`);

    const freshDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      logging: false,
    });

    await freshDs.initialize();

    console.log('Running all migrations (0000 -> 0012)...');
    await freshDs.runMigrations();
    console.log('Migrations 0000 -> 0012 applied successfully.');

    // 1. Verify workflow table exists
    const [wfTable] = await freshDs.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_template_workflow_item'`,
      [dbName]
    );
    if (!wfTable) throw new Error('Assertion failed: production_template_workflow_item table missing');
    console.log('✔ production_template_workflow_item table exists');

    // 2. Verify pattern tables exist
    for (const table of [
      'production_template_pattern',
      'production_template_pattern_option',
      'production_template_pattern_option_task',
      'production_template_pattern_option_task_material',
      'production_template_pattern_option_task_attachment',
    ]) {
      const [row] = await freshDs.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [dbName, table]
      );
      if (!row) throw new Error(`Assertion failed: table ${table} missing`);
    }
    console.log('✔ All pattern, option, task, material, attachment tables exist');

    // 3. Verify stage.sort_order is absent
    const [stageSortOrderCol] = await freshDs.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_template_stage' AND COLUMN_NAME = 'sort_order'`,
      [dbName]
    );
    if (stageSortOrderCol) throw new Error('Assertion failed: production_template_stage.sort_order still exists');
    console.log('✔ production_template_stage.sort_order column is permanently absent');

    // 4. Verify task material planned_quantity = DECIMAL(18,6)
    const [matCol] = await freshDs.query(
      `SELECT NUMERIC_PRECISION, NUMERIC_SCALE FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_template_pattern_option_task_material' AND COLUMN_NAME = 'planned_quantity'`,
      [dbName]
    );
    if (!matCol || String(matCol.NUMERIC_PRECISION) !== '18' || String(matCol.NUMERIC_SCALE) !== '6') {
      throw new Error(`Assertion failed: planned_quantity precision/scale is ${matCol?.NUMERIC_PRECISION}, ${matCol?.NUMERIC_SCALE}`);
    }
    console.log(`✔ planned_quantity is DECIMAL(18,6) (precision=${matCol.NUMERIC_PRECISION}, scale=${matCol.NUMERIC_SCALE})`);

    // 5. Verify all required CHECK constraints exist
    for (const { table, constraint } of REQUIRED_CHECK_CONSTRAINTS) {
      const [chk] = await freshDs.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'`,
        [dbName, table, constraint]
      );
      if (!chk) throw new Error(`Assertion failed: CHECK constraint ${constraint} on ${table} missing`);
    }
    console.log('✔ All 10 required CHECK constraints verified through information_schema');

    // 6. Test 0.000001 round-trip precision without rounding to 0.0000
    const templateId = '11111111-1111-4111-8111-111111111111';
    const patternId = '22222222-2222-4222-8222-222222222222';
    const optionId = '33333333-3333-4333-8333-333333333333';
    const taskId = '44444444-4444-4444-8444-444444444444';
    const matId = '55555555-5555-4555-8555-555555555555';
    const deptId = '66666666-6666-4666-8666-666666666666';
    const catId = '77777777-7777-4777-8777-777777777777';
    const prodId = '88888888-8888-4888-8888-888888888888';
    const unitId = '99999999-9999-4999-8999-999999999999';

    // Insert minimal dependency graph
    await freshDs.query(`INSERT INTO production_department (id, name, code, is_active) VALUES (?, 'الصب', 'CAST', 1)`, [deptId]);
    await freshDs.query(`INSERT INTO inventory_category (id, name, code, is_active) VALUES (?, 'مواد خام', 'RAW', 1)`, [catId]);
    await freshDs.query(`INSERT INTO inventory_product (id, category_id, name, code, is_active) VALUES (?, ?, 'حديد', 'STEEL', 1)`, [prodId, catId]);
    await freshDs.query(`INSERT INTO inventory_product_unit (id, product_id, name, price) VALUES (?, ?, 'طن', 100.0000)`, [unitId, prodId]);
    await freshDs.query(`UPDATE inventory_product SET base_unit_id = ? WHERE id = ?`, [unitId, prodId]);

    await freshDs.query(`INSERT INTO production_template (id, name, code, is_active) VALUES (?, 'قالب غرف', 'TMPL-01', 1)`, [templateId]);
    await freshDs.query(`INSERT INTO production_template_pattern (id, template_id, name) VALUES (?, ?, 'نوع الصب')`, [patternId, templateId]);
    await freshDs.query(`INSERT INTO production_template_pattern_option (id, pattern_id, name, sort_order) VALUES (?, ?, 'مسبق الصنع', 1)`, [optionId, patternId]);
    await freshDs.query(`INSERT INTO production_template_pattern_option_task (id, option_id, department_id, name, sort_order) VALUES (?, ?, ?, 'صب الجدران', 1)`, [taskId, optionId, deptId]);

    // Insert 0.000001
    await freshDs.query(
      `INSERT INTO production_template_pattern_option_task_material (id, task_id, product_id, product_unit_id, planned_quantity) 
       VALUES (?, ?, ?, ?, '0.000001')`,
      [matId, taskId, prodId, unitId]
    );

    const [storedMat] = await freshDs.query(
      `SELECT planned_quantity FROM production_template_pattern_option_task_material WHERE id = ?`,
      [matId]
    );

    if (storedMat.planned_quantity !== '0.000001') {
      throw new Error(`Assertion failed: expected '0.000001', got '${storedMat.planned_quantity}'`);
    }
    console.log(`✔ 0.000001 round-trip verified: stored/read exactly as '${storedMat.planned_quantity}' without truncation`);

    await freshDs.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

async function runScenario2UpgradeFrom0010(): Promise<void> {
  console.log('\n======================================================');
  console.log('--- Scenario 2: Upgrade from 0010 -> 0011 -> 0012 ---');
  console.log('======================================================');

  const rawConn = await createRawConnection();
  const dbName = `test_upg10_${Date.now()}`;

  try {
    await rawConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created disposable database: ${dbName}`);

    const migrationsList = databaseConfig.migrations as any[];
    // Only migrations up to 0010
    const migrations0010 = migrationsList.slice(0, 11); // indices 0..10

    const ds0010 = new DataSource({
      ...databaseConfig,
      database: dbName,
      migrations: migrations0010,
      logging: false,
    });

    await ds0010.initialize();
    console.log('Running migrations 0000 -> 0010...');
    await ds0010.runMigrations();

    // Verify sort_order exists in stage at 0010
    const [stageCol0010] = await ds0010.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_template_stage' AND COLUMN_NAME = 'sort_order'`,
      [dbName]
    );
    if (!stageCol0010) throw new Error('Assertion failed: sort_order should exist in stage at 0010');
    console.log('✔ Verified stage.sort_order exists at 0010');

    // Insert template and stages
    const templateId = '11111111-1111-4111-8111-111111111111';
    const deptId = '22222222-2222-4222-8222-222222222222';
    const stageA = '33333333-3333-4333-8333-333333333333';
    const stageB = '44444444-4444-4444-8444-444444444444';
    const stageC = '55555555-5555-4555-8555-555555555555';
    const stageArchived = '66666666-6666-4666-8666-666666666666';

    await ds0010.query(`INSERT INTO production_department (id, name, code, is_active) VALUES (?, 'قسم الصب', 'CAST', 1)`, [deptId]);
    await ds0010.query(`INSERT INTO production_template (id, name, code, is_active) VALUES (?, 'قالب غرف', 'TMPL-01', 1)`, [templateId]);

    await ds0010.query(
      `INSERT INTO production_template_stage (id, template_id, department_id, name, sort_order) 
       VALUES (?, ?, ?, 'مرحلة 1', 1), (?, ?, ?, 'مرحلة 2', 2), (?, ?, ?, 'مرحلة 3', 3)`,
      [stageA, templateId, deptId, stageB, templateId, deptId, stageC, templateId, deptId]
    );

    // Insert an archived stage
    await ds0010.query(
      `INSERT INTO production_template_stage (id, template_id, department_id, name, sort_order, deleted_at) 
       VALUES (?, ?, ?, 'مرحلة مؤرشفة', 4, NOW())`,
      [stageArchived, templateId, deptId]
    );

    const stagesCountBefore = await ds0010.query(`SELECT COUNT(*) as cnt FROM production_template_stage`);
    const countBefore = Number(stagesCountBefore[0].cnt);
    if (countBefore !== 4) throw new Error(`Expected 4 stages before upgrade, got ${countBefore}`);
    console.log(`Inserted 4 stages (3 active sort=1,2,3 and 1 archived sort=4)`);

    await ds0010.destroy();

    // Now initialize DataSource with full migrations (including 0011 and 0012)
    const fullDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      logging: false,
    });
    await fullDs.initialize();

    console.log('Running migrations 0011 -> 0012...');
    await fullDs.runMigrations();
    console.log('Migrations 0011 and 0012 applied.');

    // 1. Verify stage.sort_order column removed
    const [stageColAfter] = await fullDs.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_template_stage' AND COLUMN_NAME = 'sort_order'`,
      [dbName]
    );
    if (stageColAfter) throw new Error('Assertion failed: stage.sort_order should be removed');
    console.log('✔ production_template_stage.sort_order column is removed');

    // 2. Verify row counts: number of stage rows == number of workflow STAGE rows (including archived)
    const [wfStageCountRow] = await fullDs.query(
      `SELECT COUNT(*) as cnt FROM production_template_workflow_item WHERE item_type = 'STAGE'`
    );
    const wfStageCount = Number(wfStageCountRow.cnt);
    if (wfStageCount !== countBefore) {
      throw new Error(`Assertion failed: expected ${countBefore} workflow STAGE rows, got ${wfStageCount}`);
    }
    console.log(`✔ Row counts match: ${countBefore} stage rows == ${wfStageCount} workflow STAGE rows`);

    // 3. Verify exact workflow sort order matches old stage sort order 100%
    const workflowRows = await fullDs.query(
      `SELECT stage_id, sort_order, deleted_at FROM production_template_workflow_item WHERE template_id = ? ORDER BY sort_order ASC`,
      [templateId]
    );

    const expectedMap: Record<string, { sort: number; archived: boolean }> = {
      [stageA]: { sort: 1, archived: false },
      [stageB]: { sort: 2, archived: false },
      [stageC]: { sort: 3, archived: false },
      [stageArchived]: { sort: 4, archived: true },
    };

    for (const row of workflowRows) {
      const exp = expectedMap[row.stage_id];
      if (!exp) throw new Error(`Unexpected stage_id in workflow: ${row.stage_id}`);
      if (row.sort_order !== exp.sort) {
        throw new Error(`Order mismatch for stage ${row.stage_id}: expected ${exp.sort}, got ${row.sort_order}`);
      }
      if (exp.archived && !row.deleted_at) {
        throw new Error(`Archived stage ${row.stage_id} must have deleted_at set in workflow`);
      }
    }
    console.log('✔ Workflow sort order perfectly matches old stage sort order (100% fidelity: 1, 2, 3, 4)');

    await fullDs.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

async function runScenario3UpgradeFrom0011(): Promise<void> {
  console.log('\n======================================================');
  console.log('--- Scenario 3: Upgrade from 0011 -> 0012 & Down ---');
  console.log('======================================================');

  const rawConn = await createRawConnection();
  const dbName = `test_upg11_${Date.now()}`;

  try {
    await rawConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created disposable database: ${dbName}`);

    const migrationsList = databaseConfig.migrations as any[];
    // Only migrations up to 0011
    const migrations0011 = migrationsList.slice(0, 12); // indices 0..11

    const ds0011 = new DataSource({
      ...databaseConfig,
      database: dbName,
      migrations: migrations0011,
      logging: false,
    });

    await ds0011.initialize();
    console.log('Running migrations 0000 -> 0011...');
    await ds0011.runMigrations();

    // Verify task material scale at 0011 was 4
    const [matCol0011] = await ds0011.query(
      `SELECT NUMERIC_PRECISION, NUMERIC_SCALE FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_template_pattern_option_task_material' AND COLUMN_NAME = 'planned_quantity'`,
      [dbName]
    );
    if (String(matCol0011.NUMERIC_SCALE) !== '4') {
      throw new Error(`Expected scale 4 at 0011, got ${matCol0011.NUMERIC_SCALE}`);
    }
    console.log(`✔ Verified scale is 4 at 0011 (NUMERIC_SCALE=${matCol0011.NUMERIC_SCALE})`);

    // Insert data into 0011 DB
    const templateId = '11111111-1111-4111-8111-111111111111';
    const patternId = '22222222-2222-4222-8222-222222222222';
    const optionId = '33333333-3333-4333-8333-333333333333';
    const taskId = '44444444-4444-4444-8444-444444444444';
    const matId = '55555555-5555-4555-8555-555555555555';
    const deptId = '66666666-6666-4666-8666-666666666666';
    const catId = '77777777-7777-4777-8777-777777777777';
    const prodId = '88888888-8888-4888-8888-888888888888';
    const unitId = '99999999-9999-4999-8999-999999999999';

    await ds0011.query(`INSERT INTO production_department (id, name, code, is_active) VALUES (?, 'الصب', 'CAST', 1)`, [deptId]);
    await ds0011.query(`INSERT INTO inventory_category (id, name, code, is_active) VALUES (?, 'مواد خام', 'RAW', 1)`, [catId]);
    await ds0011.query(`INSERT INTO inventory_product (id, category_id, name, code, is_active) VALUES (?, ?, 'حديد', 'STEEL', 1)`, [prodId, catId]);
    await ds0011.query(`INSERT INTO inventory_product_unit (id, product_id, name, price) VALUES (?, ?, 'طن', 100.0000)`, [unitId, prodId]);
    await ds0011.query(`UPDATE inventory_product SET base_unit_id = ? WHERE id = ?`, [unitId, prodId]);

    await ds0011.query(`INSERT INTO production_template (id, name, code, is_active) VALUES (?, 'قالب غرف', 'TMPL-01', 1)`, [templateId]);
    await ds0011.query(`INSERT INTO production_template_pattern (id, template_id, name) VALUES (?, ?, 'نوع الصب')`, [patternId, templateId]);
    await ds0011.query(`INSERT INTO production_template_pattern_option (id, pattern_id, name, sort_order) VALUES (?, ?, 'مسبق الصنع', 1)`, [optionId, patternId]);
    await ds0011.query(`INSERT INTO production_template_pattern_option_task (id, option_id, department_id, name, sort_order) VALUES (?, ?, ?, 'صب الجدران', 1)`, [taskId, optionId, deptId]);
    await ds0011.query(
      `INSERT INTO production_template_pattern_option_task_material (id, task_id, product_id, product_unit_id, planned_quantity) 
       VALUES (?, ?, ?, ?, '12.3456')`,
      [matId, taskId, prodId, unitId]
    );

    await ds0011.destroy();

    // Now run migration 0012
    const fullDs = new DataSource({
      ...databaseConfig,
      database: dbName,
      logging: false,
    });
    await fullDs.initialize();

    console.log('Running migration 0012 upgrade...');
    await fullDs.runMigrations();

    // Verify scale is now 6
    const [matCol0012] = await fullDs.query(
      `SELECT NUMERIC_PRECISION, NUMERIC_SCALE FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'production_template_pattern_option_task_material' AND COLUMN_NAME = 'planned_quantity'`,
      [dbName]
    );
    if (String(matCol0012.NUMERIC_SCALE) !== '6') {
      throw new Error(`Expected scale 6 after 0012, got ${matCol0012.NUMERIC_SCALE}`);
    }
    console.log(`✔ Verified scale upgraded to 6 without data loss (NUMERIC_SCALE=${matCol0012.NUMERIC_SCALE})`);

    const [rowAfter0012] = await fullDs.query(
      `SELECT planned_quantity FROM production_template_pattern_option_task_material WHERE id = ?`,
      [matId]
    );
    if (rowAfter0012.planned_quantity !== '12.345600') {
      throw new Error(`Expected '12.345600', got '${rowAfter0012.planned_quantity}'`);
    }
    console.log(`✔ Existing data preserved: '12.345600'`);

    // Verify all 10 CHECK constraints exist and didn't fail on existing constraints
    for (const { table, constraint } of REQUIRED_CHECK_CONSTRAINTS) {
      const [chk] = await fullDs.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'`,
        [dbName, table, constraint]
      );
      if (!chk) throw new Error(`Assertion failed: CHECK constraint ${constraint} on ${table} missing after 0012`);
    }
    console.log('✔ All 10 CHECK constraints exist and idempotent upgrade verified');

    // Test Down() safety: if data has precision > 4 (e.g. 0.000001), down() must fail closed!
    await fullDs.query(
      `UPDATE production_template_pattern_option_task_material SET planned_quantity = '0.000001' WHERE id = ?`,
      [matId]
    );

    let downFailedAsExpected = false;
    try {
      await fullDs.undoLastMigration();
    } catch (err: any) {
      if (err.message?.includes('rollback would lose planned quantity precision')) {
        downFailedAsExpected = true;
      } else {
        throw err;
      }
    }

    if (!downFailedAsExpected) {
      throw new Error('Assertion failed: undoLastMigration should have failed closed when precision > 4 decimals exist');
    }
    console.log('✔ Migration 0012 down() fails closed safely when precision would be lost');

    await fullDs.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

async function main(): Promise<void> {
  console.log('Starting Production Template Migration Integration Verification on MySQL...\n');
  const start = Date.now();

  try {
    await runScenario1Fresh();
    await runScenario2UpgradeFrom0010();
    await runScenario3UpgradeFrom0011();

    console.log(`\n======================================================`);
    console.log(`ALL 3 MIGRATION SCENARIOS PASSED IN ${(Date.now() - start) / 1000}s`);
    console.log(`======================================================\n`);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ MIGRATION INTEGRATION VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

main();
