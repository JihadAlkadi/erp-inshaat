import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import crypto from 'crypto';

export class AddProductionTemplateMixedWorkflowPatterns1710000000011 implements MigrationInterface {
  name = 'AddProductionTemplateMixedWorkflowPatterns1710000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create table production_template_pattern if not exists
    const hasPatternTable = await queryRunner.hasTable('production_template_pattern');
    if (!hasPatternTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_template_pattern',
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
              length: '150',
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
              name: 'IDX_production_template_pattern_template_id',
              columnNames: ['template_id'],
            }),
            new TableIndex({
              name: 'IDX_production_template_pattern_deleted_at',
              columnNames: ['deleted_at'],
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_production_template_pattern_template',
              columnNames: ['template_id'],
              referencedTableName: 'production_template',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
          ],
        }),
        true
      );
    }

    // 2. Create table production_template_pattern_option if not exists
    const hasOptionTable = await queryRunner.hasTable('production_template_pattern_option');
    if (!hasOptionTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_template_pattern_option',
          columns: [
            {
              name: 'id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'pattern_id',
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
              name: 'IDX_production_template_pattern_option_pattern_id',
              columnNames: ['pattern_id'],
            }),
            new TableIndex({
              name: 'IDX_production_template_pattern_option_sort_order',
              columnNames: ['sort_order'],
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_production_template_pattern_option_pattern',
              columnNames: ['pattern_id'],
              referencedTableName: 'production_template_pattern',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
          ],
        }),
        true
      );

      try {
        await queryRunner.query(
          `ALTER TABLE production_template_pattern_option 
           ADD CONSTRAINT CHK_production_pattern_option_sort_order 
           CHECK (sort_order >= 1)`
        );
      } catch {
        // Safe fallback if CHECK constraint is not supported by DB engine
      }
    }

    // 3. Create table production_template_pattern_option_task if not exists
    const hasTaskTable = await queryRunner.hasTable('production_template_pattern_option_task');
    if (!hasTaskTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_template_pattern_option_task',
          columns: [
            {
              name: 'id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'option_id',
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
          indices: [
            new TableIndex({
              name: 'IDX_production_template_option_task_option_id',
              columnNames: ['option_id'],
            }),
            new TableIndex({
              name: 'IDX_production_template_option_task_department_id',
              columnNames: ['department_id'],
            }),
            new TableIndex({
              name: 'IDX_production_template_option_task_sort_order',
              columnNames: ['sort_order'],
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_production_template_option_task_option',
              columnNames: ['option_id'],
              referencedTableName: 'production_template_pattern_option',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
            new TableForeignKey({
              name: 'FK_production_template_option_task_department',
              columnNames: ['department_id'],
              referencedTableName: 'production_department',
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE',
            }),
          ],
        }),
        true
      );

      try {
        await queryRunner.query(
          `ALTER TABLE production_template_pattern_option_task 
           ADD CONSTRAINT CHK_production_option_task_sort_order 
           CHECK (sort_order >= 1)`
        );
        await queryRunner.query(
          `ALTER TABLE production_template_pattern_option_task 
           ADD CONSTRAINT CHK_production_option_task_duration 
           CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes >= 0)`
        );
        await queryRunner.query(
          `ALTER TABLE production_template_pattern_option_task 
           ADD CONSTRAINT CHK_production_option_task_cost 
           CHECK (estimated_cost IS NULL OR estimated_cost >= 0)`
        );
      } catch {
        // Fallback for DB engines without check constraints
      }
    }

    // 4. Create table production_template_pattern_option_task_material if not exists
    const hasTaskMatTable = await queryRunner.hasTable('production_template_pattern_option_task_material');
    if (!hasTaskMatTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_template_pattern_option_task_material',
          columns: [
            {
              name: 'id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'task_id',
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
              scale: 4,
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
              name: 'IDX_production_pattern_task_mat_task_id',
              columnNames: ['task_id'],
            }),
            new TableIndex({
              name: 'IDX_production_pattern_task_mat_product_id',
              columnNames: ['product_id'],
            }),
            new TableIndex({
              name: 'UQ_production_pattern_task_material_task_unit',
              columnNames: ['task_id', 'product_unit_id'],
              isUnique: true,
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_production_pattern_task_mat_task',
              columnNames: ['task_id'],
              referencedTableName: 'production_template_pattern_option_task',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
            new TableForeignKey({
              name: 'FK_production_pattern_task_mat_product',
              columnNames: ['product_id'],
              referencedTableName: 'inventory_product',
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE',
            }),
            new TableForeignKey({
              name: 'FK_production_pattern_task_mat_unit',
              columnNames: ['product_unit_id'],
              referencedTableName: 'inventory_product_unit',
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE',
            }),
          ],
        }),
        true
      );

      try {
        await queryRunner.query(
          `ALTER TABLE production_template_pattern_option_task_material 
           ADD CONSTRAINT CHK_production_pattern_task_mat_qty 
           CHECK (planned_quantity > 0)`
        );
      } catch {
        // Fallback for DB engines without check constraints
      }
    }

    // 5. Create table production_template_pattern_option_task_attachment if not exists
    const hasTaskAttTable = await queryRunner.hasTable('production_template_pattern_option_task_attachment');
    if (!hasTaskAttTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_template_pattern_option_task_attachment',
          columns: [
            {
              name: 'id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'task_id',
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
              name: 'IDX_production_pattern_task_attachment_task_id',
              columnNames: ['task_id'],
            }),
            new TableIndex({
              name: 'IDX_production_pattern_task_attachment_sort_order',
              columnNames: ['sort_order'],
            }),
            new TableIndex({
              name: 'IDX_production_pattern_task_attachment_deleted_at',
              columnNames: ['deleted_at'],
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_production_pattern_task_attachment_task',
              columnNames: ['task_id'],
              referencedTableName: 'production_template_pattern_option_task',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
            new TableForeignKey({
              name: 'FK_production_pattern_task_attachment_user',
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

      try {
        await queryRunner.query(
          `ALTER TABLE production_template_pattern_option_task_attachment 
           ADD CONSTRAINT CHK_production_pattern_task_att_sort_order 
           CHECK (sort_order >= 1)`
        );
        await queryRunner.query(
          `ALTER TABLE production_template_pattern_option_task_attachment 
           ADD CONSTRAINT CHK_production_pattern_task_att_size 
           CHECK (size_bytes > 0)`
        );
      } catch {
        // Fallback for DB engines without check constraints
      }
    }

    // 6. Create table production_template_workflow_item if not exists
    const hasWorkflowTable = await queryRunner.hasTable('production_template_workflow_item');
    if (!hasWorkflowTable) {
      await queryRunner.createTable(
        new Table({
          name: 'production_template_workflow_item',
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
              name: 'item_type',
              type: 'varchar',
              length: '20',
              isNullable: false,
            },
            {
              name: 'stage_id',
              type: 'varchar',
              length: '36',
              isNullable: true,
              isUnique: true,
            },
            {
              name: 'pattern_id',
              type: 'varchar',
              length: '36',
              isNullable: true,
              isUnique: true,
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
              name: 'IDX_production_template_workflow_item_template_id',
              columnNames: ['template_id'],
            }),
            new TableIndex({
              name: 'IDX_production_template_workflow_item_sort_order',
              columnNames: ['sort_order'],
            }),
            new TableIndex({
              name: 'IDX_production_template_workflow_item_deleted_at',
              columnNames: ['deleted_at'],
            }),
          ],
          foreignKeys: [
            new TableForeignKey({
              name: 'FK_production_template_workflow_item_template',
              columnNames: ['template_id'],
              referencedTableName: 'production_template',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
            new TableForeignKey({
              name: 'FK_production_template_workflow_item_stage',
              columnNames: ['stage_id'],
              referencedTableName: 'production_template_stage',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
            new TableForeignKey({
              name: 'FK_production_template_workflow_item_pattern',
              columnNames: ['pattern_id'],
              referencedTableName: 'production_template_pattern',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            }),
          ],
        }),
        true
      );

      try {
        await queryRunner.query(
          `ALTER TABLE production_template_workflow_item 
           ADD CONSTRAINT CHK_production_workflow_item_type 
           CHECK (item_type IN ('STAGE', 'PATTERN'))`
        );
        await queryRunner.query(
          `ALTER TABLE production_template_workflow_item 
           ADD CONSTRAINT CHK_production_workflow_item_sort_order 
           CHECK (sort_order >= 1)`
        );
        await queryRunner.query(
          `ALTER TABLE production_template_workflow_item 
           ADD CONSTRAINT CHK_production_workflow_item_polymorphic 
           CHECK (
             (item_type = 'STAGE' AND stage_id IS NOT NULL AND pattern_id IS NULL)
             OR
             (item_type = 'PATTERN' AND pattern_id IS NOT NULL AND stage_id IS NULL)
           )`
        );
      } catch {
        // Fallback for DB engines without check constraints
      }
    }

    // 7. Backfill existing stages from production_template_stage into production_template_workflow_item
    const stageTable = await queryRunner.getTable('production_template_stage');
    const hasStageSortOrderColumn = stageTable ? stageTable.columns.some((c) => c.name === 'sort_order') : false;

    if (hasStageSortOrderColumn) {
      const existingStages: Array<{
        id: string;
        template_id: string;
        sort_order: number;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }> = await queryRunner.query(
        `SELECT id, template_id, sort_order, created_at, updated_at, deleted_at 
         FROM production_template_stage`
      );

      for (const stage of existingStages) {
        // Verify not already backfilled
        const existingItem: any[] = await queryRunner.query(
          `SELECT id FROM production_template_workflow_item WHERE stage_id = ?`,
          [stage.id]
        );
        if (existingItem.length === 0) {
          const workflowItemId = crypto.randomUUID();
          await queryRunner.query(
            `INSERT INTO production_template_workflow_item 
             (id, template_id, item_type, stage_id, pattern_id, sort_order, created_at, updated_at, deleted_at)
             VALUES (?, ?, 'STAGE', ?, NULL, ?, ?, ?, ?)`,
            [
              workflowItemId,
              stage.template_id,
              stage.id,
              stage.sort_order,
              stage.created_at,
              stage.updated_at,
              stage.deleted_at,
            ]
          );
        }
      }

      // Step 7 Verification 1: Row count must strictly match
      const stageCountRes: any[] = await queryRunner.query(
        `SELECT COUNT(*) as cnt FROM production_template_stage`
      );
      const workflowStageCountRes: any[] = await queryRunner.query(
        `SELECT COUNT(*) as cnt FROM production_template_workflow_item WHERE item_type = 'STAGE'`
      );
      const stageCount = parseInt(stageCountRes[0]?.cnt || '0', 10);
      const workflowStageCount = parseInt(workflowStageCountRes[0]?.cnt || '0', 10);

      if (stageCount !== workflowStageCount) {
        throw new Error(
          `Migration 0011 Verification Failed: production_template_stage count (${stageCount}) does not match production_template_workflow_item count (${workflowStageCount})`
        );
      }

      // Step 7 Verification 2: Sort order per template must match 100%
      const mismatchCheck: any[] = await queryRunner.query(
        `SELECT s.id, s.sort_order as stage_sort, w.sort_order as wf_sort 
         FROM production_template_stage s
         JOIN production_template_workflow_item w ON w.stage_id = s.id
         WHERE s.sort_order != w.sort_order`
      );

      if (mismatchCheck.length > 0) {
        throw new Error(
          `Migration 0011 Verification Failed: Mismatch in sort_order between stage and workflow items: ${JSON.stringify(mismatchCheck)}`
        );
      }

      // Step 7 Verification passed! Safely drop sort_order from production_template_stage
      const existingStats: Array<{ index_name: string }> = await queryRunner.query(
        `SELECT DISTINCT index_name 
         FROM information_schema.statistics 
         WHERE table_schema = DATABASE() AND table_name = 'production_template_stage'`
      );
      const indexNames = new Set(existingStats.map((r) => r.index_name));
      if (indexNames.has('IDX_production_template_stage_sort_order')) {
        await queryRunner.dropIndex('production_template_stage', 'IDX_production_template_stage_sort_order');
      }

      await queryRunner.dropColumn('production_template_stage', 'sort_order');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Safety check: Fail closed if production_template_pattern contains data
    const hasPatternTable = await queryRunner.hasTable('production_template_pattern');
    if (hasPatternTable) {
      const patternCountRes: any[] = await queryRunner.query(
        `SELECT COUNT(*) as cnt FROM production_template_pattern`
      );
      const patternCount = parseInt(patternCountRes[0]?.cnt || '0', 10);
      if (patternCount > 0) {
        throw new Error(
          `Cannot rollback migration 0011: production_template_pattern table contains ${patternCount} pattern records. Manual migration required to avoid data loss.`
        );
      }
    }

    // 2. Re-add sort_order column to production_template_stage if missing
    const stageTable = await queryRunner.getTable('production_template_stage');
    const hasStageSortOrderColumn = stageTable ? stageTable.columns.some((c) => c.name === 'sort_order') : false;

    if (!hasStageSortOrderColumn && stageTable) {
      await queryRunner.query(
        `ALTER TABLE production_template_stage ADD COLUMN sort_order INT NOT NULL DEFAULT 1`
      );

      // Copy sort_order back from production_template_workflow_item
      const hasWorkflowTable = await queryRunner.hasTable('production_template_workflow_item');
      if (hasWorkflowTable) {
        await queryRunner.query(
          `UPDATE production_template_stage s
           JOIN production_template_workflow_item w ON w.stage_id = s.id
           SET s.sort_order = w.sort_order`
        );
      }

      await queryRunner.createIndex(
        'production_template_stage',
        new TableIndex({
          name: 'IDX_production_template_stage_sort_order',
          columnNames: ['sort_order'],
        })
      );
    }

    // 3. Drop tables in reverse order
    const tablesToDrop = [
      'production_template_workflow_item',
      'production_template_pattern_option_task_attachment',
      'production_template_pattern_option_task_material',
      'production_template_pattern_option_task',
      'production_template_pattern_option',
      'production_template_pattern',
    ];

    for (const tableName of tablesToDrop) {
      if (await queryRunner.hasTable(tableName)) {
        await queryRunner.dropTable(tableName, true);
      }
    }
  }
}
