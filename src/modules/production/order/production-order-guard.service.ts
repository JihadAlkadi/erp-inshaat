import { DataSource, EntityManager, Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionOrderEntity, ProductionOrderStatus } from './production-order.entity.js';
import { ProductionOrderLineEntity } from '../order-line/production-order-line.entity.js';
import { ProductionOrderLinePatternSelectionEntity } from '../order-line-pattern-selection/production-order-line-pattern-selection.entity.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class ProductionOrderGuardService {
  private orderRepo: Repository<ProductionOrderEntity>;
  private lineRepo: Repository<ProductionOrderLineEntity>;
  private selectionRepo: Repository<ProductionOrderLinePatternSelectionEntity>;

  constructor(private dataSource: DataSource = AppDataSource) {
    this.orderRepo = this.dataSource.getRepository(ProductionOrderEntity);
    this.lineRepo = this.dataSource.getRepository(ProductionOrderLineEntity);
    this.selectionRepo = this.dataSource.getRepository(ProductionOrderLinePatternSelectionEntity);
  }

  /**
   * Guards read access: ensures order exists and is NOT archived.
   */
  async requireExistingOrder(
    orderId: string,
    manager?: EntityManager
  ): Promise<ProductionOrderEntity> {
    const repo = manager ? manager.getRepository(ProductionOrderEntity) : this.orderRepo;
    const order = await repo.findOne({
      where: { id: orderId, deletedAt: IsNull() },
    });

    if (!order) {
      throw new NotFoundError('طلب الإنتاج غير موجود أو تم أرشفته', 'PRODUCTION_ORDER_NOT_FOUND');
    }

    return order;
  }

  /**
   * Validates that order is in DRAFT status.
   */
  requireDraftOrder(order: ProductionOrderEntity): void {
    if (order.status !== ProductionOrderStatus.DRAFT) {
      throw new BusinessRuleError('لا يمكن تعديل طلب إنتاج ليس في حالة مسودة', 'PRODUCTION_ORDER_NOT_DRAFT');
    }
  }

  /**
   * Locks order row pessimistically (FOR UPDATE) within the current transaction
   * and verifies it is in DRAFT status and not deleted.
   * Unified lock root for all mutations in the Order aggregate.
   */
  async lockMutableOrder(
    orderId: string,
    manager: EntityManager
  ): Promise<ProductionOrderEntity> {
    const repo = manager.getRepository(ProductionOrderEntity);
    const order = await repo.findOne({
      where: { id: orderId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });

    if (!order) {
      throw new NotFoundError('طلب الإنتاج غير موجود أو تم أرشفته', 'PRODUCTION_ORDER_NOT_FOUND');
    }

    this.requireDraftOrder(order);

    return order;
  }

  /**
   * Guards line access: ensures line exists, belongs to order, and is NOT archived.
   */
  async requireExistingLine(
    orderId: string,
    lineId: string,
    manager?: EntityManager
  ): Promise<ProductionOrderLineEntity> {
    const repo = manager ? manager.getRepository(ProductionOrderLineEntity) : this.lineRepo;
    const line = await repo.findOne({
      where: { id: lineId, orderId, deletedAt: IsNull() },
    });

    if (!line) {
      throw new NotFoundError('بند الإنتاج غير موجود في هذا الطلب', 'PRODUCTION_ORDER_LINE_NOT_FOUND');
    }

    return line;
  }

  /**
   * Guards pattern selection access: ensures selection exists for given line.
   */
  async requireExistingSelection(
    lineId: string,
    selectionId: string,
    manager?: EntityManager
  ): Promise<ProductionOrderLinePatternSelectionEntity> {
    const repo = manager ? manager.getRepository(ProductionOrderLinePatternSelectionEntity) : this.selectionRepo;
    const selection = await repo.findOne({
      where: { id: selectionId, orderLineId: lineId },
    });

    if (!selection) {
      throw new NotFoundError('تحديد النمط غير موجود في هذا البند', 'PRODUCTION_ORDER_LINE_PATTERN_NOT_FOUND');
    }

    return selection;
  }
}

export const productionOrderGuardService = new ProductionOrderGuardService();
