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

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_REGEX.test(value);
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
  if (
    keys.length !== 2 ||
    !keys.includes('source') ||
    !keys.includes('departmentIds')
  ) {
    return false;
  }
  const candidate = scope as Record<string, unknown>;
  if (candidate.source !== ProductionAccessScopeSource.SPECIFIC_IDS) {
    return false;
  }
  if (!Array.isArray(candidate.departmentIds)) {
    return false;
  }
  const ids = candidate.departmentIds;
  if (ids.length < 1 || ids.length > 200) {
    return false;
  }
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!isUuidV4(id)) {
      return false;
    }
    if (i > 0 && !(ids[i - 1] < id)) {
      // Must be unique and canonical sorted ascending
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
  if (
    keys.length !== 2 ||
    !keys.includes('source') ||
    !keys.includes('yardIds')
  ) {
    return false;
  }
  const candidate = scope as Record<string, unknown>;
  if (candidate.source !== ProductionAccessScopeSource.SPECIFIC_IDS) {
    return false;
  }
  if (!Array.isArray(candidate.yardIds)) {
    return false;
  }
  const ids = candidate.yardIds;
  if (ids.length < 1 || ids.length > 200) {
    return false;
  }
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!isUuidV4(id)) {
      return false;
    }
    if (i > 0 && !(ids[i - 1] < id)) {
      // Must be unique and canonical sorted ascending
      return false;
    }
  }
  return true;
}
