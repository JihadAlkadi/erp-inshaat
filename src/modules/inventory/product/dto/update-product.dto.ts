import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateInventoryProductDto {
  @IsOptional()
  @IsString({ message: 'اسم المنتج يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم المنتج لا يمكن أن يكون فارغاً' })
  @MaxLength(150, { message: 'اسم المنتج يجب ألا يتجاوز 150 حرفاً' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

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
}
