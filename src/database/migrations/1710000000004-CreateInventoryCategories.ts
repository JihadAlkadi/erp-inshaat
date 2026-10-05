import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateInventoryCategories1710000000004 implements MigrationInterface {
  name = 'CreateInventoryCategories1710000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'inventory_category',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'code',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'parent_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'tinyint',
            default: 1,
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
      }),
      true
    );

    // Unique Code Index (global including soft-deleted)
    await queryRunner.createIndex(
      'inventory_category',
      new TableIndex({
        name: 'UQ_inventory_category_code',
        columnNames: ['code'],
        isUnique: true,
      })
    );

    // Indexes
    await queryRunner.createIndex(
      'inventory_category',
      new TableIndex({
        name: 'IDX_inventory_category_parent_id',
        columnNames: ['parent_id'],
      })
    );

    await queryRunner.createIndex(
      'inventory_category',
      new TableIndex({
        name: 'IDX_inventory_category_is_active',
        columnNames: ['is_active'],
      })
    );

    await queryRunner.createIndex(
      'inventory_category',
      new TableIndex({
        name: 'IDX_inventory_category_deleted_at',
        columnNames: ['deleted_at'],
      })
    );

    // Foreign Key: Self Parent
    await queryRunner.createForeignKey(
      'inventory_category',
      new TableForeignKey({
        name: 'FK_inventory_category_parent',
        columnNames: ['parent_id'],
        referencedTableName: 'inventory_category',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      })
    );

    // Check Constraint: parent_id IS NULL OR parent_id <> id
    await queryRunner.query(
      'ALTER TABLE `inventory_category` ADD CONSTRAINT `CHK_inventory_category_parent_not_self` CHECK (`parent_id` IS NULL OR `parent_id` <> `id`)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('inventory_category');
    if (table) {
      const foreignKey = table.foreignKeys.find((fk) => fk.name === 'FK_inventory_category_parent');
      if (foreignKey) {
        await queryRunner.dropForeignKey('inventory_category', foreignKey);
      }
    }
    await queryRunner.dropTable('inventory_category', true);
  }
}

