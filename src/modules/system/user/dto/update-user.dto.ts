import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function AtLeastOneField(fields: string[], validationOptions?: ValidationOptions) {
  return function (target: object, propertyName?: string) {
    registerDecorator({
      name: 'atLeastOneField',
      target: target.constructor,
      propertyName: propertyName ?? 'dto',
      options: validationOptions,
      constraints: [fields],
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          return fields.some((f) => obj[f] !== undefined);
        },
        defaultMessage() {
          return 'يجب تقديم حقل واحد على الأقل لتحديث البيانات';
        },
      },
    });
  };
}

export class UpdateUserDto {
  @AtLeastOneField(['fullName', 'phone', 'roleId', 'isActive'], {
    message: 'يجب تقديم حقل واحد على الأقل لتحديث البيانات',
  })
  @IsOptional()
  @IsString({ message: 'يجب أن يكون الاسم الكامل نصاً' })
  @Length(2, 150, { message: 'يجب أن يكون طول الاسم الكامل بين 2 و 150 محرفاً' })
  fullName?: string;

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
