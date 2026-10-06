import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateTemplateStageDto {
  @IsOptional()
  @IsUUID('4', { message: 'معرف القسم يجب أن يكون UUID صالحاً' })
  departmentId?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString({ message: 'اسم المرحلة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم المرحلة لا يمكن أن يكون فارغاً' })
  @MaxLength(150, { message: 'اسم المرحلة يجب ألا يتجاوز 150 حرفاً' })
  name?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString({ message: 'وصف المرحلة يجب أن يكون نصاً' })
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsInt({ message: 'المدة التقديرية بالدقائق يجب أن تكون عدداً صحيحاً' })
  @Min(0, { message: 'المدة التقديرية بالدقائق لا يمكن أن تكون سالبة' })
  estimatedDurationMinutes?: number | null;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @Matches(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/, {
    message: 'التكلفة التقديرية يجب أن تكون رقماً عشرياً موجباً وبحد أقصى 14 خانة صحيحة و4 خانات عشرية',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined || value === '') return null;
    return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value;
  })
  estimatedCost?: string | null;
}
