import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateTemplatePatternDto {
  @IsString({ message: 'اسم النمط يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم النمط مطلوب' })
  @MaxLength(150, { message: 'اسم النمط يجب ألا يتجاوز 150 حرفاً' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;
}
