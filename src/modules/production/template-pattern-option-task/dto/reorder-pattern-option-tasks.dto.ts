import { IsArray, ArrayNotEmpty, IsUUID } from 'class-validator';

export class ReorderPatternOptionTasksDto {
  @IsArray({ message: 'قائمة المعرفات يجب أن تكون مصفوفة' })
  @ArrayNotEmpty({ message: 'قائمة المعرفات لا يمكن أن تكون فارغة' })
  @IsUUID('4', { each: true, message: 'كل عنصر يجب أن يكون معرفاً صالحاً (UUID)' })
  taskIds!: string[];
}
