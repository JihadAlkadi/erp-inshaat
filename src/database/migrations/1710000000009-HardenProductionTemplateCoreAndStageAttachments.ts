import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class HardenProductionTemplateCoreAndStageAttachments1710000000009 implements MigrationInterface {
  name = 'HardenProductionTemplateCoreAndStageAttachments1710000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create table production_template_stage_attachment if not exists
    const hasAttachmentTable = await queryRunner.hasTable('production_template_stage_attachment');
    if (!hasAttachmentTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_template_stage_attachment',
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
              name: 'original_file_name',
              type: 'varchar',
              length: '255',
              isNullable: false,
            },
            {
              name: 'storage_key',
              type: 'varchar',
              length: '500',
              isNullable: false,
              isUnique: true,
            },
            {
              name: 'mime_type',
              type: 'varchar',
              length: '100',
              isNullable: false,
            },
            {
              name: 'size_bytes',
              type: 'bigint',
              unsigned: true,
              isNullable: false,
            },
            {
              name: 'description',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
            {
              name: 'sort_order',
              type: 'int',
              default: 1,
              isNullable: false,
            },
            {
              name: 'created_by_user_id',
              type: 'varchar',
              length: '36',
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
          indices: [
            new TableIndex({
              name: 'IDX_production_template_stage_attachment_stage_id',
              columnNames: ['stage_id'],
            }),
            new TableIndex({
              name: 'IDX_production_template_stage_attachment_sort_order',
              columnNames: ['sort_order'],
            }),
            new TableIndex({
              name: 'IDX_production_template_stage_attachment_created_by',
              columnNames: ['created_by_user_id'],
            }),
            new TableIndex({
              name: 'IDX_production_template_stage_attachment_deleted_at',
              columnNames: ['deleted_at'],
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_prod_stage_att_stage',
              columnNames: ['stage_id'],
              referencedTableName: 'production_template_stage',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
            new TableForeignKey({
              name: 'FK_prod_stage_att_user',
              columnNames: ['created_by_user_id'],
              referencedTableName: 'system_user',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
              onUpdate: 'CASCADE',
            }),
          ],
        }),
        true
      );
    }

    // Helper: Ensure CHECK constraint exists by inspecting metadata first (Fail loud if creation fails)
    const ensureCheckConstraint = async (table: string, constraintName: string, checkExpr: string) => {
      const rows = await queryRunner.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
        [table, constraintName]
      );

      if (!rows || rows.length === 0) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraintName}\` CHECK (${checkExpr})`
        );
      }
    };

    // 2. Ensure CHECK constraints on existing and new tables
    await ensureCheckConstraint('production_template_stage', 'CHK_prod_stage_sort_order', '`sort_order` >= 1');
    await ensureCheckConstraint(
      'production_template_stage',
      'CHK_prod_stage_duration',
      '`estimated_duration_minutes` IS NULL OR `estimated_duration_minutes` >= 0'
    );
    await ensureCheckConstraint(
      'production_template_stage',
      'CHK_prod_stage_cost',
      '`estimated_cost` IS NULL OR `estimated_cost` >= 0'
    );
    await ensureCheckConstraint(
      'production_template_stage_material',
      'CHK_prod_stage_mat_quantity',
      '`planned_quantity` > 0'
    );
    await ensureCheckConstraint(
      'production_template_specification',
      'CHK_prod_spec_sort_order',
      '`sort_order` >= 1'
    );
    await ensureCheckConstraint(
      'production_template_stage_attachment',
      'CHK_prod_stage_att_sort_order',
      '`sort_order` >= 1'
    );
    await ensureCheckConstraint(
      'production_template_stage_attachment',
      'CHK_prod_stage_att_size_bytes',
      '`size_bytes` > 0'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasAttachmentTable = await queryRunner.hasTable('production_template_stage_attachment');
    if (hasAttachmentTable) {
      await queryRunner.dropTable('production_template_stage_attachment', true, true, true);
    }
  }
}
