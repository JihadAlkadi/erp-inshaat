export interface ProductionTemplateStageMaterialDto {
  id: string;
  stageId: string;
  productId: string;
  productUnitId: string;
  plannedQuantity: string;
  createdAt: Date;
  updatedAt: Date;
  product?: {
    id: string;
    name: string;
    code: string;
  };
  productUnit?: {
    id: string;
    name: string;
    isBase?: boolean;
  };
}
