import { AppError } from './app.error.js';

export class ForbiddenError extends AppError {
  constructor(
    message: string = 'ليس لديك صلاحية لتنفيذ هذا الإجراء',
    code: string = 'FORBIDDEN',
    details?: unknown
  ) {
    super(message, 403, code, details);
  }
}
