import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty({ message: 'يرجى إدخال الاسم الكامل' })
  @IsString({ message: 'يجب أن يكون الاسم الكامل نصاً' })
  @Length(2, 150, { message: 'يجب أن يكون طول الاسم الكامل بين 2 و 150 محرفاً' })
  fullName!: string;

  @IsNotEmpty({ message: 'يرجى إدخال رقم الهاتف' })
  @IsString({ message: 'يجب أن يكون رقم الهاتف نصاً' })
  @Matches(/^09[0-9]{8}$/, { message: 'يجب أن يكون رقم الهاتف 10 أرقام ويبدأ بـ 09' })
  phone!: string;

  @IsNotEmpty({ message: 'يرجى إدخال كلمة المرور' })
  @IsString({ message: 'يجب أن تكون كلمة المرور نصاً' })
  @MinLength(6, { message: 'يجب أن تتكون كلمة المرور من 6 محارف على الأقل' })
  password!: string;

  @IsNotEmpty({ message: 'يرجى اختيار الدور' })
  @IsUUID('4', { message: 'معرف الدور يجب أن يكون UUID صالحاً' })
  roleId!: string;

  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية (true/false)' })
  isActive?: boolean;
}
