import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../../common/errors/validation.error.js';

export function validateYardUpdatePayload(req: Request, _res: Response, next: NextFunction): void {
  const body = req.body as Record<string, unknown> | undefined;

  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
    throw new ValidationError(
      { body: ['جسم الطلب لا يحتوي على أي حقول قابلة للتحديث'] },
      'يجب توفير حقل واحد على الأقل للتحديث'
    );
  }

  const allowedFields = ['departmentId', 'name', 'capacity', 'description', 'isActive'];
  const hasValidField = Object.keys(body).some(
    (key) => allowedFields.includes(key) && body[key] !== undefined
  );

  if (!hasValidField) {
    throw new ValidationError(
      { body: ['لم يتم توفير أي حقل صالح للتحديث'] },
      'يجب توفير حقل واحد على الأقل من الحقول المسموحة (القسم، الاسم، السعة، الوصف، حالة التفعيل)'
    );
  }

  next();
}
