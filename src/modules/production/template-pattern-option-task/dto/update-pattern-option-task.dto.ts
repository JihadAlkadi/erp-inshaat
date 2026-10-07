import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateTemplatePatternOptionTaskDto {
  @IsOptional()
  @IsUUID('4', { message: 'معرف القسم يجب أن يكون UUID صالحاً' })
  @IsNotEmpty({ message: 'القسم لا يمكن أن يكون فارغاً' })
  departmentId?: string;

  @IsOptional()
  @IsString({ message: 'اسم المهمة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم المهمة لا يمكن أن يكون فارغاً' })
  @MaxLength(150, { message: 'اسم المهمة يجب ألا يتجاوز 150 حرفاً' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsString({ message: 'وصف المهمة يجب أن يكون نصاً' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'المدة التقديرية بالدقائق يجب أن تكون عدداً صحيحاً' })
  @Min(0, { message: 'المدة التقديرية بالدقائق لا يمكن أن تكون سالبة' })
  estimatedDurationMinutes?: number | null;

  @IsOptional()
  @Matches(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/, {
    message: 'التكلفة التقديرية يجب أن تكون رقماً عشرياً موجباً وبحد أقصى 14 خانة صحيحة و4 خانات عشرية',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined || value === '') return null;
    return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value;
  })
  estimatedCost?: string | null;
}
