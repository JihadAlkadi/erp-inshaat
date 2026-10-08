import {
  IsNotEmpty,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExplicitPatternSelectionItemDto {
  @IsNotEmpty({ message: 'معرف النمط مطلوب' })
  @IsUUID('4', { message: 'معرف النمط يجب أن يكون معرفاً صالحاً (UUID)' })
  patternId!: string;

  @IsNotEmpty({ message: 'معرف الخيار مطلوب' })
  @IsUUID('4', { message: 'معرف الخيار يجب أن يكون معرفاً صالحاً (UUID)' })
  optionId!: string;
}

export class AddProductionOrderLineDto {
  @IsNotEmpty({ message: 'معرف القالب مطلوب' })
  @IsUUID('4', { message: 'معرف القالب يجب أن يكون معرفاً صالحاً (UUID)' })
  templateId!: string;

  @IsNotEmpty({ message: 'الكمية مطلوبة' })
  @IsInt({ message: 'الكمية يجب أن تكون عدداً صحيحاً' })
  @Min(1, { message: 'الكمية يجب أن تكون 1 على الأقل' })
  @Max(10000, { message: 'الكمية لا يمكن أن تتجاوز 10,000' })
  quantity!: number;

  @IsOptional()
  @IsArray({ message: 'خيارات الأنماط يجب أن تكون مصفوفة' })
  @ValidateNested({ each: true })
  @Type(() => ExplicitPatternSelectionItemDto)
  patternSelections?: ExplicitPatternSelectionItemDto[];
}
