export interface InventoryProductUnitSpecification {
  name: string;
  value: string;
  unit?: string | null;
}

export interface InventoryProductListItemDto {
  id: string;
  name: string;
  code: string;
  categoryId: string | null;
  categoryName: string | null;
  locationName: string | null;
  baseUnitId: string | null;
  baseUnitName: string | null;
  isActive: boolean;
  unitCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryProductDetailDto {
  id: string;
  name: string;
  code: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  locationName: string | null;
  baseUnitId: string;
  baseUnitName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: {
    id: string;
    name: string;
    code: string;
  } | null;
  baseUnit?: {
    id: string;
    name: string;
    barcode: string | null;
    price: string;
    specifications: InventoryProductUnitSpecification[] | null;
  } | null;
}

export interface InventoryProductUnitDto {
  id: string;
  productId: string;
  name: string;
  barcode: string | null;
  price: string;
  isBase: boolean;
  equivalentToUnitId: string | null;
  equivalentToUnitName: string | null;
  conversionQuantity: string | null;
  specifications: InventoryProductUnitSpecification[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedProductsResult {
  items: InventoryProductListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedProductUnitsResult {
  items: InventoryProductUnitDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
