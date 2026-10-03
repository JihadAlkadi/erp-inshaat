import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class UpdateUserDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString({ message: 'يجب أن يكون الاسم الكامل نصاً' })
  @Length(2, 150, { message: 'يجب أن يكون طول الاسم الكامل بين 2 و 150 محرفاً' })
  fullName?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString({ message: 'يجب أن يكون رقم الهاتف نصاً' })
  @Matches(/^09[0-9]{8}$/, { message: 'يجب أن يكون رقم الهاتف 10 أرقام ويبدأ بـ 09' })
  phone?: string;

  @IsOptional()
  @IsUUID('4', { message: 'معرف الدور يجب أن يكون UUID صالحاً' })
  roleId?: string;

  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية (true/false)' })
  isActive?: boolean;
}
