import { AppError } from './app.error.js';

export class TooManyRequestsError extends AppError {
  constructor(
    message: string = 'تم تجاوز عدد الطلبات المسموح بها. يرجى المحاولة لاحقاً',
    code: string = 'TOO_MANY_REQUESTS',
    details?: unknown
  ) {
    super(message, 429, code, details);
  }
}
