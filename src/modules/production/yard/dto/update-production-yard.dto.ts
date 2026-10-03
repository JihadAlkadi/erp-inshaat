import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Min, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateProductionYardDto {
  @IsOptional()
  @IsUUID('4', { message: 'معرف القسم يجب أن يكون UUID صالحاً' })
  departmentId?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString({ message: 'اسم الساحة يجب أن يكون نصاً' })
  @Length(2, 100, { message: 'اسم الساحة يجب أن يكون بين 2 و 100 حرف' })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'السعة الاستيعابية يجب أن تكون عدداً صحيحاً' })
  @Min(1, { message: 'السعة الاستيعابية للساحة يجب أن تكون 1 على الأقل' })
  capacity?: number;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString({ message: 'الوصف يجب أن يكون نصاً أو فارغاً' })
  @Length(0, 500, { message: 'الوصف لا يمكن أن يتجاوز 500 حرف' })
  description?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية' })
  isActive?: boolean;
}
