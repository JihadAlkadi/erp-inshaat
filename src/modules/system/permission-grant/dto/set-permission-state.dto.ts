import { IsBoolean } from 'class-validator';

export class SetPermissionStateDto {
  @IsBoolean({ message: 'حالة تفعيل الصلاحية يجب أن تكون قيمة منطقية (true/false)' })
  enabled!: boolean;
}
