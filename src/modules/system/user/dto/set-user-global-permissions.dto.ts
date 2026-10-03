import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetUserGlobalPermissionsDto {
  @IsArray({ message: 'يجب تقديم قائمة معرّفات الصلاحيات كمصفوفة' })
  @ArrayUnique({ message: 'يجب عدم تكرار معرّفات الصلاحيات في القائمة' })
  @IsUUID('4', { each: true, message: 'كل معرّف صلاحية يجب أن يكون UUID صالحاً' })
  permissionIds!: string[];
}
