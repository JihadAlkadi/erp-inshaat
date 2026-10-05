import {
  IsString,
  IsNotEmpty,
  IsUUID,
  MaxLength,
  Matches,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UnitSpecificationDto } from './unit-specification.dto.js';

export class UpdateInventoryProductUnitDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString({ message: 'اسم الوحدة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الوحدة لا يمكن أن يكون فارغاً' })
  @MaxLength(100, { message: 'اسم الوحدة يجب ألا يتجاوز 100 حرف' })
  name?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString({ message: 'الباركود يجب أن يكون نصاً' })
  @MaxLength(100, { message: 'الباركود يجب ألا يتجاوز 100 حرف' })
  barcode?: string | null;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value))
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString({ message: 'سعر الوحدة يجب أن يكون نصاً يمثل قيمة رقمية صالحة' })
  @Matches(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/, {
    message: 'سعر الوحدة يجب أن يكون رقماً عشرياً غير سالب (DECIMAL(18,4)) وبحد أقصى 4 خانات عشرية و 14 خانة صحيحة',
  })
  price?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_obj, value) => value !== undefined)
  @IsUUID('4', { message: 'معرف الوحدة المقابلة يجب أن يكون UUID صالحاً' })
  equivalentToUnitId?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value))
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString({ message: 'معامل التحويل يجب أن يكون نصاً يمثل قيمة رقمية صالحة' })
  @Matches(/^(?!0(\.0+)?$)(0|[1-9]\d{0,11})(\.\d{1,6})?$/, {
    message: 'معامل التحويل يجب أن يكون رقماً عشرياً أكبر تماماً من الصفر (DECIMAL(18,6)) وبحد أقصى 6 خانات عشرية و 12 خانة صحيحة',
  })
  conversionQuantity?: string;

  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsArray({ message: 'المواصفات يجب أن تكون مصفوفة' })
  @ArrayMaxSize(50, { message: 'لا يمكن إضافة أكثر من 50 مواصفة للوحدة' })
  @ValidateNested({ each: true })
  @Type(() => UnitSpecificationDto)
  specifications?: UnitSpecificationDto[] | null;
}
