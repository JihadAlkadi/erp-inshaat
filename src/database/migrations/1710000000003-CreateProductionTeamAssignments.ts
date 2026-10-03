import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateProductionTeamAssignments1710000000003 implements MigrationInterface {
  name = 'CreateProductionTeamAssignments1710000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add head_user_id to production_department
    await queryRunner.addColumn(
      'production_department',
      new TableColumn({
        name: 'head_user_id',
        type: 'varchar',
        length: '36',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'production_department',
      new TableIndex({
        name: 'IDX_production_department_head_user_id',
        columnNames: ['head_user_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'production_department',
      new TableForeignKey({
        name: 'FK_production_department_head_user_id',
        columnNames: ['head_user_id'],
        referencedTableName: 'system_user',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      }),
    );

    // 2. Create production_department_engineer table
    await queryRunner.createTable(
      new Table({
        name: 'production_department_engineer',
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
            name: 'user_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
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
        ],
      }),
      true,
    );

    await queryRunner.createIndices('production_department_engineer', [
      new TableIndex({
        name: 'UQ_production_department_engineer_user',
        columnNames: ['user_id'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_production_department_engineer_dept_id',
        columnNames: ['department_id'],
      }),
      new TableIndex({
        name: 'IDX_production_department_engineer_is_active',
        columnNames: ['is_active'],
      }),
    ]);

    await queryRunner.createForeignKeys('production_department_engineer', [
      new TableForeignKey({
        name: 'FK_production_department_engineer_dept_id',
        columnNames: ['department_id'],
        referencedTableName: 'production_department',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_production_department_engineer_user_id',
        columnNames: ['user_id'],
        referencedTableName: 'system_user',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      }),
    ]);

    // 3. Create production_yard_engineer table
    await queryRunner.createTable(
      new Table({
        name: 'production_yard_engineer',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'department_engineer_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'yard_id',
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
        ],
      }),
      true,
    );

    await queryRunner.createIndices('production_yard_engineer', [
      new TableIndex({
        name: 'UQ_production_yard_engineer_assignment',
        columnNames: ['department_engineer_id', 'yard_id'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_production_yard_engineer_dept_eng_id',
        columnNames: ['department_engineer_id'],
      }),
      new TableIndex({
        name: 'IDX_production_yard_engineer_yard_id',
        columnNames: ['yard_id'],
      }),
    ]);

    await queryRunner.createForeignKeys('production_yard_engineer', [
      new TableForeignKey({
        name: 'FK_production_yard_engineer_dept_eng_id',
        columnNames: ['department_engineer_id'],
        referencedTableName: 'production_department_engineer',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_production_yard_engineer_yard_id',
        columnNames: ['yard_id'],
        referencedTableName: 'production_yard',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop production_yard_engineer
    const yardEngTable = await queryRunner.getTable('production_yard_engineer');
    if (yardEngTable) {
      for (const fk of yardEngTable.foreignKeys) {
        await queryRunner.dropForeignKey('production_yard_engineer', fk);
      }
      await queryRunner.dropTable('production_yard_engineer', true);
    }

    // 2. Drop production_department_engineer
    const deptEngTable = await queryRunner.getTable('production_department_engineer');
    if (deptEngTable) {
      for (const fk of deptEngTable.foreignKeys) {
        await queryRunner.dropForeignKey('production_department_engineer', fk);
      }
      await queryRunner.dropTable('production_department_engineer', true);
    }

    // 3. Revert production_department head_user_id
    const deptTable = await queryRunner.getTable('production_department');
    if (deptTable) {
      const headFk = deptTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('head_user_id') !== -1,
      );
      if (headFk) {
        await queryRunner.dropForeignKey('production_department', headFk);
      }
      const headIdx = deptTable.indices.find(
        (idx) => idx.name === 'IDX_production_department_head_user_id',
      );
      if (headIdx) {
        await queryRunner.dropIndex('production_department', headIdx);
      }
      await queryRunner.dropColumn('production_department', 'head_user_id');
    }
  }
}
