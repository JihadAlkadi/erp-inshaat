import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class UpdateRoleDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString({ message: 'يجب أن يكون اسم الدور نصاً' })
  @Length(2, 100, { message: 'يجب أن يكون طول اسم الدور بين 2 و 100 محرف' })
  name?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value === 'string') return value.trim();
    return value;
  })
  @IsOptional()
  @IsString({ message: 'يجب أن يكون الوصف نصاً' })
  @Length(0, 500, { message: 'يجب ألا يتجاوز طول الوصف 500 محرف' })
  description?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية (true/false)' })
  isActive?: boolean;
}
