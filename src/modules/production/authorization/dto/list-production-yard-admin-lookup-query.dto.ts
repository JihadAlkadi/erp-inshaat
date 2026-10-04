import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListProductionYardAdminLookupQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value
  )
  @IsOptional()
  @IsString({ message: 'نص البحث يجب أن يكون نصاً' })
  @MaxLength(100, { message: 'نص البحث لا يمكن أن يتجاوز 100 حرف' })
  search?: string;

  @IsOptional()
  @IsUUID('4', { message: 'معرف القسم يجب أن يكون UUID v4 صالح' })
  departmentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'الحد الأقصى للعناصر يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'الحد الأدنى لعدد العناصر هو 1' })
  @Max(100, { message: 'الحد الأقصى لعدد العناصر هو 100' })
  limit: number = 50;
}
