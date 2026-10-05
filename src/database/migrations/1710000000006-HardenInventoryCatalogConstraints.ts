import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenInventoryCatalogConstraints1710000000006 implements MigrationInterface {
  name = 'HardenInventoryCatalogConstraints1710000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Helper to verify constraint existence before altering
    const checkConstraintExists = async (tableName: string, constraintName: string): Promise<boolean> => {
      const rows = await queryRunner.query(
        `SELECT COUNT(1) as cnt FROM information_schema.TABLE_CONSTRAINTS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = ? 
           AND CONSTRAINT_NAME = ?`,
        [tableName, constraintName]
      );
      return parseInt(rows[0]?.cnt || '0', 10) > 0;
    };

    // 1. CHK_inventory_category_parent_not_self
    const hasCategoryParentCheck = await checkConstraintExists(
      'inventory_category',
      'CHK_inventory_category_parent_not_self'
    );
    if (!hasCategoryParentCheck) {
      await queryRunner.query(
        'ALTER TABLE `inventory_category` ADD CONSTRAINT `CHK_inventory_category_parent_not_self` CHECK (`parent_id` IS NULL OR `parent_id` <> `id`)'
      );
    }

    // 2. CHK_inventory_product_unit_price
    const hasUnitPriceCheck = await checkConstraintExists(
      'inventory_product_unit',
      'CHK_inventory_product_unit_price'
    );
    if (!hasUnitPriceCheck) {
      await queryRunner.query(
        'ALTER TABLE `inventory_product_unit` ADD CONSTRAINT `CHK_inventory_product_unit_price` CHECK (`price` >= 0)'
      );
    }

    // 3. CHK_inventory_product_unit_conversion_quantity
    const hasUnitConversionCheck = await checkConstraintExists(
      'inventory_product_unit',
      'CHK_inventory_product_unit_conversion_quantity'
    );
    if (!hasUnitConversionCheck) {
      await queryRunner.query(
        'ALTER TABLE `inventory_product_unit` ADD CONSTRAINT `CHK_inventory_product_unit_conversion_quantity` CHECK (`conversion_quantity` IS NULL OR `conversion_quantity` > 0)'
      );
    }

    // 4. CHK_inventory_product_unit_equivalent_not_self
    const hasUnitEquivalentCheck = await checkConstraintExists(
      'inventory_product_unit',
      'CHK_inventory_product_unit_equivalent_not_self'
    );
    if (!hasUnitEquivalentCheck) {
      await queryRunner.query(
        'ALTER TABLE `inventory_product_unit` ADD CONSTRAINT `CHK_inventory_product_unit_equivalent_not_self` CHECK (`equivalent_to_unit_id` IS NULL OR `equivalent_to_unit_id` <> `id`)'
      );
    }
  }

  /**
   * The reconciliation migration does not remove canonical constraints on down,
   * because they belong to the canonical schema defined by migrations 0004/0005.
   */
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op by design. Canonical constraints are owned by migrations 0004/0005.
  }
}
