import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../../common/errors/validation.error.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

export function validateRoleUpdatePayload(req: Request, _res: Response, next: NextFunction): void {
  const dto = req.body as UpdateRoleDto;
  if (
    !dto ||
    (dto.name === undefined &&
      dto.description === undefined &&
      dto.isActive === undefined)
  ) {
    next(
      new ValidationError({
        payload: ['يجب تقديم حقل واحد على الأقل لتحديث بيانات الدور'],
      })
    );
    return;
  }
  next();
}
