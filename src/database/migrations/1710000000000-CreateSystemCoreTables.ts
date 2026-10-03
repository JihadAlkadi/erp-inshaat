import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateSystemCoreTables1710000000000 implements MigrationInterface {
  name = 'CreateSystemCoreTables1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. system_role
    await queryRunner.createTable(
      new Table({
        name: 'system_role',
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

    // 2. system_user
    await queryRunner.createTable(
      new Table({
        name: 'system_user',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'full_name',
            type: 'varchar',
            length: '150',
            isNullable: false,
          },
          {
            name: 'phone',
            type: 'varchar',
            length: '20',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'password_hash',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'role_id',
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
          {
            name: 'deleted_at',
            type: 'datetime',
            precision: 6,
            isNullable: true,
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_system_user_role_id',
            columnNames: ['role_id'],
            referencedTableName: 'system_role',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_system_user_role_id',
            columnNames: ['role_id'],
          }),
        ],
      }),
      true,
    );

    // 3. system_permission
    await queryRunner.createTable(
      new Table({
        name: 'system_permission',
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

    // 4. system_permission_grant
    await queryRunner.createTable(
      new Table({
        name: 'system_permission_grant',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'permission_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'role_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'can_delegate',
            type: 'tinyint',
            default: 0,
            isNullable: false,
          },
          {
            name: 'granted_by',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'granted_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          },
          {
            name: 'expires_at',
            type: 'datetime',
            precision: 6,
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'tinyint',
            default: 1,
            isNullable: false,
          },
          {
            name: 'reason',
            type: 'text',
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
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_system_permission_grant_permission_id',
            columnNames: ['permission_id'],
            referencedTableName: 'system_permission',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          }),
          new TableForeignKey({
            name: 'FK_system_permission_grant_user_id',
            columnNames: ['user_id'],
            referencedTableName: 'system_user',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          }),
          new TableForeignKey({
            name: 'FK_system_permission_grant_role_id',
            columnNames: ['role_id'],
            referencedTableName: 'system_role',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          }),
          new TableForeignKey({
            name: 'FK_system_permission_grant_granted_by',
            columnNames: ['granted_by'],
            referencedTableName: 'system_user',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_system_permission_grant_permission_id',
            columnNames: ['permission_id'],
          }),
          new TableIndex({
            name: 'IDX_system_permission_grant_user_id',
            columnNames: ['user_id'],
          }),
          new TableIndex({
            name: 'IDX_system_permission_grant_role_id',
            columnNames: ['role_id'],
          }),
          new TableIndex({
            name: 'IDX_system_permission_grant_granted_by',
            columnNames: ['granted_by'],
          }),
          new TableIndex({
            name: 'IDX_system_permission_grant_is_active',
            columnNames: ['is_active'],
          }),
          new TableIndex({
            name: 'IDX_system_permission_grant_expires_at',
            columnNames: ['expires_at'],
          }),
        ],
      }),
      true,
    );

    // Enforce XOR target check constraint on system_permission_grant using static SQL
    await queryRunner.query(
      'ALTER TABLE `system_permission_grant` ADD CONSTRAINT `CHK_system_permission_grant_target` CHECK ((`user_id` IS NOT NULL AND `role_id` IS NULL) OR (`user_id` IS NULL AND `role_id` IS NOT NULL))',
    );

    // 5. system_access_rule
    await queryRunner.createTable(
      new Table({
        name: 'system_access_rule',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'permission_grant_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'effect',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'scope_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'scope',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'tinyint',
            default: 1,
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
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
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_system_access_rule_permission_grant_id',
            columnNames: ['permission_grant_id'],
            referencedTableName: 'system_permission_grant',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_system_access_rule_permission_grant_id',
            columnNames: ['permission_grant_id'],
          }),
          new TableIndex({
            name: 'IDX_system_access_rule_effect',
            columnNames: ['effect'],
          }),
          new TableIndex({
            name: 'IDX_system_access_rule_scope_type',
            columnNames: ['scope_type'],
          }),
          new TableIndex({
            name: 'IDX_system_access_rule_is_active',
            columnNames: ['is_active'],
          }),
        ],
      }),
      true,
    );

    // Enforce effect CHECK constraint on system_access_rule using static SQL
    await queryRunner.query(
      "ALTER TABLE `system_access_rule` ADD CONSTRAINT `CHK_system_access_rule_effect` CHECK (`effect` IN ('ALLOW', 'DENY'))",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('system_access_rule', true, true, true);
    await queryRunner.dropTable('system_permission_grant', true, true, true);
    await queryRunner.dropTable('system_permission', true, true, true);
    await queryRunner.dropTable('system_user', true, true, true);
    await queryRunner.dropTable('system_role', true, true, true);
  }
}
