import { Request, Response, NextFunction } from 'express';
import { UnsupportedMediaTypeError } from '../../../common/errors/unsupported-media-type.error.js';

/**
 * Ensures POST /api/auth/login requests provide a valid application/json Content-Type.
 * Rejects application/x-www-form-urlencoded, multipart/form-data, text/plain, and missing Content-Type
 * to eliminate Login CSRF via cross-origin HTML form submissions.
 */
export function requireLoginJsonContentType(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.is('application/json')) {
    return next(
      new UnsupportedMediaTypeError(
        'تسجيل الدخول يقبل طلبات JSON فقط',
        'AUTH_LOGIN_JSON_REQUIRED'
      )
    );
  }

  next();
}
