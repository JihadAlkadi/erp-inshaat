import { SafeRoleOutput } from '../../role/role.types.js';
import { SafeUserOutput } from '../../user/user.types.js';
import {
  AccessScopePresetType,
  PresetDefinition,
} from './access-scope-preset.constants.js';

export interface AccessRuleTargetSummary {
  id: string;
  name: string;
  code?: string;
  isActive?: boolean;
  isAvailable: boolean;
  departmentName?: string;
}

export interface AccessRuleSummary {
  id: string;
  permissionGrantId: string;
  effect: 'ALLOW' | 'DENY';
  scopeType: string;
  isValid: boolean;
  preset: AccessScopePresetType | null;
  presetLabel: string;
  validationErrorCode?: string;
  validationErrorMessage?: string;
  targetIds: string[];
  targets: AccessRuleTargetSummary[];
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RolePermissionAdminItem {
  permissionId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  activeGrantCount: number;
  allowRuleCount: number;
  denyRuleCount: number;
  activeRuleCount: number;
  hasAnyAllow: boolean;
  hasAnyDeny: boolean;
  hasAllowAll: boolean;
  hasDenyAll: boolean;
  capabilities: PresetDefinition[];
  rules: AccessRuleSummary[];
  summary: string;
}

export interface RolePermissionsAdminResponse {
  role: SafeRoleOutput;
  permissions: RolePermissionAdminItem[];
  isSystemAdmin: boolean;
}

export interface UserPermissionGrantScopeSummary {
  enabled: boolean;
  allowRuleCount: number;
  denyRuleCount: number;
  hasAllowAll: boolean;
  hasDenyAll: boolean;
  rules: AccessRuleSummary[];
  summary: string;
}

export interface UserEffectiveScopeSummary {
  hasAnyAllow: boolean;
  hasAnyDenyAll: boolean;
  summary: string;
}

export interface UserPermissionAdminItem {
  permissionId: string;
  name: string;
  description: string | null;
  role: UserPermissionGrantScopeSummary;
  direct: UserPermissionGrantScopeSummary;
  effective: UserEffectiveScopeSummary;
  capabilities: PresetDefinition[];
}

export interface UserPermissionsAdminResponse {
  user: SafeUserOutput;
  permissions: UserPermissionAdminItem[];
  isSelf: boolean;
}
