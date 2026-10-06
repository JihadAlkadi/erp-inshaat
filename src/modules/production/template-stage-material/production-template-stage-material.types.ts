import { ProductionTemplateStageMaterialEntity } from './production-template-stage-material.entity.js';

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

export function toStageMaterialDto(
  mat: ProductionTemplateStageMaterialEntity
): ProductionTemplateStageMaterialDto {
  return {
    id: mat.id,
    stageId: mat.stageId,
    productId: mat.productId,
    productUnitId: mat.productUnitId,
    plannedQuantity: String(mat.plannedQuantity),
    createdAt: mat.createdAt,
    updatedAt: mat.updatedAt,
    product: mat.product
      ? {
          id: mat.product.id,
          name: mat.product.name,
          code: mat.product.code,
        }
      : undefined,
    productUnit: mat.productUnit
      ? {
          id: mat.productUnit.id,
          name: mat.productUnit.name,
          isBase: Boolean(mat.product?.baseUnitId && mat.productUnit.id === mat.product.baseUnitId),
        }
      : undefined,
  };
}
