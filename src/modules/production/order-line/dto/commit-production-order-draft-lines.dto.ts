import {
  IsNotEmpty,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExplicitPatternSelectionItemDto } from './add-production-order-line.dto.js';

export function IsUniqueLineIds(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isUniqueLineIds',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (!Array.isArray(value)) return true;
          const ids = value
            .map((l: any) => l?.id)
            .filter((id: any) => typeof id === 'string' && id.trim().length > 0);
          return new Set(ids).size === ids.length;
        },
        defaultMessage(_args: ValidationArguments) {
          return 'لا يمكن تكرار معرفات البنود في نفس الطلب';
        },
      },
    });
  };
}

export class CommitProductionOrderDraftLineDto {
  @IsOptional()
  @IsUUID('4', { message: 'معرف البند يجب أن يكون معرفاً صالحاً (UUID)' })
  id?: string;

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

export class CommitProductionOrderDraftLinesDto {
  @IsArray({ message: 'قائمة البنود يجب أن تكون مصفوفة' })
  @ArrayMaxSize(100, { message: 'لا يمكن حفظ أكثر من 100 بند في أمر إنتاج واحد' })
  @IsUniqueLineIds({ message: 'لا يمكن تكرار معرفات البنود في نفس الطلب' })
  @ValidateNested({ each: true })
  @Type(() => CommitProductionOrderDraftLineDto)
  lines!: CommitProductionOrderDraftLineDto[];
}
