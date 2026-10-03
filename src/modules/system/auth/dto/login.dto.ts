import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsNotEmpty({ message: 'يرجى إدخال رقم الهاتف' })
  @IsString({ message: 'يجب أن يكون رقم الهاتف نصاً' })
  @Matches(/^09[0-9]{8}$/, { message: 'يجب أن يكون رقم الهاتف 10 أرقام ويبدأ بـ 09' })
  phone!: string;

  @IsNotEmpty({ message: 'يرجى إدخال كلمة المرور' })
  @IsString({ message: 'يجب أن تكون كلمة المرور نصاً' })
  @MinLength(6, { message: 'يجب أن تتكون كلمة المرور من 6 محارف على الأقل' })
  password!: string;
}
