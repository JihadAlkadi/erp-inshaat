import { ProductionAccessScopeSource } from './production-access-scope.constants.js';

export interface ResolvedProductionAccessPolicy {
  permissionName: string;

  allowAll: boolean;
  denyAll: boolean;

  allowDepartmentIds: string[];
  denyDepartmentIds: string[];

  allowYardIds: string[];
  denyYardIds: string[];

  hasAnyAccess: boolean;
}

export interface ProductionResponsibility {
  headDepartmentId: string | null;
  engineerDepartmentId: string | null;
  engineerYardIds: string[];
  isConsistent: boolean;
}

export interface ProductionScopePayload {
  source: string;
}

export function isCurrentProductionResponsibilityScope(
  scope: unknown
): scope is ProductionScopePayload {
  if (typeof scope !== 'object' || scope === null) {
    return false;
  }
  const candidate = scope as Record<string, unknown>;
  return candidate.source === ProductionAccessScopeSource.CURRENT_RESPONSIBILITY;
}
