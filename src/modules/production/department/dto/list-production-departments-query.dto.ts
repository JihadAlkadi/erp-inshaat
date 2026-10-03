import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ListProductionDepartmentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'رقم الصفحة يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'رقم الصفحة يجب ألا يقل عن 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد السجلات في الصفحة يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'عدد السجلات يجب ألا يقل عن 1' })
  @Max(100, { message: 'عدد السجلات لا يمكن أن يتجاوز 100' })
  limit: number = 10;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'كلمة البحث يجب أن تكون نصاً' })
  search?: string;
}
