import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class AddProductionOrderApprovalStatus1710000000015
  implements MigrationInterface
{
  name = 'AddProductionOrderApprovalStatus1710000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop existing CHECK constraint restricting status only to 'DRAFT'
    // MariaDB 10.2+ and MySQL 8.0.19+ use DROP CONSTRAINT; MySQL 8.0.16-8.0.18 uses DROP CHECK
    try {
      await queryRunner.query(
        `ALTER TABLE \`production_order\` DROP CONSTRAINT \`CHK_production_order_status\``
      );
    } catch {
      await queryRunner.query(
        `ALTER TABLE \`production_order\` DROP CHECK \`CHK_production_order_status\``
      );
    }

    // 2. Add updated CHECK constraint supporting ('DRAFT', 'APPROVED')
    await queryRunner.query(
      `ALTER TABLE production_order ADD CONSTRAINT CHK_production_order_status CHECK (status IN ('DRAFT', 'APPROVED'))`
    );

    // 3. Add approved_at column
    const table = await queryRunner.getTable('production_order');
    const hasApprovedAt = table?.findColumnByName('approved_at');
    if (!hasApprovedAt) {
      await queryRunner.addColumn(
        'production_order',
        new TableColumn({
          name: 'approved_at',
          type: 'datetime',
          precision: 6,
          isNullable: true,
          default: null,
        })
      );
    }

    // 4. Add approved_by_user_id column
    const hasApprovedByUser = table?.findColumnByName('approved_by_user_id');
    if (!hasApprovedByUser) {
      await queryRunner.addColumn(
        'production_order',
        new TableColumn({
          name: 'approved_by_user_id',
          type: 'varchar',
          length: '36',
          isNullable: true,
          default: null,
        })
      );

      // Add index on approved_by_user_id
      await queryRunner.createIndex(
        'production_order',
        new TableIndex({
          name: 'IDX_production_order_approved_by',
          columnNames: ['approved_by_user_id'],
        })
      );

      // Add foreign key referencing system_user(id)
      await queryRunner.createForeignKey(
        'production_order',
        new TableForeignKey({
          name: 'FK_production_order_approved_by_user',
          columnNames: ['approved_by_user_id'],
          referencedTableName: 'system_user',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Safety Guard: Fail loudly if any rows have status = 'APPROVED'
    const approvedOrders: Array<{ id: string; order_number: string }> =
      await queryRunner.query(
        `SELECT id, order_number FROM production_order WHERE status = 'APPROVED'`
      );

    if (approvedOrders.length > 0) {
      const orderNumbers = approvedOrders.map((o) => o.order_number).join(', ');
      throw new Error(
        `Migration 1710000000015 down failed: Cannot revert because APPROVED production orders exist in database: [${orderNumbers}]. Reopen these orders to DRAFT before reverting.`
      );
    }

    // 2. Drop foreign key and index
    const table = await queryRunner.getTable('production_order');
    const fk = table?.foreignKeys.find(
      (f) => f.name === 'FK_production_order_approved_by_user'
    );
    if (fk) {
      await queryRunner.dropForeignKey('production_order', fk);
    }

    const idx = table?.indices.find(
      (i) => i.name === 'IDX_production_order_approved_by'
    );
    if (idx) {
      await queryRunner.dropIndex('production_order', idx);
    }

    // 3. Drop columns
    if (table?.findColumnByName('approved_by_user_id')) {
      await queryRunner.dropColumn('production_order', 'approved_by_user_id');
    }
    if (table?.findColumnByName('approved_at')) {
      await queryRunner.dropColumn('production_order', 'approved_at');
    }

    // 4. Restore original DRAFT-only constraint
    try {
      await queryRunner.query(
        `ALTER TABLE \`production_order\` DROP CONSTRAINT \`CHK_production_order_status\``
      );
    } catch {
      await queryRunner.query(
        `ALTER TABLE \`production_order\` DROP CHECK \`CHK_production_order_status\``
      );
    }
    await queryRunner.query(
      `ALTER TABLE production_order ADD CONSTRAINT CHK_production_order_status CHECK (status = 'DRAFT')`
    );
  }
}
