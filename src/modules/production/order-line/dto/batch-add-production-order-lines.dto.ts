import { IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AddProductionOrderLineDto } from './add-production-order-line.dto.js';

export class BatchAddProductionOrderLinesDto {
  @IsArray({ message: 'قائمة البنود يجب أن تكون مصفوفة' })
  @ArrayMinSize(1, { message: 'يجب تقديم بند واحد على الأقل' })
  @ArrayMaxSize(100, { message: 'لا يمكن إضافة أكثر من 100 بند في المرة الواحدة' })
  @ValidateNested({ each: true })
  @Type(() => AddProductionOrderLineDto)
  lines!: AddProductionOrderLineDto[];
}
