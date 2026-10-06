import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateStudiesTemplateDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString({ message: 'اسم القالب يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم القالب لا يمكن أن يكون فارغاً' })
  @MaxLength(150, { message: 'اسم القالب يجب ألا يتجاوز 150 حرفاً' })
  name?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString({ message: 'الرقم المرجعي يجب أن يكون نصاً' })
  @MaxLength(100, { message: 'الرقم المرجعي يجب ألا يتجاوز 100 حرف' })
  referenceNumber?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString({ message: 'وصف القالب يجب أن يكون نصاً' })
  description?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
    return value;
  })
  @ValidateIf((_obj, value) => value !== undefined)
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية' })
  isActive?: boolean;
}
