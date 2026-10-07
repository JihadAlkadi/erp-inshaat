import 'reflect-metadata';
import { DataSource } from 'typeorm';
import mysql from 'mysql2/promise';
import { envConfig } from '../src/config/env.config.js';
import { databaseConfig } from '../src/config/database.config.js';
import { ProductionOrderService } from '../src/modules/production/order/production-order.service.js';
import { ProductionOrderGuardService } from '../src/modules/production/order/production-order-guard.service.js';
import { BusinessRuleError } from '../src/common/errors/business-rule.error.js';

async function createRawConnection(): Promise<mysql.Connection> {
  return await mysql.createConnection({
    host: envConfig.db.host,
    port: envConfig.db.port,
    user: envConfig.db.username,
    password: envConfig.db.password,
    multipleStatements: true,
  });
}

async function runConcurrencyVerification(): Promise<void> {
  console.log('\n======================================================');
  console.log('--- Production Order Concurrency & Sequence Verification ---');
  console.log('======================================================');

  const rawConn = await createRawConnection();
  const dbName = `test_po_conc_${Date.now()}`;

  try {
    await rawConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created disposable database: ${dbName}`);

    const ds = new DataSource({
      ...databaseConfig,
      database: dbName,
      logging: false,
    });

    await ds.initialize();
    console.log('Applying all migrations (0001 -> 0013)...');
    await ds.runMigrations();
    console.log('Migrations applied successfully.');

    // Seed test role and user
    const roleId = '00000000-0000-0000-0000-000000000001';
    const userId = '00000000-0000-0000-0000-000000000002';
    await ds.query(
      `INSERT INTO system_role (id, name, code) VALUES (?, 'Admin', 'ADMIN')`,
      [roleId]
    );
    await ds.query(
      `INSERT INTO system_user (id, full_name, phone, password_hash, role_id, is_active) VALUES (?, 'Concurrent Tester', '0500000000', 'hash', ?, 1)`,
      [userId, roleId]
    );

    const guardService = new ProductionOrderGuardService(ds);
    const orderService = new ProductionOrderService(ds, guardService);

    // ------------------------------------------------------------------
    // Part 1: 20 Concurrent createOrder calls
    // ------------------------------------------------------------------
    const concurrentCount = 20;
    console.log(`\nLaunching ${concurrentCount} concurrent createOrder() calls...`);

    const promises = Array.from({ length: concurrentCount }, (_, i) =>
      orderService.createOrder(
        { description: `Concurrent Order Batch #${i + 1}`, notes: 'Concurrency test' },
        userId
      )
    );

    const createdOrders = await Promise.all(promises);
    console.log(`Completed ${createdOrders.length} orders concurrently.`);

    // Assertions
    if (createdOrders.length !== concurrentCount) {
      throw new Error(`Expected ${concurrentCount} orders, got ${createdOrders.length}`);
    }

    const orderNumbers = createdOrders.map((o) => o.orderNumber);
    const uniqueOrderNumbers = new Set(orderNumbers);

    console.log('Generated Order Numbers:', orderNumbers.sort());

    if (uniqueOrderNumbers.size !== concurrentCount) {
      throw new Error(
        `DUPLICATE ORDER NUMBERS DETECTED! Expected ${concurrentCount} unique, got ${uniqueOrderNumbers.size}`
      );
    }
    console.log(`✔ All ${concurrentCount} order numbers are strictly unique (0 duplicates).`);

    // Verify all order numbers follow format PO-000001 .. PO-000020
    const sorted = [...orderNumbers].sort();
    for (let i = 1; i <= concurrentCount; i++) {
      const expected = `PO-${String(i).padStart(6, '0')}`;
      if (sorted[i - 1] !== expected) {
        throw new Error(`Expected sequence item ${expected}, got ${sorted[i - 1]}`);
      }
    }
    console.log(`✔ Order numbers strictly cover range PO-000001 through PO-${String(concurrentCount).padStart(6, '0')}.`);

    // Verify sequence table current_value in DB
    const [seqRow] = await ds.query(
      `SELECT current_value FROM production_order_sequence WHERE id = 'PRODUCTION_ORDER'`
    );
    if (!seqRow || seqRow.current_value !== String(concurrentCount)) {
      throw new Error(`Expected sequence currentValue to be '${concurrentCount}', got '${seqRow?.current_value}'`);
    }
    console.log(`✔ DB sequence table current_value is correctly '${concurrentCount}'.`);

    // ------------------------------------------------------------------
    // Part 2: Missing Sequence Row Fails Closed (No lazy creation)
    // ------------------------------------------------------------------
    console.log('\nTesting missing sequence row invariant (fail closed)...');
    await ds.query(`DELETE FROM production_order_sequence WHERE id = 'PRODUCTION_ORDER'`);

    let caughtError: any = null;
    try {
      await orderService.createOrder({ description: 'Failing order' }, userId);
    } catch (err) {
      caughtError = err;
    }

    if (!caughtError || !(caughtError instanceof BusinessRuleError)) {
      throw new Error('Expected BusinessRuleError when sequence row is missing, but none thrown');
    }

    if (caughtError.code !== 'PRODUCTION_ORDER_SEQUENCE_NOT_INITIALIZED') {
      throw new Error(`Expected code PRODUCTION_ORDER_SEQUENCE_NOT_INITIALIZED, got ${caughtError.code}`);
    }
    console.log('✔ Missing sequence row throws PRODUCTION_ORDER_SEQUENCE_NOT_INITIALIZED as expected.');

    await ds.destroy();
  } finally {
    await rawConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await rawConn.end();
    console.log(`Cleaned up disposable database: ${dbName}`);
  }
}

runConcurrencyVerification()
  .then(() => {
    console.log('\n======================================================');
    console.log('ALL CONCURRENCY VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('======================================================');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nConcurrency verification failed:', err);
    process.exit(1);
  });
