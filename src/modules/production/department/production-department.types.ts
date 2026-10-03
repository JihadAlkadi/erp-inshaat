export interface SafeProductionDepartmentOutput {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  headUserId?: string | null;
  headUserName?: string | null;
  yardCount?: number;
  activeYardCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedProductionDepartmentsResult {
  items: SafeProductionDepartmentOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
