import { ProductionTemplateEntity } from './production-template.entity.js';

export interface ProductionTemplateDto {
  id: string;
  name: string;
  code: string;
  referenceNumber: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductionTemplateListItemDto {
  id: string;
  name: string;
  code: string;
  referenceNumber: string | null;
  description: string | null;
  isActive: boolean;
  stagesCount: number;
  specsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toProductionTemplateDto(entity: ProductionTemplateEntity): ProductionTemplateDto {
  return {
    id: entity.id,
    name: entity.name,
    code: entity.code,
    referenceNumber: entity.referenceNumber,
    description: entity.description,
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toProductionTemplateListItemDto(
  entity: ProductionTemplateEntity,
  stagesCount = 0,
  specsCount = 0
): ProductionTemplateListItemDto {
  return {
    id: entity.id,
    name: entity.name,
    code: entity.code,
    referenceNumber: entity.referenceNumber,
    description: entity.description,
    isActive: entity.isActive,
    stagesCount,
    specsCount,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export interface PaginatedProductionTemplatesResult {
  items: ProductionTemplateListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}


export interface ProductionTemplateDetailSpecificationDto {
  id: string;
  name: string;
  value: string;
  unit: string | null;
  sortOrder: number;
}

export interface ProductionTemplateDetailStageDto {
  id: string;
  name: string;
  description: string | null;
  departmentId: string;
  departmentName?: string;
  departmentCode?: string;
  sortOrder: number;
  estimatedDurationMinutes: number | null;
  estimatedCost: string | null;
  plannedMaterialsCount: number;
  attachmentsCount: number;
}

export interface ProductionTemplateDetailDto {
  id: string;
  name: string;
  referenceNumber: string | null;
  code: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  specifications: ProductionTemplateDetailSpecificationDto[];
  stages: ProductionTemplateDetailStageDto[];
}

/**
 * Escapes characters that can break out of HTML/script contexts:
 * <, >, &, \u2028, \u2029
 * This guarantees safe serialization into <script type="application/json"> elements.
 */
export function safeJsonStringify(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
