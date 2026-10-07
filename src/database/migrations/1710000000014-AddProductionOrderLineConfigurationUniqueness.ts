import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';
import { hashLineConfiguration } from '../../modules/production/order-line/production-order-line-configuration.helper.js';

export class AddProductionOrderLineConfigurationUniqueness1710000000014
  implements MigrationInterface
{
  name = 'AddProductionOrderLineConfigurationUniqueness1710000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add active_configuration_hash column (nullable)
    const table = await queryRunner.getTable('production_order_line');
    const hasColumn = table?.findColumnByName('active_configuration_hash');
    if (!hasColumn) {
      await queryRunner.addColumn(
        'production_order_line',
        new TableColumn({
          name: 'active_configuration_hash',
          type: 'char',
          length: '64',
          isNullable: true,
          default: null,
        })
      );
    }

    // 2. Backfill existing active lines with canonical hash
    const activeLines: Array<{ id: string; order_id: string; template_id: string }> =
      await queryRunner.query(
        `SELECT id, order_id, template_id FROM production_order_line WHERE deleted_at IS NULL ORDER BY order_id, sort_order ASC`
      );

    if (activeLines.length > 0) {
      const lineIds = activeLines.map((l) => `'${l.id}'`).join(',');
      const selections: Array<{
        order_line_id: string;
        template_pattern_id: string;
        selected_option_id: string;
      }> = await queryRunner.query(
        `SELECT order_line_id, template_pattern_id, selected_option_id FROM production_order_line_pattern_selection WHERE order_line_id IN (${lineIds})`
      );

      const selectionsByLineId = new Map<
        string,
        Array<{ templatePatternId: string; selectedOptionId: string }>
      >();
      for (const sel of selections) {
        const list = selectionsByLineId.get(sel.order_line_id) || [];
        list.push({
          templatePatternId: sel.template_pattern_id,
          selectedOptionId: sel.selected_option_id,
        });
        selectionsByLineId.set(sel.order_line_id, list);
      }

      // Check for pre-existing duplicates per order
      const seenHashesByOrder = new Map<string, Map<string, string[]>>();
      const lineHashes = new Map<string, string>();

      for (const line of activeLines) {
        const lineSelections = selectionsByLineId.get(line.id) || [];
        const hash = hashLineConfiguration(line.template_id, lineSelections);
        lineHashes.set(line.id, hash);

        if (!seenHashesByOrder.has(line.order_id)) {
          seenHashesByOrder.set(line.order_id, new Map());
        }
        const orderHashes = seenHashesByOrder.get(line.order_id)!;
        const existing = orderHashes.get(hash) || [];
        existing.push(line.id);
        orderHashes.set(hash, existing);
      }

      const duplicateErrors: string[] = [];
      for (const [orderId, orderHashes] of seenHashesByOrder.entries()) {
        for (const [hash, lines] of orderHashes.entries()) {
          if (lines.length > 1) {
            duplicateErrors.push(
              `orderId: ${orderId}, hash: ${hash}, duplicate lineIds: [${lines.join(', ')}]`
            );
          }
        }
      }

      if (duplicateErrors.length > 0) {
        throw new Error(
          `Migration 1710000000014 failed: Pre-existing duplicate line configurations detected in database:\n` +
            duplicateErrors.join('\n')
        );
      }

      // Update active lines with computed hash
      for (const [lineId, hash] of lineHashes.entries()) {
        await queryRunner.query(
          `UPDATE production_order_line SET active_configuration_hash = ? WHERE id = ?`,
          [hash, lineId]
        );
      }
    }

    // 3. Create unique index on (order_id, active_configuration_hash)
    const refreshedTable = await queryRunner.getTable('production_order_line');
    const hasIndex = refreshedTable?.indices.find(
      (idx) => idx.name === 'UQ_prod_order_line_order_config_hash'
    );
    if (!hasIndex) {
      await queryRunner.createIndex(
        'production_order_line',
        new TableIndex({
          name: 'UQ_prod_order_line_order_config_hash',
          columnNames: ['order_id', 'active_configuration_hash'],
          isUnique: true,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('production_order_line');
    const hasIndex = table?.indices.find(
      (idx) => idx.name === 'UQ_prod_order_line_order_config_hash'
    );
    if (hasIndex) {
      await queryRunner.dropIndex('production_order_line', hasIndex);
    }

    const hasColumn = table?.findColumnByName('active_configuration_hash');
    if (hasColumn) {
      await queryRunner.dropColumn(
        'production_order_line',
        'active_configuration_hash'
      );
    }
  }
}
