import { IsArray, ArrayNotEmpty, IsUUID } from 'class-validator';

export class ReorderStageAttachmentsDto {
  @IsArray({ message: 'قائمة المعرفات يجب أن تكون مصفوفة' })
  @ArrayNotEmpty({ message: 'قائمة المعرفات لا يمكن أن تكون فارغة' })
  @IsUUID('4', { each: true, message: 'كل معرف في القائمة يجب أن يكون UUID صالحاً' })
  attachmentIds!: string[];
}
