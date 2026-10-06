import { IsArray, ArrayMinSize, IsUUID } from 'class-validator';

export class ReorderTemplateStagesDto {
  @IsArray({ message: 'قائمة المعرفات يجب أن تكون مصفوفة' })
  @ArrayMinSize(1, { message: 'يجب توفير معرف مرحلة واحد على الأقل' })
  @IsUUID('4', { each: true, message: 'كل معرف مرحلة يجب أن يكون UUID صالحاً' })
  stageIds!: string[];
}
