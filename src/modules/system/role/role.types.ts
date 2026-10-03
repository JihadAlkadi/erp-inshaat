export interface SafeRoleOutput {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  userCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedRolesResult {
  items: SafeRoleOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RolePermissionState {
  permissionId: string;
  name: string;
  description: string | null;
  hasAllowAll: boolean;
  hasDenyAll: boolean;
  effectiveGlobalAccess: boolean;
}

export interface RoleGlobalPermissionsResponse {
  role: SafeRoleOutput;
  permissions: RolePermissionState[];
  isSystemAdmin: boolean;
}
