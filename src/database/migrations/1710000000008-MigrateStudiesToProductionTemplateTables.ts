import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class MigrateStudiesToProductionTemplateTables1710000000008 implements MigrationInterface {
  name = 'MigrateStudiesToProductionTemplateTables1710000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasStudiesTemplate = await queryRunner.hasTable('studies_template');
    const hasProductionTemplate = await queryRunner.hasTable('production_template');

    if (hasStudiesTemplate && !hasProductionTemplate) {
      // 1. Drop existing Foreign Keys referencing or belonging to old studies_* tables
      // Safe helper to drop foreign key if it exists
      const dropFkIfExists = async (table: string, fkName: string) => {
        try {
          await queryRunner.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fkName}\``);
        } catch {
          // ignore if already dropped
        }
      };

      await dropFkIfExists('studies_template_stage_material', 'FK_studies_stage_material_stage');
      await dropFkIfExists('studies_template_stage_material', 'FK_studies_stage_material_product');
      await dropFkIfExists('studies_template_stage_material', 'FK_studies_stage_material_unit');

      await dropFkIfExists('studies_template_stage', 'FK_studies_template_stage_template');
      await dropFkIfExists('studies_template_stage', 'FK_studies_template_stage_department');

      await dropFkIfExists('studies_template_specification', 'FK_studies_template_spec_template');

      // 2. Rename tables to production_*
      await queryRunner.query('RENAME TABLE `studies_template` TO `production_template`');
      await queryRunner.query('RENAME TABLE `studies_template_specification` TO `production_template_specification`');
      await queryRunner.query('RENAME TABLE `studies_template_stage` TO `production_template_stage`');
      await queryRunner.query('RENAME TABLE `studies_template_stage_material` TO `production_template_stage_material`');

      // 3. Re-create foreign keys with production_* names and targets
      await queryRunner.createForeignKey(
        'production_template_specification',
        new TableForeignKey({
          name: 'FK_production_template_spec_template',
          columnNames: ['template_id'],
          referencedTableName: 'production_template',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        })
      );

      await queryRunner.createForeignKey(
        'production_template_stage',
        new TableForeignKey({
          name: 'FK_production_template_stage_template',
          columnNames: ['template_id'],
          referencedTableName: 'production_template',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        })
      );

      await queryRunner.createForeignKey(
        'production_template_stage',
        new TableForeignKey({
          name: 'FK_production_template_stage_department',
          columnNames: ['department_id'],
          referencedTableName: 'production_department',
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        })
      );

      await queryRunner.createForeignKey(
        'production_template_stage_material',
        new TableForeignKey({
          name: 'FK_production_stage_material_stage',
          columnNames: ['stage_id'],
          referencedTableName: 'production_template_stage',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        })
      );

      await queryRunner.createForeignKey(
        'production_template_stage_material',
        new TableForeignKey({
          name: 'FK_production_stage_material_product',
          columnNames: ['product_id'],
          referencedTableName: 'inventory_product',
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        })
      );

      await queryRunner.createForeignKey(
        'production_template_stage_material',
        new TableForeignKey({
          name: 'FK_production_stage_material_unit',
          columnNames: ['product_unit_id'],
          referencedTableName: 'inventory_product_unit',
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        })
      );
    }

    // 4. Add Database CHECK constraints
    const addCheckConstraint = async (table: string, constraintName: string, checkExpr: string) => {
      try {
        await queryRunner.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraintName}\` CHECK (${checkExpr})`);
      } catch {
        // ignore if already exists
      }
    };

    await addCheckConstraint('production_template_stage', 'CHK_prod_stage_sort_order', '`sort_order` >= 1');
    await addCheckConstraint(
      'production_template_stage',
      'CHK_prod_stage_duration',
      '`estimated_duration_minutes` IS NULL OR `estimated_duration_minutes` >= 0'
    );
    await addCheckConstraint(
      'production_template_stage',
      'CHK_prod_stage_cost',
      '`estimated_cost` IS NULL OR `estimated_cost` >= 0'
    );
    await addCheckConstraint(
      'production_template_stage_material',
      'CHK_prod_stage_mat_quantity',
      '`planned_quantity` > 0'
    );
    await addCheckConstraint(
      'production_template_specification',
      'CHK_prod_spec_sort_order',
      '`sort_order` >= 1'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasProductionTemplate = await queryRunner.hasTable('production_template');
    if (hasProductionTemplate) {
      // Drop check constraints
      const dropCheck = async (table: string, constraintName: string) => {
        try {
          await queryRunner.query(`ALTER TABLE \`${table}\` DROP CHECK \`${constraintName}\``);
        } catch {
          // ignore
        }
      };

      await dropCheck('production_template_specification', 'CHK_prod_spec_sort_order');
      await dropCheck('production_template_stage_material', 'CHK_prod_stage_mat_quantity');
      await dropCheck('production_template_stage', 'CHK_prod_stage_cost');
      await dropCheck('production_template_stage', 'CHK_prod_stage_duration');
      await dropCheck('production_template_stage', 'CHK_prod_stage_sort_order');

      // Drop production FKs
      const dropFk = async (table: string, fkName: string) => {
        try {
          await queryRunner.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fkName}\``);
        } catch {
          // ignore
        }
      };

      await dropFk('production_template_stage_material', 'FK_production_stage_material_stage');
      await dropFk('production_template_stage_material', 'FK_production_stage_material_product');
      await dropFk('production_template_stage_material', 'FK_production_stage_material_unit');

      await dropFk('production_template_stage', 'FK_production_template_stage_template');
      await dropFk('production_template_stage', 'FK_production_template_stage_department');

      await dropFk('production_template_specification', 'FK_production_template_spec_template');

      // Rename back
      await queryRunner.query('RENAME TABLE `production_template_stage_material` TO `studies_template_stage_material`');
      await queryRunner.query('RENAME TABLE `production_template_stage` TO `studies_template_stage`');
      await queryRunner.query('RENAME TABLE `production_template_specification` TO `studies_template_specification`');
      await queryRunner.query('RENAME TABLE `production_template` TO `studies_template`');

      // Re-create studies FKs
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
  }
}
