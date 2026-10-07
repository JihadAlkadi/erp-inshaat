import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateTemplatePatternOptionTaskMaterialDto {
  @IsOptional()
  @IsUUID('4', { message: 'معرف وحدة القياس يجب أن يكون UUID صالحاً' })
  @IsNotEmpty({ message: 'وحدة القياس لا يمكن أن تكون فارغة' })
  productUnitId?: string;

  @IsString({ message: 'الكمية المخططة يجب أن تكون نصاً يمثل قيمة رقمية صالحة' })
  @IsNotEmpty({ message: 'الكمية المخططة مطلوبة' })
  @Matches(/^(?:[1-9]\d{0,11}(?:\.\d{1,6})?|0\.(?!0+$)\d{1,6})$/, {
    message: 'الكمية المخططة يجب أن تكون رقماً موجباً أكبر من الصفر وبحد أقصى 12 خانة صحيحة و6 خانات عشرية',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : value
  )
  plannedQuantity!: string;
}
