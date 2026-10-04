import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProductionDepartmentDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'اسم القسم يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم القسم مطلوب' })
  @Length(2, 100, { message: 'اسم القسم يجب أن يكون بين 2 و 100 حرف' })
  name!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString({ message: 'رمز القسم يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'رمز القسم مطلوب' })
  @Length(2, 50, { message: 'رمز القسم يجب أن يكون بين 2 و 50 حرفاً' })
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'رمز القسم يجب أن يبدأ بحرف لاتيني كبير ويتكون من أحرف كبيرة وأرقام والشرطة السفلية فقط',
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
  @Length(0, 500, { message: 'الوصف لا يمكن أن يتجاوز 500 حرف' })
  description?: string;

  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية' })
  isActive?: boolean;

  @IsUUID('4', { message: 'يجب أن يكون معرف رئيس القسم بتنسيق UUID صالح' })
  @IsNotEmpty({ message: 'رئيس القسم مطلوب' })
  headUserId!: string;
}
