import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

async function checkConstraintExists(
  queryRunner: QueryRunner,
  tableName: string,
  constraintName: string
): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT COUNT(1) as cnt FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?`,
    [tableName, constraintName]
  );
  return parseInt(rows[0]?.cnt || '0', 10) > 0;
}

export class AddProductionOrderPriority1710000000016
  implements MigrationInterface
{
  name = 'AddProductionOrderPriority1710000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // STEP 1 — REQUIRE BASE TABLE
    // ------------------------------------------------------------------
    let table = await queryRunner.getTable('production_order');
    if (!table) {
      throw new Error(
        "Migration 1710000000016 up failed: Base table 'production_order' does not exist."
      );
    }

    // ------------------------------------------------------------------
    // STEP 2 — COLUMN (INDEPENDENT RECOVERY)
    // ------------------------------------------------------------------
    const priorityCol = table.findColumnByName('priority');
    if (!priorityCol) {
      await queryRunner.addColumn(
        'production_order',
        new TableColumn({
          name: 'priority',
          type: 'varchar',
          length: '20',
          isNullable: false,
          default: "'NORMAL'",
        })
      );
    } else {
      const colType = priorityCol.type.toLowerCase();
      if (!['varchar', 'char', 'text', 'string'].includes(colType)) {
        throw new Error(
          `Migration 1710000000016 up failed: Column 'priority' already exists but has incompatible type '${priorityCol.type}'. Expected varchar(20).`
        );
      }
    }

    // ------------------------------------------------------------------
    // STEP 3 — DATA NORMALIZATION & FAIL-LOUD VALIDATION
    // ------------------------------------------------------------------
    // Normalize legacy empty/null values to 'NORMAL'
    await queryRunner.query(
      `UPDATE \`production_order\` SET \`priority\` = 'NORMAL' WHERE \`priority\` IS NULL OR \`priority\` = ''`
    );

    // Fail loudly if non-empty invalid priority values exist outside allowed set
    const invalidRows: Array<{
      id: string;
      order_number: string;
      priority: string;
    }> = await queryRunner.query(
      `SELECT id, order_number, priority FROM \`production_order\` WHERE \`priority\` NOT IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW')`
    );

    if (invalidRows && invalidRows.length > 0) {
      const details = invalidRows
        .slice(0, 10)
        .map(
          (r) =>
            `[id=${r.id}, order_number=${r.order_number}, priority=${r.priority}]`
        )
        .join(', ');
      const more =
        invalidRows.length > 10 ? ` and ${invalidRows.length - 10} more` : '';
      throw new Error(
        `Migration 1710000000016 up failed: Found ${invalidRows.length} production orders with invalid priority values outside CRITICAL, HIGH, NORMAL, LOW: ${details}${more}. Data must not be silently overwritten.`
      );
    }

    // ------------------------------------------------------------------
    // STEP 4 — CHECK CONSTRAINT (INDEPENDENT RECOVERY)
    // ------------------------------------------------------------------
    const hasCheck = await checkConstraintExists(
      queryRunner,
      'production_order',
      'CHK_production_order_priority'
    );

    if (!hasCheck) {
      await queryRunner.query(
        `ALTER TABLE \`production_order\` ADD CONSTRAINT \`CHK_production_order_priority\` CHECK (\`priority\` IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW'))`
      );
    }

    // ------------------------------------------------------------------
    // STEP 5 — INDEX (INDEPENDENT RECOVERY)
    // ------------------------------------------------------------------
    table = await queryRunner.getTable('production_order');
    if (!table) {
      throw new Error(
        "Migration 1710000000016 up failed: Failed to reload table 'production_order' metadata."
      );
    }

    const hasIndex = table.indices.some(
      (i) => i.name === 'IDX_production_order_priority'
    );

    if (!hasIndex) {
      await queryRunner.createIndex(
        'production_order',
        new TableIndex({
          name: 'IDX_production_order_priority',
          columnNames: ['priority'],
        })
      );
    }

    // ------------------------------------------------------------------
    // STEP 6 — FINAL INVARIANT VERIFICATION
    // ------------------------------------------------------------------
    table = await queryRunner.getTable('production_order');
    if (!table) {
      throw new Error(
        "Migration 1710000000016 up verification failed: Table 'production_order' metadata unavailable."
      );
    }

    if (!table.findColumnByName('priority')) {
      throw new Error(
        "Migration 1710000000016 up verification failed: Column 'priority' missing on 'production_order'."
      );
    }

    if (
      !table.indices.some((i) => i.name === 'IDX_production_order_priority')
    ) {
      throw new Error(
        "Migration 1710000000016 up verification failed: Index 'IDX_production_order_priority' missing on 'production_order'."
      );
    }

    const finalCheck = await checkConstraintExists(
      queryRunner,
      'production_order',
      'CHK_production_order_priority'
    );
    if (!finalCheck) {
      throw new Error(
        "Migration 1710000000016 up verification failed: CHECK constraint 'CHK_production_order_priority' missing on 'production_order'."
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const baseTable = await queryRunner.getTable('production_order');
    if (!baseTable) {
      return;
    }

    // 1. Detect and drop CHECK constraint
    const hasCheck = await checkConstraintExists(
      queryRunner,
      'production_order',
      'CHK_production_order_priority'
    );

    if (hasCheck) {
      try {
        await queryRunner.query(
          `ALTER TABLE \`production_order\` DROP CONSTRAINT \`CHK_production_order_priority\``
        );
      } catch {
        // MySQL 8.0.16-8.0.18 compatibility
        try {
          await queryRunner.query(
            `ALTER TABLE \`production_order\` DROP CHECK \`CHK_production_order_priority\``
          );
        } catch (innerErr: any) {
          throw new Error(
            `Migration 1710000000016 down failed to drop CHECK constraint 'CHK_production_order_priority': ${innerErr?.message || innerErr}`
          );
        }
      }
    }

    // 2. Refresh metadata & drop index if present
    let table = await queryRunner.getTable('production_order');
    const idx = table?.indices.find(
      (i) => i.name === 'IDX_production_order_priority'
    );
    if (idx) {
      await queryRunner.dropIndex('production_order', idx);
    }

    // 3. Refresh metadata & drop column if present
    table = await queryRunner.getTable('production_order');
    if (table?.findColumnByName('priority')) {
      await queryRunner.dropColumn('production_order', 'priority');
    }
  }
}
