import { IsNotEmpty, IsUUID, IsArray, ArrayMinSize, ArrayUnique } from 'class-validator';

export class CreateProductionEngineerAssignmentDto {
  @IsUUID('4', { message: 'يجب أن يكون معرف المهندس بتنسيق UUID صالح' })
  @IsNotEmpty({ message: 'معرف المهندس مطلوب' })
  userId!: string;

  @IsArray({ message: 'يجب تقديم مصفوفة من الساحات المسندة' })
  @ArrayMinSize(1, { message: 'يجب تحديد ساحة واحدة على الأقل للمهندس' })
  @ArrayUnique({ message: 'لا يمكن تكرار نفس الساحة في التعيين' })
  @IsUUID('4', { each: true, message: 'يجب أن تكون معرفات الساحات بتنسيق UUID صالح' })
  yardIds!: string[];
}
