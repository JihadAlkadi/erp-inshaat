import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app.error.js';
import { ApiResponse } from '../responses/api-response.js';
import { logger } from '../logging/logger.js';

function isApiRequest(req: Request): boolean {
  return /^\/api(\/|\?|$)/.test(req.originalUrl);
}

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'حدث خطأ داخلي في النظام';
  let details: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;

    if (statusCode === 500) {
      logger.error(`AppError [${code}]: ${message}`, { details, stack: err.stack });
    }
  } else {
    if (err instanceof Error) {
      logger.error(`Unhandled System Error: ${err.message}`, { stack: err.stack });
    } else {
      logger.error(`Unhandled System Error: ${String(err)}`);
    }
  }

  if (isApiRequest(req)) {
    res.status(statusCode).json(ApiResponse.error(message, code, details));
    return;
  }

  // Web responses mapping
  try {
    if (statusCode === 403) {
      res.status(403).render('error', { layout: false, statusCode: 403, message, code });
      return;
    }

    if (statusCode === 404) {
      res.status(404).render('error', { layout: false, statusCode: 404, message, code });
      return;
    }

    // Any other error reaching Global Error Handler on Web is treated as 500
    res.status(500).render('error', {
      layout: false,
      statusCode: 500,
      message: 'حدث خطأ داخلي في النظام',
      code: 'INTERNAL_SERVER_ERROR',
    });
  } catch (renderError) {
    if (renderError instanceof Error) {
      logger.error(`Failed to render error view: ${renderError.message}`, { stack: renderError.stack });
    } else {
      logger.error(`Failed to render error view: ${String(renderError)}`);
    }

    const safeStatus = statusCode === 403 ? 403 : statusCode === 404 ? 404 : 500;
    const safeMessage =
      safeStatus === 403
        ? 'ليس لديك صلاحية للوصول إلى هذه الصفحة'
        : safeStatus === 404
          ? 'الصفحة المطلوبة غير موجودة'
          : 'حدث خطأ داخلي في النظام';

    res.status(safeStatus).send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>خطأ ${safeStatus}</title></head>
<body>
  <h1>خطأ ${safeStatus}</h1>
  <p>${safeMessage}</p>
</body>
</html>`);
  }
}
