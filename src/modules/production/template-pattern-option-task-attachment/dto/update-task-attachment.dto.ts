import { IsString, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdatePatternOptionTaskAttachmentDto {
  @IsOptional()
  @IsString({ message: 'الوصف يجب أن يكون نصاً' })
  @MaxLength(500, { message: 'الوصف يجب ألا يتجاوز 500 حرف' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  })
  description?: string | null;
}
