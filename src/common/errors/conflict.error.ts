import { AppError } from './app.error.js';

export class ConflictError extends AppError {
  constructor(
    message: string = 'البيانات المدخلة موجودة مسبقاً أو تتعارض مع سجل حالي',
    code: string = 'CONFLICT',
    details?: unknown
  ) {
    super(message, 409, code, details);
  }
}
