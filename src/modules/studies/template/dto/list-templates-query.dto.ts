import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ListStudiesTemplatesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'رقم الصفحة يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'رقم الصفحة يجب ألا يقل عن 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد السجلات يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'عدد السجلات يجب ألا يقل عن 1' })
  @Max(100, { message: 'عدد السجلات يجب ألا يتجاوز 100' })
  limit: number = 20;

  @IsOptional()
  @IsString({ message: 'نص البحث يجب أن يكون نصاً' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'inactive'], { message: 'حالة القالب يجب أن تكون all أو active أو inactive' })
  status: 'all' | 'active' | 'inactive' = 'all';
}
