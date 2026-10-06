import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsInt,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateTemplateSpecificationDto {
  @IsOptional()
  @IsString({ message: 'اسم الخاصية يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الخاصية لا يمكن أن يكون فارغاً' })
  @MaxLength(100, { message: 'اسم الخاصية يجب ألا يتجاوز 100 حرف' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsString({ message: 'قيمة الخاصية يجب أن تكون نصاً' })
  @IsNotEmpty({ message: 'قيمة الخاصية لا يمكن أن تكون فارغة' })
  @MaxLength(255, { message: 'قيمة الخاصية يجب ألا تتجاوز 255 حرفاً' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  value?: string;

  @IsOptional()
  @IsString({ message: 'وحدة القياس يجب أن تكون نصاً' })
  @MaxLength(50, { message: 'وحدة القياس يجب ألا تتجاوز 50 حرفاً' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  unit?: string | null;
}
