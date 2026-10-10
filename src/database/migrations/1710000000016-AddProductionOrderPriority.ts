import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddProductionOrderPriority1710000000016
  implements MigrationInterface
{
  name = 'AddProductionOrderPriority1710000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('production_order');
    const hasPriority = table?.findColumnByName('priority');

    if (!hasPriority) {
      // 1. Add priority column with DEFAULT 'NORMAL'
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

      // 2. Ensure all existing rows have 'NORMAL'
      await queryRunner.query(
        `UPDATE \`production_order\` SET \`priority\` = 'NORMAL' WHERE \`priority\` IS NULL OR \`priority\` = ''`
      );

      // 3. Add database-level CHECK constraint allowing only 4 priority values
      await queryRunner.query(
        `ALTER TABLE \`production_order\` ADD CONSTRAINT \`CHK_production_order_priority\` CHECK (\`priority\` IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW'))`
      );

      // 4. Add index for fast priority filtering
      await queryRunner.createIndex(
        'production_order',
        new TableIndex({
          name: 'IDX_production_order_priority',
          columnNames: ['priority'],
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('production_order');

    // 1. Drop CHECK constraint
    try {
      await queryRunner.query(
        `ALTER TABLE \`production_order\` DROP CONSTRAINT \`CHK_production_order_priority\``
      );
    } catch {
      await queryRunner.query(
        `ALTER TABLE \`production_order\` DROP CHECK \`CHK_production_order_priority\``
      );
    }

    // 2. Drop index
    const idx = table?.indices.find(
      (i) => i.name === 'IDX_production_order_priority'
    );
    if (idx) {
      await queryRunner.dropIndex('production_order', idx);
    }

    // 3. Drop column
    if (table?.findColumnByName('priority')) {
      await queryRunner.dropColumn('production_order', 'priority');
    }
  }
}
