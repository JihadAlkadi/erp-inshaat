import { AppError } from './app.error.js';

export class UnsupportedMediaTypeError extends AppError {
  constructor(
    message: string = 'نوع محتوى الطلب غير مدعوم',
    code: string = 'UNSUPPORTED_MEDIA_TYPE',
    details?: unknown
  ) {
    super(message, 415, code, details);
  }
}
