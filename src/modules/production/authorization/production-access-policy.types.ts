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

export interface SpecificDepartmentScopePayload {
  source: string;
  departmentIds: string[];
}

export interface SpecificYardScopePayload {
  source: string;
  yardIds: string[];
}

export function isCurrentProductionResponsibilityScope(
  scope: unknown
): scope is ProductionScopePayload {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
    return false;
  }
  const keys = Object.keys(scope);
  if (keys.length !== 1 || keys[0] !== 'source') {
    return false;
  }
  const candidate = scope as Record<string, unknown>;
  return candidate.source === ProductionAccessScopeSource.CURRENT_RESPONSIBILITY;
}

export function isSpecificDepartmentScope(
  scope: unknown
): scope is SpecificDepartmentScopePayload {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
    return false;
  }
  const keys = Object.keys(scope);
  if (keys.length !== 2) {
    return false;
  }
  const candidate = scope as Record<string, unknown>;
  if (candidate.source !== ProductionAccessScopeSource.SPECIFIC_IDS) {
    return false;
  }
  if (!Array.isArray(candidate.departmentIds)) {
    return false;
  }
  if (candidate.departmentIds.length === 0) {
    return false;
  }
  for (const id of candidate.departmentIds) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      return false;
    }
  }
  return true;
}

export function isSpecificYardScope(
  scope: unknown
): scope is SpecificYardScopePayload {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
    return false;
  }
  const keys = Object.keys(scope);
  if (keys.length !== 2) {
    return false;
  }
  const candidate = scope as Record<string, unknown>;
  if (candidate.source !== ProductionAccessScopeSource.SPECIFIC_IDS) {
    return false;
  }
  if (!Array.isArray(candidate.yardIds)) {
    return false;
  }
  if (candidate.yardIds.length === 0) {
    return false;
  }
  for (const id of candidate.yardIds) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      return false;
    }
  }
  return true;
}
