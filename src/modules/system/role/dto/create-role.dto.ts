import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateRoleDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'يرجى إدخال اسم الدور' })
  @IsString({ message: 'يجب أن يكون اسم الدور نصاً' })
  @Length(2, 100, { message: 'يجب أن يكون طول اسم الدور بين 2 و 100 محرف' })
  name!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value
  )
  @IsNotEmpty({ message: 'يرجى إدخال رمز الدور التقني' })
  @IsString({ message: 'يجب أن يكون رمز الدور نصاً' })
  @Length(2, 50, { message: 'يجب أن يكون طول رمز الدور بين 2 و 50 محرفاً' })
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'رمز الدور يجب أن يبدأ بحرف لاتيني كبير ويحتوي فقط على أحرف لاتينية كبيرة وأرقام و _',
  })
  code!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value
  )
  @IsOptional()
  @IsString({ message: 'يجب أن يكون الوصف نصاً' })
  @Length(0, 500, { message: 'يجب ألا يتجاوز طول الوصف 500 محرف' })
  description?: string;

  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية (true/false)' })
  isActive?: boolean;
}
