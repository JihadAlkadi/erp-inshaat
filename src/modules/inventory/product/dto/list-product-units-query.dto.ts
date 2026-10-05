import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListInventoryProductUnitsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'رقم الصفحة يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'رقم الصفحة يجب أن يكون 1 على الأقل' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد العناصر يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'عدد العناصر يجب أن يكون 1 على الأقل' })
  @Max(100, { message: 'عدد العناصر لا يمكن أن يتجاوز 100' })
  limit?: number = 50;
}
