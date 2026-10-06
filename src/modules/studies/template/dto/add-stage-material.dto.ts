import {
  IsString,
  IsNotEmpty,
  IsUUID,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class AddTemplateStageMaterialDto {
  @IsUUID('4', { message: 'معرف المنتج يجب أن يكون UUID صالحاً' })
  @IsNotEmpty({ message: 'المنتج مطلوب' })
  productId!: string;

  @IsUUID('4', { message: 'معرف وحدة القياس يجب أن يكون UUID صالحاً' })
  @IsNotEmpty({ message: 'وحدة القياس مطلوبة' })
  productUnitId!: string;

  @IsString({ message: 'الكمية المخططة يجب أن تكون نصاً يمثل قيمة رقمية صالحة' })
  @IsNotEmpty({ message: 'الكمية المخططة مطلوبة' })
  @Matches(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/, {
    message: 'الكمية المخططة يجب أن تكون رقماً موجباً وبحد أقصى 12 خانة صحيحة و6 خانات عشرية',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value))
  plannedQuantity!: string;
}
