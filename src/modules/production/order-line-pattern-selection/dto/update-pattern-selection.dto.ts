import { IsNotEmpty, IsUUID } from 'class-validator';

export class UpdatePatternSelectionDto {
  @IsNotEmpty({ message: 'معرف الخيار مطلوب' })
  @IsUUID('4', { message: 'معرف الخيار يجب أن يكون معرفاً صالحاً (UUID)' })
  optionId!: string;
}
