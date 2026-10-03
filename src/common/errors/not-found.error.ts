import { AppError } from './app.error.js';

export class NotFoundError extends AppError {
  constructor(
    message: string = 'المورد المطلوب غير موجود',
    code: string = 'NOT_FOUND',
    details?: unknown
  ) {
    super(message, 404, code, details);
  }
}
