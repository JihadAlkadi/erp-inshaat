import { IsString, IsNotEmpty, MaxLength, IsOptional, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTemplatePatternDto {
  @IsString({ message: 'اسم النمط يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم النمط مطلوب' })
  @MaxLength(150, { message: 'اسم النمط يجب ألا يتجاوز 150 حرفاً' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsOptional()
  @IsInt({ message: 'ترتيب سير العمل يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'ترتيب سير العمل يجب أن يكون 1 على الأقل' })
  sortOrder?: number;
}
