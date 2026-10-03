import { IsBoolean, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProductionDepartmentDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString({ message: 'اسم القسم يجب أن يكون نصاً' })
  @Length(2, 100, { message: 'اسم القسم يجب أن يكون بين 2 و 100 حرف' })
  name?: string;

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
