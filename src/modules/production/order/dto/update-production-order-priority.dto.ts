import { IsEnum } from 'class-validator';
import { ProductionOrderPriority } from '../production-order.entity.js';

export class UpdateProductionOrderPriorityDto {
  @IsEnum(ProductionOrderPriority, {
    message: 'يجب اختيار أولوية صالحة (CRITICAL, HIGH, NORMAL, LOW)',
  })
  priority!: ProductionOrderPriority;
}
