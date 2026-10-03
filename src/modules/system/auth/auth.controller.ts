import { Request, Response, NextFunction } from 'express';
import { AuthService, authService } from './auth.service.js';
import { SessionService, sessionService } from '../session/session.service.js';
import { envConfig } from '../../../config/env.config.js';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { AUTH_COOKIE_NAME } from './auth.constants.js';

export class AuthController {
  private readonly authService: AuthService;
  private readonly sessionService: SessionService;

  constructor(
    authSvc: AuthService = authService,
    sessionSvc: SessionService = sessionService
  ) {
    this.authService = authSvc;
    this.sessionService = sessionSvc;
  }

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.login(req.body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.cookie(AUTH_COOKIE_NAME, result.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: envConfig.isProduction,
        expires: result.expiresAt,
        maxAge: envConfig.auth.sessionTtlMs,
      });

      res.status(200).json(ApiResponse.success(result.user, 'تم تسجيل الدخول بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  me = (req: Request, res: Response): void => {
    res.status(200).json(ApiResponse.success(req.user));
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.sessionId) {
        await this.sessionService.revokeSession(req.user.sessionId, 'LOGOUT');
      }

      res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: envConfig.isProduction,
      });

      res.status(200).json(ApiResponse.success(null, 'تم تسجيل الخروج بنجاح'));
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
