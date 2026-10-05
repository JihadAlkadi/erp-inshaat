import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateInventoryCategoryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'اسم الفئة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الفئة مطلوب' })
  @Length(2, 100, { message: 'اسم الفئة يجب أن يكون بين 2 و 100 حرف' })
  name!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString({ message: 'رمز الفئة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'رمز الفئة مطلوب' })
  @Length(2, 50, { message: 'رمز الفئة يجب أن يكون بين 2 و 50 حرفاً' })
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'رمز الفئة يجب أن يتكون من أحرف لاتينية كبيرة وأرقام والشرطات فقط',
  })
  code!: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    return value;
  })
  @IsOptional()
  @IsString({ message: 'الوصف يجب أن يكون نصاً' })
  @Length(0, 1000, { message: 'الوصف لا يمكن أن يتجاوز 1000 حرف' })
  description?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    return value;
  })
  @IsOptional()
  @IsUUID('4', { message: 'معرف الفئة الأب يجب أن يكون بتنسيق UUID صالح' })
  parentId?: string;

  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية' })
  isActive?: boolean;
}
