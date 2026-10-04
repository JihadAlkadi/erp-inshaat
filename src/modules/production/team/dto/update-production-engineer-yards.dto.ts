import { IsArray, ArrayMinSize, ArrayUnique, IsUUID } from 'class-validator';

export class UpdateProductionEngineerYardsDto {
  @IsArray({ message: 'يجب تقديم مصفوفة من الساحات المسندة' })
  @ArrayMinSize(1, { message: 'يجب تحديد ساحة واحدة على الأقل للمهندس' })
  @ArrayUnique({ message: 'لا يمكن تكرار نفس الساحة في التعيين' })
  @IsUUID('4', { each: true, message: 'يجب أن تكون معرفات الساحات بتنسيق UUID صالح' })
  yardIds!: string[];
}
