import { IsBoolean, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateInventoryCategoryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString({ message: 'اسم الفئة يجب أن يكون نصاً' })
  @Length(2, 100, { message: 'اسم الفئة يجب أن يكون بين 2 و 100 حرف' })
  name?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  })
  @IsOptional()
  @IsString({ message: 'الوصف يجب أن يكون نصاً' })
  @Length(0, 1000, { message: 'الوصف لا يمكن أن يتجاوز 1000 حرف' })
  description?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsUUID('4', { message: 'معرف الفئة الأب يجب أن يكون بتنسيق UUID صالح' })
  parentId?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية' })
  isActive?: boolean;
}
