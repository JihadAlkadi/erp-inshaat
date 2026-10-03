import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateSystemSessionTable1710000000001 implements MigrationInterface {
  name = 'CreateSystemSessionTable1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'system_session',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'user_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'token_hash',
            type: 'varchar',
            length: '64',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'device_type',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'device_name',
            type: 'varchar',
            length: '150',
            isNullable: true,
          },
          {
            name: 'browser',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'os',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'user_agent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'ip_address',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'last_used_at',
            type: 'datetime',
            precision: 6,
            isNullable: false,
          },
          {
            name: 'expires_at',
            type: 'datetime',
            precision: 6,
            isNullable: false,
          },
          {
            name: 'is_active',
            type: 'tinyint',
            default: 1,
            isNullable: false,
          },
          {
            name: 'revoked_at',
            type: 'datetime',
            precision: 6,
            isNullable: true,
          },
          {
            name: 'revoked_reason',
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
            name: 'FK_system_session_user_id',
            columnNames: ['user_id'],
            referencedTableName: 'system_user',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_system_session_user_id',
            columnNames: ['user_id'],
          }),
          new TableIndex({
            name: 'IDX_system_session_expires_at',
            columnNames: ['expires_at'],
          }),
          new TableIndex({
            name: 'IDX_system_session_is_active',
            columnNames: ['is_active'],
          }),
          new TableIndex({
            name: 'IDX_system_session_user_is_active',
            columnNames: ['user_id', 'is_active'],
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('system_session', true, true, true);
  }
}
