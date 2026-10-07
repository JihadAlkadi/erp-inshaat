import { ProductionOrderLineDto } from '../order-line/production-order-line.types.js';

export { ProductionOrderStatus } from './production-order.entity.js';

export interface ProductionOrderUserSummaryDto {
  id: string;
  fullName: string;
}

export interface ProductionOrderSummaryDto {
  lineCount: number;
  totalQuantity: number;
}

export interface ProductionOrderDto {
  id: string;
  orderNumber: string;
  status: string;
  description: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUser?: ProductionOrderUserSummaryDto;
  summary: ProductionOrderSummaryDto;
  lines?: ProductionOrderLineDto[];
}

export interface ProductionOrderListItemDto {
  id: string;
  orderNumber: string;
  status: string;
  description: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUser?: ProductionOrderUserSummaryDto;
  summary: ProductionOrderSummaryDto;
}

export interface PaginatedProductionOrdersResult {
  items: ProductionOrderListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductionOrderReadinessIssueDto {
  code: string;
  lineId?: string;
  patternId?: string;
  message: string;
}

export interface ProductionOrderReadinessDto {
  ready: boolean;
  issues: ProductionOrderReadinessIssueDto[];
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
