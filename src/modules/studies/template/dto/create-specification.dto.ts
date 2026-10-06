import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateTemplateSpecificationDto {
  @IsString({ message: 'اسم الخاصية يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الخاصية مطلوب' })
  @MaxLength(100, { message: 'اسم الخاصية يجب ألا يتجاوز 100 حرف' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsString({ message: 'قيمة الخاصية يجب أن تكون نصاً' })
  @IsNotEmpty({ message: 'قيمة الخاصية مطلوبة' })
  @MaxLength(255, { message: 'قيمة الخاصية يجب ألا تتجاوز 255 حرفاً' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value))
  value!: string;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'ترتيب الخاصية يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'ترتيب الخاصية يجب ألا يقل عن 1' })
  sortOrder?: number;
}
