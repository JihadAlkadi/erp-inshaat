import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateTemplatePatternOptionDto {
  @IsString({ message: 'اسم الخيار يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الخيار مطلوب' })
  @MaxLength(150, { message: 'اسم الخيار يجب ألا يتجاوز 150 حرفاً' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;
}
