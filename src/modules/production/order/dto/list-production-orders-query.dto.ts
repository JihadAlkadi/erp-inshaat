import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ProductionOrderPriority } from '../production-order.entity.js';

export class ListProductionOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'رقم الصفحة يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'رقم الصفحة يجب ألا يقل عن 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد السجلات يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'عدد السجلات يجب ألا يقل عن 1' })
  @Max(100, { message: 'الحد الأقصى لعدد السجلات هو 100' })
  limit?: number = 20;

  @IsOptional()
  @IsString({ message: 'نص البحث يجب أن يكون نصاً' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value
  )
  search?: string;

  @IsOptional()
  @IsEnum(ProductionOrderPriority, { message: 'يجب اختيار أولوية صالحة للفلترة' })
  priority?: ProductionOrderPriority;
}
