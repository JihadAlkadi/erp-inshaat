import { Request, Response, NextFunction, RequestHandler } from 'express';
import { UnauthorizedError } from '../../../common/errors/unauthorized.error.js';
import { ForbiddenError } from '../../../common/errors/forbidden.error.js';
import { authorizationService, AuthorizationService } from './authorization.service.js';

export function requirePermission(
  permissionName: string,
  authzService: AuthorizationService = authorizationService
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError('يرجى تسجيل الدخول أولاً'));
      }

      const isAllowed = await authzService.hasPermission(req.user, permissionName);
      if (!isAllowed) {
        return next(
          new ForbiddenError('ليس لديك صلاحية لتنفيذ هذا الإجراء', 'PERMISSION_DENIED')
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
