import {
  IsEnum,
  IsOptional,
  IsArray,
  IsUUID,
  ArrayMinSize,
  ArrayMaxSize,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  AccessScopePreset,
  AccessScopePresetType,
} from '../../authorization/access-administration/access-scope-preset.constants.js';

export class UpdateAccessRuleDto {
  @IsEnum(['ALLOW', 'DENY'], {
    message: 'نوع تأثير القاعدة يجب أن يكون إما ALLOW أو DENY',
  })
  effect!: 'ALLOW' | 'DENY';

  @IsEnum(AccessScopePreset, {
    message: 'نوع نطاق الوصول (preset) غير صالح أو غير مدعوم',
  })
  preset!: AccessScopePresetType;

  @IsOptional()
  @IsArray({ message: 'قائمة المعرفات المستهدفة يجب أن تكون مصفوفة' })
  @IsUUID('4', { each: true, message: 'كل معرف مستهدف يجب أن يكون UUID v4 صالح' })
  @ArrayMinSize(1, { message: 'يجب تحديد معرف مستهدف واحد على الأقل للنطاقات المحددة' })
  @ArrayMaxSize(200, { message: 'لا يمكن تحديد أكثر من 200 معرف مستهدف في القاعدة الواحدة' })
  targetIds?: string[];

  @IsOptional()
  @IsString({ message: 'وصف القاعدة يجب أن يكون نصاً' })
  @MaxLength(500, { message: 'وصف القاعدة لا يمكن أن يتجاوز 500 حرف' })
  description?: string;
}
