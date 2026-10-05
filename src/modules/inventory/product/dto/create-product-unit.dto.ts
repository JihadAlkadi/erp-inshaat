import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MaxLength,
  Matches,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UnitSpecificationDto } from './unit-specification.dto.js';

export class CreateInventoryProductUnitDto {
  @IsString({ message: 'اسم الوحدة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الوحدة مطلوب' })
  @MaxLength(100, { message: 'اسم الوحدة يجب ألا يتجاوز 100 حرف' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsOptional()
  @IsString({ message: 'الباركود يجب أن يكون نصاً' })
  @MaxLength(100, { message: 'الباركود يجب ألا يتجاوز 100 حرف' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  barcode?: string | null;

  @IsString({ message: 'سعر الوحدة يجب أن يكون نصاً يمثل قيمة رقمية صالحة' })
  @IsNotEmpty({ message: 'سعر الوحدة مطلوب' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'سعر الوحدة يجب أن يكون رقماً عشرياً موجباً وبحد أقصى 4 خانات عشرية',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value))
  price!: string;

  @IsUUID('4', { message: 'معرف الوحدة المقابلة يجب أن يكون UUID صالحاً' })
  @IsNotEmpty({ message: 'الوحدة المقابلة مطلوبة للوحدات الإضافية' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  equivalentToUnitId!: string;

  @IsString({ message: 'معامل التحويل يجب أن يكون نصاً يمثل قيمة رقمية صالحة' })
  @IsNotEmpty({ message: 'معامل التحويل مطلوب للوحدات الإضافية' })
  @Matches(/^(0*[1-9]\d*(\.\d{1,6})?|0\.\d{0,5}[1-9]\d*)$/, {
    message: 'معامل التحويل يجب أن يكون رقماً عشرياً أكبر تماماً من الصفر وبحد أقصى 6 خانات عشرية',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value))
  conversionQuantity!: string;

  @IsOptional()
  @IsArray({ message: 'المواصفات يجب أن تكون مصفوفة' })
  @ArrayMaxSize(50, { message: 'لا يمكن إضافة أكثر من 50 مواصفة للوحدة' })
  @ValidateNested({ each: true })
  @Type(() => UnitSpecificationDto)
  specifications?: UnitSpecificationDto[] | null;
}
