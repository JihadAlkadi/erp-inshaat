import { IsArray, IsUUID, ArrayNotEmpty } from 'class-validator';

export class ReorderTemplateStagesDto {
  @IsArray({ message: 'قائمة المعرفات يجب أن تكون مصفوفة' })
  @ArrayNotEmpty({ message: 'قائمة المعرفات لا يمكن أن تكون فارغة' })
  @IsUUID('4', { each: true, message: 'كل معرف في القائمة يجب أن يكون UUID صالحاً' })
  stageIds!: string[];
}
