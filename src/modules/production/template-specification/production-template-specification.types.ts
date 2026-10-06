import { ProductionTemplateSpecificationEntity } from './production-template-specification.entity.js';

export interface ProductionTemplateSpecificationDto {
  id: string;
  templateId: string;
  name: string;
  value: string;
  unit: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toProductionTemplateSpecificationDto(
  spec: ProductionTemplateSpecificationEntity
): ProductionTemplateSpecificationDto {
  return {
    id: spec.id,
    templateId: spec.templateId,
    name: spec.name,
    value: spec.value,
    unit: spec.unit,
    sortOrder: spec.sortOrder,
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt,
  };
}

