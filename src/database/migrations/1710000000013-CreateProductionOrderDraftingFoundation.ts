import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateProductionOrderDraftingFoundation1710000000013
  implements MigrationInterface
{
  name = 'CreateProductionOrderDraftingFoundation1710000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================================
    // 1. SEQUENCE TABLE: production_order_sequence (Concurrency-Safe Order Number)
    // =========================================================================
    const hasSeqTable = await queryRunner.hasTable('production_order_sequence');
    if (!hasSeqTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_order_sequence',
          columns: [
            {
              name: 'id',
              type: 'varchar',
              length: '50',
              isPrimary: true,
            },
            {
              name: 'current_value',
              type: 'bigint',
              default: '0',
              isNullable: false,
            },
            {
              name: 'updated_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              onUpdate: 'CURRENT_TIMESTAMP(6)',
              isNullable: false,
            },
          ],
        }),
        true
      );

      // Seed initial sequence row for production orders
      await queryRunner.query(
        `INSERT IGNORE INTO production_order_sequence (id, current_value) VALUES ('PRODUCTION_ORDER', 0)`
      );
    }

    // =========================================================================
    // 2. PRODUCTION ORDER TABLE: production_order
    // =========================================================================
    const hasOrderTable = await queryRunner.hasTable('production_order');
    if (!hasOrderTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_order',
          columns: [
            {
              name: 'id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'order_number',
              type: 'varchar',
              length: '50',
              isNullable: false,
              isUnique: true,
            },
            {
              name: 'status',
              type: 'varchar',
              length: '20',
              default: "'DRAFT'",
              isNullable: false,
            },
            {
              name: 'description',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'notes',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'created_by_user_id',
              type: 'varchar',
              length: '36',
              isNullable: false,
            },
            {
              name: 'created_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              isNullable: false,
            },
            {
              name: 'updated_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              onUpdate: 'CURRENT_TIMESTAMP(6)',
              isNullable: false,
            },
            {
              name: 'deleted_at',
              type: 'datetime',
              precision: 6,
              isNullable: true,
            },
          ],
          indices: [
            new TableIndex({
              name: 'UQ_production_order_order_number',
              columnNames: ['order_number'],
              isUnique: true,
            }),
            new TableIndex({
              name: 'IDX_production_order_created_by',
              columnNames: ['created_by_user_id'],
            }),
            new TableIndex({
              name: 'IDX_production_order_deleted_at',
              columnNames: ['deleted_at'],
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_production_order_created_by_user',
              columnNames: ['created_by_user_id'],
              referencedTableName: 'system_user',
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE',
            }),
          ],
        }),
        true
      );

      // Check constraint: status = 'DRAFT'
      await queryRunner.query(
        `ALTER TABLE production_order ADD CONSTRAINT CHK_production_order_status CHECK (status = 'DRAFT')`
      );
    }

    // =========================================================================
    // 3. PRODUCTION ORDER LINE TABLE: production_order_line
    // =========================================================================
    const hasLineTable = await queryRunner.hasTable('production_order_line');
    if (!hasLineTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_order_line',
          columns: [
            {
              name: 'id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'order_id',
              type: 'varchar',
              length: '36',
              isNullable: false,
            },
            {
              name: 'template_id',
              type: 'varchar',
              length: '36',
              isNullable: false,
            },
            {
              name: 'quantity',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'sort_order',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'created_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              isNullable: false,
            },
            {
              name: 'updated_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              onUpdate: 'CURRENT_TIMESTAMP(6)',
              isNullable: false,
            },
            {
              name: 'deleted_at',
              type: 'datetime',
              precision: 6,
              isNullable: true,
            },
          ],
          indices: [
            new TableIndex({
              name: 'IDX_production_order_line_order_id',
              columnNames: ['order_id'],
            }),
            new TableIndex({
              name: 'IDX_production_order_line_template_id',
              columnNames: ['template_id'],
            }),
            new TableIndex({
              name: 'IDX_production_order_line_deleted_at',
              columnNames: ['deleted_at'],
            }),
            new TableIndex({
              name: 'IDX_production_order_line_order_sort',
              columnNames: ['order_id', 'deleted_at', 'sort_order'],
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_production_order_line_order',
              columnNames: ['order_id'],
              referencedTableName: 'production_order',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
            new TableForeignKey({
              name: 'FK_production_order_line_template',
              columnNames: ['template_id'],
              referencedTableName: 'production_template',
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE',
            }),
          ],
        }),
        true
      );

      // Check constraints for quantity and sort_order
      await queryRunner.query(
        `ALTER TABLE production_order_line ADD CONSTRAINT CHK_production_order_line_quantity CHECK (quantity >= 1 AND quantity <= 10000)`
      );
      await queryRunner.query(
        `ALTER TABLE production_order_line ADD CONSTRAINT CHK_production_order_line_sort_order CHECK (sort_order >= 1)`
      );
    }

    // =========================================================================
    // 4. PATTERN SELECTION TABLE: production_order_line_pattern_selection
    // =========================================================================
    const hasSelectionTable = await queryRunner.hasTable(
      'production_order_line_pattern_selection'
    );
    if (!hasSelectionTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_order_line_pattern_selection',
          columns: [
            {
              name: 'id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'order_line_id',
              type: 'varchar',
              length: '36',
              isNullable: false,
            },
            {
              name: 'template_pattern_id',
              type: 'varchar',
              length: '36',
              isNullable: false,
            },
            {
              name: 'selected_option_id',
              type: 'varchar',
              length: '36',
              isNullable: false,
            },
            {
              name: 'created_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              isNullable: false,
            },
            {
              name: 'updated_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              onUpdate: 'CURRENT_TIMESTAMP(6)',
              isNullable: false,
            },
          ],
          indices: [
            new TableIndex({
              name: 'IDX_prod_order_line_pattern_sel_line',
              columnNames: ['order_line_id'],
            }),
            new TableIndex({
              name: 'IDX_prod_order_line_pattern_sel_pattern',
              columnNames: ['template_pattern_id'],
            }),
            new TableIndex({
              name: 'IDX_prod_order_line_pattern_sel_option',
              columnNames: ['selected_option_id'],
            }),
            new TableIndex({
              name: 'UQ_prod_order_line_pattern',
              columnNames: ['order_line_id', 'template_pattern_id'],
              isUnique: true,
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_prod_order_line_pattern_sel_line',
              columnNames: ['order_line_id'],
              referencedTableName: 'production_order_line',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
            new TableForeignKey({
              name: 'FK_prod_order_line_pattern_sel_pattern',
              columnNames: ['template_pattern_id'],
              referencedTableName: 'production_template_pattern',
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE',
            }),
            new TableForeignKey({
              name: 'FK_prod_order_line_pattern_sel_option',
              columnNames: ['selected_option_id'],
              referencedTableName: 'production_template_pattern_option',
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE',
            }),
          ],
        }),
        true
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasSelectionTable = await queryRunner.hasTable(
      'production_order_line_pattern_selection'
    );
    if (hasSelectionTable) {
      await queryRunner.dropTable('production_order_line_pattern_selection');
    }

    const hasLineTable = await queryRunner.hasTable('production_order_line');
    if (hasLineTable) {
      await queryRunner.dropTable('production_order_line');
    }

    const hasOrderTable = await queryRunner.hasTable('production_order');
    if (hasOrderTable) {
      await queryRunner.dropTable('production_order');
    }

    const hasSeqTable = await queryRunner.hasTable('production_order_sequence');
    if (hasSeqTable) {
      await queryRunner.dropTable('production_order_sequence');
    }
  }
}
