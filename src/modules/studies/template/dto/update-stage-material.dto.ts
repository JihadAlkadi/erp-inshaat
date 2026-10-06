import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateTemplateStageMaterialDto {
  @IsOptional()
  @IsUUID('4', { message: 'معرف وحدة القياس يجب أن يكون UUID صالحاً' })
  productUnitId?: string;

  @IsString({ message: 'الكمية المخططة يجب أن تكون نصاً يمثل قيمة رقمية صالحة' })
  @IsNotEmpty({ message: 'الكمية المخططة مطلوبة' })
  @Matches(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/, {
    message: 'الكمية المخططة يجب أن تكون رقماً موجباً وبحد أقصى 12 خانة صحيحة و6 خانات عشرية',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value))
  plannedQuantity!: string;
}
