export interface SafeProductionYardOutput {
  id: string;
  departmentId: string;
  departmentName: string;
  name: string;
  code: string;
  capacity: number;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedProductionYardsResult {
  items: SafeProductionYardOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
