import { IsNotEmpty, IsUUID } from 'class-validator';

export class SetProductionDepartmentHeadDto {
  @IsUUID('4', { message: 'يجب أن يكون معرف رئيس القسم بتنسيق UUID صالح' })
  @IsNotEmpty({ message: 'معرف رئيس القسم مطلوب' })
  userId!: string;
}
