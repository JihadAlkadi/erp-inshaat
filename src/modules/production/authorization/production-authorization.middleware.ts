import { Request, Response, NextFunction, RequestHandler } from 'express';
import { UnauthorizedError } from '../../../common/errors/unauthorized.error.js';
import { ForbiddenError } from '../../../common/errors/forbidden.error.js';
import { getProductionAccessPolicy } from './production-authorization-context.js';

/**
 * Middleware that verifies the authenticated principal has at least some effective access (Global or Scoped)
 * for the requested production permission.
 * Target-specific row authorization is subsequently enforced in the Service/QueryBuilder layers.
 */
export function requireProductionAccess(permissionName: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError('يرجى تسجيل الدخول أولاً'));
      }

      const policy = await getProductionAccessPolicy(req, req.user, permissionName);

      if (!policy.hasAnyAccess) {
        return next(
          new ForbiddenError(
            'ليس لديك صلاحية لتنفيذ هذا الإجراء على هذا النطاق',
            'ACCESS_SCOPE_DENIED'
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
