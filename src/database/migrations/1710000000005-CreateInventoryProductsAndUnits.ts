import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey, TableCheck } from 'typeorm';

export class CreateInventoryProductsAndUnits1710000000005 implements MigrationInterface {
  name = 'CreateInventoryProductsAndUnits1710000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create inventory_product table (with base_unit_id nullable and without FK to unit initially)
    await queryRunner.createTable(
      new Table({
        name: 'inventory_product',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'category_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '150',
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
            name: 'location_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'base_unit_id',
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

    // Indexes on inventory_product
    await queryRunner.createIndex(
      'inventory_product',
      new TableIndex({
        name: 'UQ_inventory_product_code',
        columnNames: ['code'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'inventory_product',
      new TableIndex({
        name: 'IDX_inventory_product_category_id',
        columnNames: ['category_id'],
      })
    );

    await queryRunner.createIndex(
      'inventory_product',
      new TableIndex({
        name: 'IDX_inventory_product_base_unit_id',
        columnNames: ['base_unit_id'],
      })
    );

    await queryRunner.createIndex(
      'inventory_product',
      new TableIndex({
        name: 'IDX_inventory_product_is_active',
        columnNames: ['is_active'],
      })
    );

    await queryRunner.createIndex(
      'inventory_product',
      new TableIndex({
        name: 'IDX_inventory_product_deleted_at',
        columnNames: ['deleted_at'],
      })
    );

    // Foreign key from inventory_product.category_id to inventory_category.id
    await queryRunner.createForeignKey(
      'inventory_product',
      new TableForeignKey({
        name: 'FK_inventory_product_category_id',
        columnNames: ['category_id'],
        referencedTableName: 'inventory_category',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      })
    );

    // 2. Create inventory_product_unit table
    await queryRunner.createTable(
      new Table({
        name: 'inventory_product_unit',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'product_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'barcode',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'price',
            type: 'decimal',
            precision: 18,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'equivalent_to_unit_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'conversion_quantity',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: true,
          },
          {
            name: 'specifications',
            type: 'json',
            isNullable: true,
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

    // Indexes & Unique constraints on inventory_product_unit
    await queryRunner.createIndex(
      'inventory_product_unit',
      new TableIndex({
        name: 'UQ_inventory_product_unit_product_name',
        columnNames: ['product_id', 'name'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'inventory_product_unit',
      new TableIndex({
        name: 'UQ_inventory_product_unit_barcode',
        columnNames: ['barcode'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'inventory_product_unit',
      new TableIndex({
        name: 'IDX_inventory_product_unit_product_id',
        columnNames: ['product_id'],
      })
    );

    await queryRunner.createIndex(
      'inventory_product_unit',
      new TableIndex({
        name: 'IDX_inventory_product_unit_equivalent_to_unit_id',
        columnNames: ['equivalent_to_unit_id'],
      })
    );

    await queryRunner.createIndex(
      'inventory_product_unit',
      new TableIndex({
        name: 'IDX_inventory_product_unit_deleted_at',
        columnNames: ['deleted_at'],
      })
    );

    // Foreign keys on inventory_product_unit
    await queryRunner.createForeignKey(
      'inventory_product_unit',
      new TableForeignKey({
        name: 'FK_inventory_product_unit_product_id',
        columnNames: ['product_id'],
        referencedTableName: 'inventory_product',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'inventory_product_unit',
      new TableForeignKey({
        name: 'FK_inventory_product_unit_equivalent_to_unit_id',
        columnNames: ['equivalent_to_unit_id'],
        referencedTableName: 'inventory_product_unit',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      })
    );

    // Checks on inventory_product_unit
    await queryRunner.createCheckConstraint(
      'inventory_product_unit',
      new TableCheck({
        name: 'CHK_inventory_product_unit_price',
        expression: '`price` >= 0',
      })
    );

    await queryRunner.createCheckConstraint(
      'inventory_product_unit',
      new TableCheck({
        name: 'CHK_inventory_product_unit_conversion_quantity',
        expression: '`conversion_quantity` IS NULL OR `conversion_quantity` > 0',
      })
    );

    await queryRunner.createCheckConstraint(
      'inventory_product_unit',
      new TableCheck({
        name: 'CHK_inventory_product_unit_equivalent_not_self',
        expression: '`equivalent_to_unit_id` IS NULL OR `equivalent_to_unit_id` <> `id`',
      })
    );

    // 3. Add FK from inventory_product.base_unit_id to inventory_product_unit.id
    await queryRunner.createForeignKey(
      'inventory_product',
      new TableForeignKey({
        name: 'FK_inventory_product_base_unit_id',
        columnNames: ['base_unit_id'],
        referencedTableName: 'inventory_product_unit',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop FK base_unit_id on inventory_product
    await queryRunner.dropForeignKey('inventory_product', 'FK_inventory_product_base_unit_id');

    // 2. Drop FKs and Table inventory_product_unit
    await queryRunner.dropForeignKey('inventory_product_unit', 'FK_inventory_product_unit_equivalent_to_unit_id');
    await queryRunner.dropForeignKey('inventory_product_unit', 'FK_inventory_product_unit_product_id');
    await queryRunner.dropTable('inventory_product_unit');

    // 3. Drop FK and Table inventory_product
    await queryRunner.dropForeignKey('inventory_product', 'FK_inventory_product_category_id');
    await queryRunner.dropTable('inventory_product');
  }
}
