import { AppError } from './app.error.js';

export class UnauthorizedError extends AppError {
  constructor(
    message: string = 'يرجى تسجيل الدخول أولاً',
    code: string = 'UNAUTHORIZED',
    details?: unknown
  ) {
    super(message, 401, code, details);
  }
}
