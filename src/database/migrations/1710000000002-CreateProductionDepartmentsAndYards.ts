import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateProductionDepartmentsAndYards1710000000002 implements MigrationInterface {
  name = 'CreateProductionDepartmentsAndYards1710000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. production_department
    await queryRunner.createTable(
      new Table({
        name: 'production_department',
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
            isUnique: true,
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
      true,
    );

    await queryRunner.createIndices('production_department', [
      new TableIndex({
        name: 'UQ_production_department_code',
        columnNames: ['code'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_production_department_is_active',
        columnNames: ['is_active'],
      }),
      new TableIndex({
        name: 'IDX_production_department_deleted_at',
        columnNames: ['deleted_at'],
      }),
    ]);

    // 2. production_yard
    await queryRunner.createTable(
      new Table({
        name: 'production_yard',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
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
            length: '100',
            isNullable: false,
          },
          {
            name: 'code',
            type: 'varchar',
            length: '50',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'capacity',
            type: 'int',
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
      true,
    );

    await queryRunner.createIndices('production_yard', [
      new TableIndex({
        name: 'IDX_production_yard_department_id',
        columnNames: ['department_id'],
      }),
      new TableIndex({
        name: 'UQ_production_yard_code',
        columnNames: ['code'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_production_yard_is_active',
        columnNames: ['is_active'],
      }),
      new TableIndex({
        name: 'IDX_production_yard_deleted_at',
        columnNames: ['deleted_at'],
      }),
    ]);

    await queryRunner.createForeignKey(
      'production_yard',
      new TableForeignKey({
        name: 'FK_production_yard_department_id',
        columnNames: ['department_id'],
        referencedTableName: 'production_department',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      }),
    );

    // Add CHECK constraint for positive capacity
    try {
      await queryRunner.query('ALTER TABLE `production_yard` ADD CONSTRAINT `CHK_production_yard_capacity` CHECK (`capacity` > 0)');
    } catch {
      // MySQL older than 8.0.16 might ignore or fail on check constraint
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('production_yard');
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('department_id') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('production_yard', foreignKey);
    }
    await queryRunner.dropTable('production_yard', true);
    await queryRunner.dropTable('production_department', true);
  }
}
