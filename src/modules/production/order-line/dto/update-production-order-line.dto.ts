import { IsNotEmpty, IsInt, Min, Max } from 'class-validator';

export class UpdateProductionOrderLineDto {
  @IsNotEmpty({ message: 'الكمية مطلوبة' })
  @IsInt({ message: 'الكمية يجب أن تكون عدداً صحيحاً' })
  @Min(1, { message: 'الكمية يجب أن تكون 1 على الأقل' })
  @Max(10000, { message: 'الكمية لا يمكن أن تتجاوز 10,000' })
  quantity!: number;
}
