import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  MaxLength,
  Length,
  Matches,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UnitSpecificationDto } from './unit-specification.dto.js';

export class CreateBaseUnitDto {
  @IsString({ message: 'اسم الوحدة الأساسية يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الوحدة الأساسية مطلوب' })
  @MaxLength(100, { message: 'اسم الوحدة الأساسية يجب ألا يتجاوز 100 حرف' })
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
  @Matches(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/, {
    message: 'سعر الوحدة يجب أن يكون رقماً عشرياً موجباً وبحد أقصى 14 خانة صحيحة و4 خانات عشرية',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value))
  price!: string;

  @IsOptional()
  @IsArray({ message: 'المواصفات يجب أن تكون مصفوفة' })
  @ArrayMaxSize(50, { message: 'لا يمكن إضافة أكثر من 50 مواصفة للوحدة' })
  @ValidateNested({ each: true })
  @Type(() => UnitSpecificationDto)
  specifications?: UnitSpecificationDto[] | null;
}

export class CreateInventoryProductDto {
  @IsString({ message: 'اسم المنتج يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم المنتج مطلوب' })
  @MaxLength(150, { message: 'اسم المنتج يجب ألا يتجاوز 150 حرفاً' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString({ message: 'رمز المنتج يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'رمز المنتج مطلوب' })
  @Length(2, 50, { message: 'رمز المنتج يجب أن يكون بين 2 و 50 حرفاً' })
  @Matches(/^[A-Z][A-Z0-9_-]*$/, {
    message: 'رمز المنتج يجب أن يبدأ بحرف لاتيني كبير ويتكون من أحرف لاتينية كبيرة وأرقام وشرطات فقط',
  })
  code!: string;


  @IsOptional()
  @IsString({ message: 'وصف المنتج يجب أن يكون نصاً' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  description?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'معرف الفئة يجب أن يكون UUID صالحاً' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  categoryId?: string | null;

  @IsOptional()
  @IsString({ message: 'مكان وجود المادة يجب أن يكون نصاً' })
  @MaxLength(255, { message: 'مكان وجود المادة يجب ألا يتجاوز 255 حرفاً' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  locationName?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
    return value;
  })
  isActive?: boolean;

  @IsNotEmpty({ message: 'بيانات الوحدة الأساسية مطلوبة عند إنشاء المنتج' })
  @ValidateNested()
  @Type(() => CreateBaseUnitDto)
  baseUnit!: CreateBaseUnitDto;
}
