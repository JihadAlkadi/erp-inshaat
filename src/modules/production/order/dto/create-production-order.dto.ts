import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ProductionOrderPriority } from '../production-order.entity.js';

export class CreateProductionOrderDto {
  @IsOptional()
  @IsEnum(ProductionOrderPriority, {
    message: 'يجب اختيار أولوية صالحة (CRITICAL, HIGH, NORMAL, LOW)',
  })
  priority?: ProductionOrderPriority;

  @IsOptional()
  @IsString({ message: 'الوصف يجب أن يكون نصاً' })
  @MaxLength(2000, { message: 'الوصف لا يمكن أن يتجاوز 2000 حرف' })
  description?: string | null;

  @IsOptional()
  @IsString({ message: 'الملاحظات يجب أن تكون نصاً' })
  @MaxLength(2000, { message: 'الملاحظات لا يمكن أن تتجاوز 2000 حرف' })
  notes?: string | null;
}
