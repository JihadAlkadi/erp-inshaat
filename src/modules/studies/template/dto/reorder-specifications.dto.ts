import { IsArray, ArrayMinSize, IsUUID } from 'class-validator';

export class ReorderTemplateSpecificationsDto {
  @IsArray({ message: 'قائمة المعرفات يجب أن تكون مصفوفة' })
  @ArrayMinSize(1, { message: 'يجب توفير معرف خاصية واحد على الأقل' })
  @IsUUID('4', { each: true, message: 'كل معرف خاصية يجب أن يكون UUID صالحاً' })
  specificationIds!: string[];
}
