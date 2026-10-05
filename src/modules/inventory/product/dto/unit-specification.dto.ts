import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UnitSpecificationDto {
  @IsString({ message: 'اسم الخاصية يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الخاصية مطلوب' })
  @MaxLength(100, { message: 'اسم الخاصية يجب ألا يتجاوز 100 حرف' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsString({ message: 'قيمة الخاصية يجب أن تكون نصاً' })
  @IsNotEmpty({ message: 'قيمة الخاصية مطلوبة' })
  @MaxLength(255, { message: 'قيمة الخاصية يجب ألا تتجاوز 255 حرفاً' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  value!: string;

  @IsOptional()
  @IsString({ message: 'وحدة الخاصية يجب أن تكون نصاً' })
  @MaxLength(50, { message: 'وحدة الخاصية يجب ألا تتجاوز 50 حرفاً' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  unit?: string | null;
}
