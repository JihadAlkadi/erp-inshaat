import { Request, Response, NextFunction } from 'express';
import { csrfService } from './csrf.service.js';
import { ForbiddenError } from '../../../common/errors/forbidden.error.js';

/**
 * Validates session-bound CSRF token on unsafe HTTP methods for authenticated requests.
 * MUST be executed after authentication middleware (e.g. requireApiAuth or requireWebAuth).
 */
export function validateCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (csrfService.isSafeMethod(req.method)) {
    return next();
  }

  const sessionId = req.user?.sessionId;
  if (!sessionId) {
    return next(new ForbiddenError('رمز الحماية ضد التزوير مفقود', 'CSRF_TOKEN_MISSING'));
  }

  const candidateToken = req.headers['x-csrf-token'];
  if (!candidateToken || typeof candidateToken !== 'string' || candidateToken.trim() === '') {
    return next(new ForbiddenError('رمز الحماية ضد التزوير مفقود', 'CSRF_TOKEN_MISSING'));
  }

  if (!csrfService.validateToken(sessionId, candidateToken.trim())) {
    return next(new ForbiddenError('رمز الحماية ضد التزوير غير صالح', 'CSRF_TOKEN_INVALID'));
  }

  next();
}
