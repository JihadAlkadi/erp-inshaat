import { Request } from 'express';
import { AuthPrincipal } from '../../system/auth/auth.types.js';
import { authorizationService, AuthorizationService } from '../../system/authorization/authorization.service.js';
import {
  ProductionResponsibilityResolver,
  productionResponsibilityResolver,
} from './production-responsibility.resolver.js';
import {
  ProductionAccessPolicyService,
  productionAccessPolicyService,
} from './production-access-policy.service.js';
import {
  ProductionResponsibility,
  ResolvedProductionAccessPolicy,
} from './production-access-policy.types.js';

// Request-scoped WeakMaps to ensure automatic garbage collection per Request lifecycle without memory leaks
const responsibilityCache = new WeakMap<Request, Promise<ProductionResponsibility>>();
const policyCache = new WeakMap<Request, Map<string, Promise<ResolvedProductionAccessPolicy>>>();

/**
 * Retrieves the resolved Production Responsibility for the principal within the current request scope.
 * Resolves exactly once per request.
 */
export function getProductionResponsibility(
  req: Request,
  principal: AuthPrincipal,
  resolver: ProductionResponsibilityResolver = productionResponsibilityResolver
): Promise<ProductionResponsibility> {
  let cachedPromise = responsibilityCache.get(req);
  if (!cachedPromise) {
    cachedPromise = resolver.resolve(principal);
    responsibilityCache.set(req, cachedPromise);
  }
  return cachedPromise;
}

/**
 * Retrieves the ResolvedProductionAccessPolicy for the given permission and principal within the current request scope.
 * Caches by permission name per request, ensuring no duplicate DB queries between Middleware, Controllers, or Web views.
 */
export function getProductionAccessPolicy(
  req: Request,
  principal: AuthPrincipal,
  permissionName: string,
  authzService: AuthorizationService = authorizationService,
  policyService: ProductionAccessPolicyService = productionAccessPolicyService,
  respResolver: ProductionResponsibilityResolver = productionResponsibilityResolver
): Promise<ResolvedProductionAccessPolicy> {
  let requestPolicyMap = policyCache.get(req);
  if (!requestPolicyMap) {
    requestPolicyMap = new Map<string, Promise<ResolvedProductionAccessPolicy>>();
    policyCache.set(req, requestPolicyMap);
  }

  let cachedPolicyPromise = requestPolicyMap.get(permissionName);
  if (!cachedPolicyPromise) {
    cachedPolicyPromise = (async () => {
      const rules = await authzService.getApplicableAccessRules(principal, permissionName);

      // Check if any rule requires dynamic production responsibility
      const needsResponsibility = rules.some(
        (r) => r.scopeType === 'PRODUCTION_DEPARTMENT' || r.scopeType === 'PRODUCTION_YARD'
      );

      let responsibility: ProductionResponsibility = {
        headDepartmentId: null,
        engineerDepartmentId: null,
        engineerYardIds: [],
        isConsistent: true,
      };

      if (needsResponsibility) {
        responsibility = await getProductionResponsibility(req, principal, respResolver);
      }

      return policyService.resolvePolicy(rules, responsibility, permissionName);
    })();

    requestPolicyMap.set(permissionName, cachedPolicyPromise);
  }

  return cachedPolicyPromise;
}
