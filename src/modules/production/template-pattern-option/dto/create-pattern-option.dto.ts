import { IsString, IsNotEmpty, MaxLength, IsOptional, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTemplatePatternOptionDto {
  @IsString({ message: 'اسم الخيار يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الخيار مطلوب' })
  @MaxLength(150, { message: 'اسم الخيار يجب ألا يتجاوز 150 حرفاً' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsOptional()
  @IsInt({ message: 'الترتيب يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'الترتيب يجب أن يكون 1 على الأقل' })
  sortOrder?: number;
}
