import { ProductionTemplateEntity } from './production-template.entity.js';

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

export interface PaginatedProductionTemplatesResult {
  items: Array<ProductionTemplateEntity & { stagesCount: number; specsCount: number }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
