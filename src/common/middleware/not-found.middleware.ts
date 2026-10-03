import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../errors/not-found.error.js';

export function notFoundMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(new NotFoundError('الرابط أو الصفحة المطلوبة غير موجودة', 'NOT_FOUND'));
}
