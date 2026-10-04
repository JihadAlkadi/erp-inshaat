import { ApplicableAccessRule } from '../../system/authorization/authorization.types.js';
import { isValidAllScope } from '../../system/authorization/access-rule-scope.util.js';
import {
  ProductionAccessScopeType,
} from './production-access-scope.constants.js';
import {
  isCurrentProductionResponsibilityScope,
  isSpecificDepartmentScope,
  isSpecificYardScope,
  ProductionResponsibility,
  ResolvedProductionAccessPolicy,
} from './production-access-policy.types.js';

export class ProductionAccessPolicyService {
  /**
   * Pure evaluation function: transforms applicable access rules and resolved production responsibility
   * into a deterministic ResolvedProductionAccessPolicy.
   * Rules:
   * 1. DENY ALL wins over everything.
   * 2. Valid ALL requires scope === null. Malformed ALLOW ALL grants nothing.
   * 3. Unknown / Malformed DENY scopes fail closed (denyAll = true).
   * 4. Inconsistent responsibility state fails closed for dynamic ALLOW rules.
   * 5. Specific ID rules do not depend on operational responsibility consistency.
   */
  resolvePolicy(
    rules: ApplicableAccessRule[],
    responsibility: ProductionResponsibility,
    permissionName: string
  ): ResolvedProductionAccessPolicy {
    let allowAll = false;
    let denyAll = false;

    const allowDepartmentIds = new Set<string>();
    const denyDepartmentIds = new Set<string>();
    const allowYardIds = new Set<string>();
    const denyYardIds = new Set<string>();

    for (const rule of rules) {
      if (rule.scopeType === 'ALL') {
        const isValidAll = isValidAllScope(rule.scope);
        if (rule.effect === 'DENY') {
          denyAll = true;
        } else if (rule.effect === 'ALLOW' && isValidAll) {
          allowAll = true;
        }
        continue;
      }

      if (rule.scopeType === ProductionAccessScopeType.DEPARTMENT) {
        if (isCurrentProductionResponsibilityScope(rule.scope)) {
          if (!responsibility.isConsistent) {
            if (rule.effect === 'DENY') {
              denyAll = true;
            }
            // Inconsistent responsibility cannot grant ALLOW
            continue;
          }

          // Valid dynamic department scope for consistent responsibility
          if (responsibility.headDepartmentId !== null) {
            if (rule.effect === 'ALLOW') {
              allowDepartmentIds.add(responsibility.headDepartmentId);
            } else if (rule.effect === 'DENY') {
              denyDepartmentIds.add(responsibility.headDepartmentId);
            }
          }
          // If engineer only, department scope does not grant whole department
          continue;
        }

        if (isSpecificDepartmentScope(rule.scope)) {
          // Specific department IDs do not depend on responsibility consistency
          if (rule.effect === 'ALLOW') {
            for (const deptId of rule.scope.departmentIds) {
              allowDepartmentIds.add(deptId);
            }
          } else if (rule.effect === 'DENY') {
            for (const deptId of rule.scope.departmentIds) {
              denyDepartmentIds.add(deptId);
            }
          }
          continue;
        }

        // Malformed / Unknown department scope
        if (rule.effect === 'DENY') {
          denyAll = true;
        }
        // Unknown ALLOW grants nothing
        continue;
      }

      if (rule.scopeType === ProductionAccessScopeType.YARD) {
        if (isCurrentProductionResponsibilityScope(rule.scope)) {
          if (!responsibility.isConsistent) {
            if (rule.effect === 'DENY') {
              denyAll = true;
            }
            continue;
          }

          // Valid dynamic yard scope for consistent responsibility
          if (responsibility.engineerDepartmentId !== null) {
            if (rule.effect === 'ALLOW') {
              for (const yardId of responsibility.engineerYardIds) {
                allowYardIds.add(yardId);
              }
            } else if (rule.effect === 'DENY') {
              for (const yardId of responsibility.engineerYardIds) {
                denyYardIds.add(yardId);
              }
            }
          }
          // If Head, yard scope does not expand manually here; Head uses Department scope
          continue;
        }

        if (isSpecificYardScope(rule.scope)) {
          // Specific yard IDs do not depend on responsibility consistency
          if (rule.effect === 'ALLOW') {
            for (const yardId of rule.scope.yardIds) {
              allowYardIds.add(yardId);
            }
          } else if (rule.effect === 'DENY') {
            for (const yardId of rule.scope.yardIds) {
              denyYardIds.add(yardId);
            }
          }
          continue;
        }

        // Malformed / Unknown yard scope
        if (rule.effect === 'DENY') {
          denyAll = true;
        }
        // Unknown ALLOW grants nothing
        continue;
      }

      // Unknown / unsupported scopeType
      if (rule.effect === 'DENY') {
        denyAll = true;
      }
      // Unknown ALLOW grants nothing
    }

    const allowDeptArray = Array.from(allowDepartmentIds).sort();
    const denyDeptArray = Array.from(denyDepartmentIds).sort();
    const allowYardArray = Array.from(allowYardIds).sort();
    const denyYardArray = Array.from(denyYardIds).sort();

    const hasAnyAccess = !denyAll && (allowAll || allowDeptArray.length > 0 || allowYardArray.length > 0);

    return {
      permissionName,
      allowAll,
      denyAll,
      allowDepartmentIds: allowDeptArray,
      denyDepartmentIds: denyDeptArray,
      allowYardIds: allowYardArray,
      denyYardIds: denyYardArray,
      hasAnyAccess,
    };
  }
}

export const productionAccessPolicyService = new ProductionAccessPolicyService();
