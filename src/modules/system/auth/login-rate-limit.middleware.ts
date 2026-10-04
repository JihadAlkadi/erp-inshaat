import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { envConfig } from '../../../config/env.config.js';
import { ApiResponse } from '../../../common/responses/api-response.js';

export const loginRateLimiter = rateLimit({
  windowMs: envConfig.auth.loginRateLimitWindowMs,
  limit: envConfig.auth.loginRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req: Request, res: Response): void => {
    // Calculate Retry-After in seconds
    const resetTime = (req as any).rateLimit?.resetTime;
    let retryAfterSeconds: number;

    if (resetTime instanceof Date) {
      retryAfterSeconds = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    } else {
      retryAfterSeconds = Math.max(1, Math.ceil(envConfig.auth.loginRateLimitWindowMs / 1000));
    }

    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.status(429).json(
      ApiResponse.error(
        'تم تجاوز عدد محاولات تسجيل الدخول المسموح بها. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
        'AUTH_LOGIN_RATE_LIMITED'
      )
    );
  },
});
