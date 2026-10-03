import { AppError } from './app.error.js';

export class BusinessRuleError extends AppError {
  constructor(
    message: string = 'انتهاك لقواعد العمل',
    code: string = 'BUSINESS_RULE_VIOLATION',
    details?: unknown
  ) {
    super(message, 400, code, details);
  }
}
