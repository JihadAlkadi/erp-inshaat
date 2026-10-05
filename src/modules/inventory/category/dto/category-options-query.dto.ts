import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CategoryOptionsQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'كلمة البحث يجب أن تكون نصاً' })
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'الحد الأقصى للنتائج يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'الحد الأدنى للنتائج هو 1' })
  @Max(100, { message: 'الحد الأقصى للنتائج هو 100' })
  limit: number = 50;
}
