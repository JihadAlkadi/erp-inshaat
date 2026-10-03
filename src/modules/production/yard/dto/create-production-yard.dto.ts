import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateProductionYardDto {
  @IsNotEmpty({ message: 'معرف القسم مطلوب' })
  @IsUUID('4', { message: 'معرف القسم يجب أن يكون UUID صالحاً' })
  departmentId!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'اسم الساحة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الساحة مطلوب' })
  @Length(2, 100, { message: 'اسم الساحة يجب أن يكون بين 2 و 100 حرف' })
  name!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString({ message: 'رمز الساحة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'رمز الساحة مطلوب' })
  @Length(2, 50, { message: 'رمز الساحة يجب أن يكون بين 2 و 50 حرفاً' })
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'رمز الساحة يجب أن يبدأ بحرف لاتيني كبير ويتكون من أحرف كبيرة وأرقام والشرطة السفلية فقط',
  })
  code!: string;

  @Type(() => Number)
  @IsInt({ message: 'السعة الاستيعابية يجب أن تكون عدداً صحيحاً' })
  @Min(1, { message: 'السعة الاستيعابية للساحة يجب أن تكون 1 على الأقل' })
  capacity!: number;

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
}
