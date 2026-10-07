import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

interface IndexMigrationDef {
  tableName: string;
  oldIndexName: string;
  newIndexName: string;
  columnNames: string[];
  isUnique: boolean;
}

export class FinalizeProductionTemplateHardening1710000000010 implements MigrationInterface {
  name = 'FinalizeProductionTemplateHardening1710000000010';

  private readonly indexDefinitions: IndexMigrationDef[] = [
    // 1. production_template
    {
      tableName: 'production_template',
      oldIndexName: 'UQ_studies_template_code',
      newIndexName: 'UQ_production_template_code',
      columnNames: ['code'],
      isUnique: true,
    },
    {
      tableName: 'production_template',
      oldIndexName: 'IDX_studies_template_is_active',
      newIndexName: 'IDX_production_template_is_active',
      columnNames: ['is_active'],
      isUnique: false,
    },
    {
      tableName: 'production_template',
      oldIndexName: 'IDX_studies_template_deleted_at',
      newIndexName: 'IDX_production_template_deleted_at',
      columnNames: ['deleted_at'],
      isUnique: false,
    },

    // 2. production_template_specification
    {
      tableName: 'production_template_specification',
      oldIndexName: 'IDX_studies_template_spec_template_id',
      newIndexName: 'IDX_production_template_spec_template_id',
      columnNames: ['template_id'],
      isUnique: false,
    },

    // 3. production_template_stage
    {
      tableName: 'production_template_stage',
      oldIndexName: 'IDX_studies_template_stage_template_id',
      newIndexName: 'IDX_production_template_stage_template_id',
      columnNames: ['template_id'],
      isUnique: false,
    },
    {
      tableName: 'production_template_stage',
      oldIndexName: 'IDX_studies_template_stage_department_id',
      newIndexName: 'IDX_production_template_stage_department_id',
      columnNames: ['department_id'],
      isUnique: false,
    },
    {
      tableName: 'production_template_stage',
      oldIndexName: 'IDX_studies_template_stage_sort_order',
      newIndexName: 'IDX_production_template_stage_sort_order',
      columnNames: ['sort_order'],
      isUnique: false,
    },
    {
      tableName: 'production_template_stage',
      oldIndexName: 'IDX_studies_template_stage_deleted_at',
      newIndexName: 'IDX_production_template_stage_deleted_at',
      columnNames: ['deleted_at'],
      isUnique: false,
    },

    // 4. production_template_stage_material
    {
      tableName: 'production_template_stage_material',
      oldIndexName: 'IDX_studies_stage_mat_stage_id',
      newIndexName: 'IDX_production_stage_mat_stage_id',
      columnNames: ['stage_id'],
      isUnique: false,
    },
    {
      tableName: 'production_template_stage_material',
      oldIndexName: 'IDX_studies_stage_mat_product_id',
      newIndexName: 'IDX_production_stage_mat_product_id',
      columnNames: ['product_id'],
      isUnique: false,
    },
    {
      tableName: 'production_template_stage_material',
      oldIndexName: 'IDX_studies_stage_mat_unit_id',
      newIndexName: 'IDX_production_stage_mat_unit_id',
      columnNames: ['product_unit_id'],
      isUnique: false,
    },
    {
      tableName: 'production_template_stage_material',
      oldIndexName: 'UQ_studies_stage_material_stage_unit',
      newIndexName: 'UQ_production_stage_material_stage_unit',
      columnNames: ['stage_id', 'product_unit_id'],
      isUnique: true,
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const def of this.indexDefinitions) {
      const tableExists = await queryRunner.hasTable(def.tableName);
      if (!tableExists) continue;

      const existingStats: Array<{ index_name: string }> = await queryRunner.query(
        `SELECT DISTINCT index_name 
         FROM information_schema.statistics 
         WHERE table_schema = DATABASE() AND table_name = ?`,
        [def.tableName]
      );
      const indexNames = new Set(existingStats.map((r) => r.index_name));

      // If old index exists, create new index if not already present, then drop old index
      if (indexNames.has(def.oldIndexName)) {
        if (!indexNames.has(def.newIndexName)) {
          await queryRunner.createIndex(
            def.tableName,
            new TableIndex({
              name: def.newIndexName,
              columnNames: def.columnNames,
              isUnique: def.isUnique,
            })
          );
        }
        await queryRunner.dropIndex(def.tableName, def.oldIndexName);
      }
    }

    // Verify no legacy studies indexes remain on any of the 5 production template tables
    const remainingStudiesIndexes: Array<{ table_name: string; index_name: string }> = await queryRunner.query(
      `SELECT table_name, index_name 
       FROM information_schema.statistics 
       WHERE table_schema = DATABASE() 
         AND table_name IN (
           'production_template',
           'production_template_specification',
           'production_template_stage',
           'production_template_stage_material',
           'production_template_stage_attachment'
         )
         AND (index_name LIKE 'studies_%' OR index_name LIKE '%studies%')`
    );

    if (remainingStudiesIndexes.length > 0) {
      throw new Error(
        `Legacy studies indexes remain after migration 0010: ${JSON.stringify(remainingStudiesIndexes)}`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const def of this.indexDefinitions) {
      const tableExists = await queryRunner.hasTable(def.tableName);
      if (!tableExists) continue;

      const existingStats: Array<{ index_name: string }> = await queryRunner.query(
        `SELECT DISTINCT index_name 
         FROM information_schema.statistics 
         WHERE table_schema = DATABASE() AND table_name = ?`,
        [def.tableName]
      );
      const indexNames = new Set(existingStats.map((r) => r.index_name));

      if (indexNames.has(def.newIndexName)) {
        if (!indexNames.has(def.oldIndexName)) {
          await queryRunner.createIndex(
            def.tableName,
            new TableIndex({
              name: def.oldIndexName,
              columnNames: def.columnNames,
              isUnique: def.isUnique,
            })
          );
        }
        await queryRunner.dropIndex(def.tableName, def.newIndexName);
      }
    }
  }
}
