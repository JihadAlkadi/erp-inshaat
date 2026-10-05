import { IsOptional, IsInt, Min, Max, IsString, IsUUID, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ListInventoryProductsQueryDto {
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
  limit?: number = 20;

  @IsOptional()
  @IsString({ message: 'نص البحث يجب أن يكون نصاً' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @IsUUID('4', { message: 'معرف الفئة يجب أن يكون UUID صالحاً' })
  categoryId?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'all'], {
    message: 'الحالة يجب أن تكون إما active أو inactive أو all',
  })
  status?: 'active' | 'inactive' | 'all';
}
