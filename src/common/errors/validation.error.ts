import { AppError } from './app.error.js';

export class ValidationError extends AppError {
  constructor(
    details?: Record<string, string[]>,
    message: string = 'بيانات الإدخال غير صحيحة',
    code: string = 'VALIDATION_ERROR'
  ) {
    super(message, 400, code, details);
  }
}
