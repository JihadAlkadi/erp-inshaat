import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateTemplateSpecificationDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString({ message: 'اسم الخاصية يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الخاصية لا يمكن أن يكون فارغاً' })
  @MaxLength(100, { message: 'اسم الخاصية يجب ألا يتجاوز 100 حرف' })
  name?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value))
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString({ message: 'قيمة الخاصية يجب أن تكون نصاً' })
  @IsNotEmpty({ message: 'قيمة الخاصية لا يمكن أن تكون فارغة' })
  @MaxLength(255, { message: 'قيمة الخاصية يجب ألا تتجاوز 255 حرفاً' })
  value?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString({ message: 'وحدة القياس يجب أن تكون نصاً' })
  @MaxLength(50, { message: 'وحدة القياس يجب ألا تتجاوز 50 حرفاً' })
  unit?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'ترتيب الخاصية يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'ترتيب الخاصية يجب ألا يقل عن 1' })
  sortOrder?: number;
}
