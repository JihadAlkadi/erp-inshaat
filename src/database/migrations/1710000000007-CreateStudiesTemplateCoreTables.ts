import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateStudiesTemplateCoreTables1710000000007 implements MigrationInterface {
  name = 'CreateStudiesTemplateCoreTables1710000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create studies_template table
    await queryRunner.createTable(
      new Table({
        name: 'studies_template',
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
            length: '150',
            isNullable: false,
          },
          {
            name: 'reference_number',
            type: 'varchar',
            length: '100',
            isNullable: true,
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

    await queryRunner.createIndex(
      'studies_template',
      new TableIndex({
        name: 'UQ_studies_template_code',
        columnNames: ['code'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'studies_template',
      new TableIndex({
        name: 'IDX_studies_template_is_active',
        columnNames: ['is_active'],
      })
    );

    await queryRunner.createIndex(
      'studies_template',
      new TableIndex({
        name: 'IDX_studies_template_deleted_at',
        columnNames: ['deleted_at'],
      })
    );

    // 2. Create studies_template_specification table
    await queryRunner.createTable(
      new Table({
        name: 'studies_template_specification',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'template_id',
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
            name: 'value',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'unit',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'sort_order',
            type: 'int',
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
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'studies_template_specification',
      new TableIndex({
        name: 'IDX_studies_template_spec_template_id',
        columnNames: ['template_id'],
      })
    );

    await queryRunner.createForeignKey(
      'studies_template_specification',
      new TableForeignKey({
        name: 'FK_studies_template_spec_template',
        columnNames: ['template_id'],
        referencedTableName: 'studies_template',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      })
    );

    // 3. Create studies_template_stage table
    await queryRunner.createTable(
      new Table({
        name: 'studies_template_stage',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'template_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'department_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '150',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'sort_order',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'estimated_duration_minutes',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'estimated_cost',
            type: 'decimal',
            precision: 18,
            scale: 4,
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

    await queryRunner.createIndex(
      'studies_template_stage',
      new TableIndex({
        name: 'IDX_studies_template_stage_template_id',
        columnNames: ['template_id'],
      })
    );

    await queryRunner.createIndex(
      'studies_template_stage',
      new TableIndex({
        name: 'IDX_studies_template_stage_department_id',
        columnNames: ['department_id'],
      })
    );

    await queryRunner.createIndex(
      'studies_template_stage',
      new TableIndex({
        name: 'IDX_studies_template_stage_sort_order',
        columnNames: ['sort_order'],
      })
    );

    await queryRunner.createIndex(
      'studies_template_stage',
      new TableIndex({
        name: 'IDX_studies_template_stage_deleted_at',
        columnNames: ['deleted_at'],
      })
    );

    await queryRunner.createForeignKey(
      'studies_template_stage',
      new TableForeignKey({
        name: 'FK_studies_template_stage_template',
        columnNames: ['template_id'],
        referencedTableName: 'studies_template',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'studies_template_stage',
      new TableForeignKey({
        name: 'FK_studies_template_stage_department',
        columnNames: ['department_id'],
        referencedTableName: 'production_department',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      })
    );

    // 4. Create studies_template_stage_material table
    await queryRunner.createTable(
      new Table({
        name: 'studies_template_stage_material',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'stage_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'product_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'product_unit_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'planned_quantity',
            type: 'decimal',
            precision: 18,
            scale: 6,
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
      }),
      true
    );

    await queryRunner.createIndex(
      'studies_template_stage_material',
      new TableIndex({
        name: 'IDX_studies_stage_mat_stage_id',
        columnNames: ['stage_id'],
      })
    );

    await queryRunner.createIndex(
      'studies_template_stage_material',
      new TableIndex({
        name: 'IDX_studies_stage_mat_product_id',
        columnNames: ['product_id'],
      })
    );

    await queryRunner.createIndex(
      'studies_template_stage_material',
      new TableIndex({
        name: 'IDX_studies_stage_mat_unit_id',
        columnNames: ['product_unit_id'],
      })
    );

    await queryRunner.createIndex(
      'studies_template_stage_material',
      new TableIndex({
        name: 'UQ_studies_stage_material_stage_unit',
        columnNames: ['stage_id', 'product_unit_id'],
        isUnique: true,
      })
    );

    await queryRunner.createForeignKey(
      'studies_template_stage_material',
      new TableForeignKey({
        name: 'FK_studies_stage_material_stage',
        columnNames: ['stage_id'],
        referencedTableName: 'studies_template_stage',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'studies_template_stage_material',
      new TableForeignKey({
        name: 'FK_studies_stage_material_product',
        columnNames: ['product_id'],
        referencedTableName: 'inventory_product',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'studies_template_stage_material',
      new TableForeignKey({
        name: 'FK_studies_stage_material_unit',
        columnNames: ['product_unit_id'],
        referencedTableName: 'inventory_product_unit',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('studies_template_stage_material', true);
    await queryRunner.dropTable('studies_template_stage', true);
    await queryRunner.dropTable('studies_template_specification', true);
    await queryRunner.dropTable('studies_template', true);
  }
}
