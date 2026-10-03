export interface SafeUserOutput {
  id: string;
  fullName: string;
  phone: string;
  roleId: string;
  roleName?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedUsersResult {
  items: SafeUserOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
