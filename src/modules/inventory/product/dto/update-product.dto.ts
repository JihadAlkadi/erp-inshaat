import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateInventoryProductDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString({ message: 'اسم المنتج يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم المنتج لا يمكن أن يكون فارغاً' })
  @MaxLength(150, { message: 'اسم المنتج يجب ألا يتجاوز 150 حرفاً' })
  name?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString({ message: 'وصف المنتج يجب أن يكون نصاً' })
  description?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsUUID('4', { message: 'معرف الفئة يجب أن يكون UUID صالحاً' })
  categoryId?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString({ message: 'مكان وجود المادة يجب أن يكون نصاً' })
  @MaxLength(255, { message: 'مكان وجود المادة يجب ألا يتجاوز 255 حرفاً' })
  locationName?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
    return value;
  })
  @ValidateIf((_obj, value) => value !== undefined)
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية' })
  isActive?: boolean;
}
