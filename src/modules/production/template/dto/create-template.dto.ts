import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProductionTemplateDto {
  @IsString({ message: 'اسم القالب يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم القالب مطلوب' })
  @MaxLength(150, { message: 'اسم القالب يجب ألا يتجاوز 150 حرفاً' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsOptional()
  @IsString({ message: 'الرقم المرجعي يجب أن يكون نصاً' })
  @MaxLength(100, { message: 'الرقم المرجعي يجب ألا يتجاوز 100 حرف' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  referenceNumber?: string | null;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'رمز القالب التقني يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'رمز القالب التقني مطلوب' })
  @Length(2, 50, { message: 'رمز القالب التقني يجب أن يتكون من حرفين إلى 50 حرفاً' })
  @Matches(/^[A-Z][A-Z0-9_-]*$/, {
    message: 'رمز القالب التقني يجب أن يبدأ بحرف إنجليزي كبير ويحتوي فقط على أحرف كبيرة وأرقام وشرطات سفلية أو واصلات',
  })
  code!: string;

  @IsOptional()
  @IsString({ message: 'وصف القالب يجب أن يكون نصاً' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  description?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
    return value;
  })
  @IsBoolean({ message: 'حالة القالب يجب أن تكون قيمة منطقية' })
  isActive?: boolean;
}
