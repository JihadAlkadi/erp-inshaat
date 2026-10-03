import { Request, Response, NextFunction, RequestHandler } from 'express';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { validate, ValidationError as ClassValidatorValidationError } from 'class-validator';
import { ValidationError } from '../errors/validation.error.js';

function formatValidationErrors(
  errors: ClassValidatorValidationError[],
  parentPath: string = ''
): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const error of errors) {
    const propertyPath = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      formatted[propertyPath] = Object.values(error.constraints);
    }

    if (error.children && error.children.length > 0) {
      const childErrors = formatValidationErrors(error.children, propertyPath);
      for (const [key, messages] of Object.entries(childErrors)) {
        if (formatted[key]) {
          formatted[key].push(...messages);
        } else {
          formatted[key] = messages;
        }
      }
    }
  }

  return formatted;
}

export function validateQueryDto<T extends object>(dtoClass: ClassConstructor<T>): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const dtoInstance = plainToInstance(dtoClass, req.query ?? {}, {
        enableImplicitConversion: true,
      });

      const errors = await validate(dtoInstance, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      if (errors.length > 0) {
        const fieldErrors = formatValidationErrors(errors);
        next(new ValidationError(fieldErrors));
        return;
      }

      req.query = dtoInstance as unknown as Request['query'];
      next();
    } catch (error) {
      next(error);
    }
  };
}
