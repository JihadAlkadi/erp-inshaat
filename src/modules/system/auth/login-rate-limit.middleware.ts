import rateLimit, { type RateLimitInfo } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { envConfig } from '../../../config/env.config.js';
import { TooManyRequestsError } from '../../../common/errors/too-many-requests.error.js';

type LoginRateLimitRequest = Request & {
  rateLimit?: RateLimitInfo;
};

export const loginRateLimiter = rateLimit({
  windowMs: envConfig.auth.loginRateLimitWindowMs,
  limit: envConfig.auth.loginRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req: Request, res: Response, next: NextFunction): void => {
    const rateLimitInfo = (req as LoginRateLimitRequest).rateLimit;
    const resetTime = rateLimitInfo?.resetTime;
    let retryAfterSeconds: number;

    if (resetTime instanceof Date) {
      retryAfterSeconds = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    } else {
      retryAfterSeconds = Math.max(1, Math.ceil(envConfig.auth.loginRateLimitWindowMs / 1000));
    }

    res.setHeader('Retry-After', retryAfterSeconds.toString());
    return next(
      new TooManyRequestsError(
        'تم تجاوز عدد محاولات تسجيل الدخول المسموح بها. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
        'AUTH_LOGIN_RATE_LIMITED'
      )
    );
  },
});
