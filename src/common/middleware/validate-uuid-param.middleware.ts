import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ValidationError } from '../errors/validation.error.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateUuidParam(paramName: string = 'id'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
      next(
        new ValidationError({
          [paramName]: [`المعرف ${paramName} يجب أن يكون UUID صالحاً`],
        })
      );
      return;
    }
    next();
  };
}
