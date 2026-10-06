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

export class CreateTemplateStageDto {
  @IsUUID('4', { message: 'معرف القسم يجب أن يكون UUID صالحاً' })
  @IsNotEmpty({ message: 'القسم مطلوب للمرحلة' })
  departmentId!: string;

  @IsString({ message: 'اسم المرحلة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم المرحلة مطلوب' })
  @MaxLength(150, { message: 'اسم المرحلة يجب ألا يتجاوز 150 حرفاً' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsOptional()
  @IsString({ message: 'وصف المرحلة يجب أن يكون نصاً' })
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
  @IsInt({ message: 'ترتيب المرحلة يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'ترتيب المرحلة يجب ألا يقل عن 1' })
  sortOrder?: number;

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
