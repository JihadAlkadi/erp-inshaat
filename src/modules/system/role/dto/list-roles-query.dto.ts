import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListRolesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'رقم الصفحة يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'رقم الصفحة يجب أن يكون 1 على الأقل' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد العناصر يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'عدد العناصر يجب أن يكون 1 على الأقل' })
  @Max(100, { message: 'الحد الأقصى لعدد العناصر في الصفحة هو 100' })
  limit: number = 20;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString({ message: 'نص البحث يجب أن يكون نصاً' })
  search?: string;
}
