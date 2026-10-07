import { MigrationInterface, QueryRunner } from 'typeorm';

interface RequiredCheckConstraint {
  name: string;
  tableName: string;
  expression: string;
}

const REQUIRED_CHECK_CONSTRAINTS: RequiredCheckConstraint[] = [
  {
    name: 'CHK_production_pattern_option_sort_order',
    tableName: 'production_template_pattern_option',
    expression: 'sort_order >= 1',
  },
  {
    name: 'CHK_production_option_task_sort_order',
    tableName: 'production_template_pattern_option_task',
    expression: 'sort_order >= 1',
  },
  {
    name: 'CHK_production_option_task_duration',
    tableName: 'production_template_pattern_option_task',
    expression: 'estimated_duration_minutes IS NULL OR estimated_duration_minutes >= 0',
  },
  {
    name: 'CHK_production_option_task_cost',
    tableName: 'production_template_pattern_option_task',
    expression: 'estimated_cost IS NULL OR estimated_cost >= 0',
  },
  {
    name: 'CHK_production_pattern_task_mat_qty',
    tableName: 'production_template_pattern_option_task_material',
    expression: 'planned_quantity > 0',
  },
  {
    name: 'CHK_production_pattern_task_att_sort_order',
    tableName: 'production_template_pattern_option_task_attachment',
    expression: 'sort_order >= 1',
  },
  {
    name: 'CHK_production_pattern_task_att_size',
    tableName: 'production_template_pattern_option_task_attachment',
    expression: 'size_bytes > 0',
  },
  {
    name: 'CHK_production_workflow_item_type',
    tableName: 'production_template_workflow_item',
    expression: "item_type IN ('STAGE', 'PATTERN')",
  },
  {
    name: 'CHK_production_workflow_item_sort_order',
    tableName: 'production_template_workflow_item',
    expression: 'sort_order >= 1',
  },
  {
    name: 'CHK_production_workflow_item_polymorphic',
    tableName: 'production_template_workflow_item',
    expression:
      "((item_type = 'STAGE' AND stage_id IS NOT NULL AND pattern_id IS NULL) OR (item_type = 'PATTERN' AND pattern_id IS NOT NULL AND stage_id IS NULL))",
  },
];

export class HardenProductionTemplateMixedWorkflow1710000000012 implements MigrationInterface {
  name = 'HardenProductionTemplateMixedWorkflow1710000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -------------------------------------------------------------
    // 1. DECIMAL PRECISION UPGRADE ON TASK MATERIAL PLANNED QUANTITY
    // -------------------------------------------------------------
    const hasTaskMatTable = await queryRunner.hasTable('production_template_pattern_option_task_material');
    if (hasTaskMatTable) {
      // Preflight check: Ensure existing values fit within 12 integer digits for DECIMAL(18,6)
      const invalidRows: Array<{ cnt: string | number }> = await queryRunner.query(
        `SELECT COUNT(*) as cnt 
         FROM production_template_pattern_option_task_material 
         WHERE ABS(planned_quantity) >= 1000000000000`
      );
      const invalidCount = Number(invalidRows[0]?.cnt ?? 0);
      if (invalidCount > 0) {
        throw new Error(
          `Migration 0012 failed: Cannot upgrade planned_quantity to DECIMAL(18,6) because ${invalidCount} existing record(s) exceed 12 integer digits`
        );
      }

      await queryRunner.query(
        `ALTER TABLE production_template_pattern_option_task_material 
         MODIFY COLUMN planned_quantity DECIMAL(18,6) NOT NULL`
      );
    }

    // -------------------------------------------------------------
    // 2. VERIFY AND CREATE REQUIRED CHECK CONSTRAINTS (NO SILENT CATCH)
    // -------------------------------------------------------------
    const existingConstraints: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(
      `SELECT CONSTRAINT_NAME 
       FROM information_schema.TABLE_CONSTRAINTS 
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'`
    );
    const existingNames = new Set(
      existingConstraints.map((c) => c.CONSTRAINT_NAME.toUpperCase())
    );

    for (const req of REQUIRED_CHECK_CONSTRAINTS) {
      const tableExists = await queryRunner.hasTable(req.tableName);
      if (!tableExists) {
        throw new Error(
          `Migration 0012 failed: Target table '${req.tableName}' does not exist for constraint '${req.name}'`
        );
      }

      if (!existingNames.has(req.name.toUpperCase())) {
        // Create constraint explicitly. If it fails, let it throw immediately (no silent fallback).
        await queryRunner.query(
          `ALTER TABLE ${req.tableName} ADD CONSTRAINT ${req.name} CHECK (${req.expression})`
        );
      }
    }

    // -------------------------------------------------------------
    // 3. FINAL VERIFICATION: ALL 10 CHECK CONSTRAINTS MUST EXIST
    // -------------------------------------------------------------
    const verifiedConstraints: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(
      `SELECT CONSTRAINT_NAME 
       FROM information_schema.TABLE_CONSTRAINTS 
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'`
    );
    const verifiedNames = new Set(
      verifiedConstraints.map((c) => c.CONSTRAINT_NAME.toUpperCase())
    );

    const missingConstraints = REQUIRED_CHECK_CONSTRAINTS.filter(
      (req) => !verifiedNames.has(req.name.toUpperCase())
    );

    if (missingConstraints.length > 0) {
      const missingList = missingConstraints.map((m) => m.name).join(', ');
      throw new Error(
        `Migration 0012 verification failed: Required CHECK constraint(s) missing from information_schema: ${missingList}`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTaskMatTable = await queryRunner.hasTable('production_template_pattern_option_task_material');
    if (hasTaskMatTable) {
      // Preflight check: Prevent precision loss if values have > 4 decimal places
      const precisionLossRows: Array<{ cnt: string | number }> = await queryRunner.query(
        `SELECT COUNT(*) as cnt 
         FROM production_template_pattern_option_task_material 
         WHERE ROUND(planned_quantity, 4) != planned_quantity`
      );
      const lossCount = Number(precisionLossRows[0]?.cnt ?? 0);
      if (lossCount > 0) {
        throw new Error(
          `Migration 0012 down rollback rejected: rollback would lose planned quantity precision for ${lossCount} record(s)`
        );
      }

      await queryRunner.query(
        `ALTER TABLE production_template_pattern_option_task_material 
         MODIFY COLUMN planned_quantity DECIMAL(18,4) NOT NULL`
      );
    }

    // Retain valid CHECK constraints on down to prevent schema weakening.
  }
}
