import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../../common/errors/validation.error.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

export function validateUserUpdatePayload(req: Request, _res: Response, next: NextFunction): void {
  const dto = req.body as UpdateUserDto;
  if (
    !dto ||
    (dto.fullName === undefined &&
      dto.phone === undefined &&
      dto.roleId === undefined &&
      dto.isActive === undefined)
  ) {
    next(
      new ValidationError({
        payload: ['يجب تقديم حقل واحد على الأقل لتحديث البيانات'],
      })
    );
    return;
  }
  next();
}
