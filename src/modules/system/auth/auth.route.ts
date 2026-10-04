import { Router } from 'express';
import { validateDto } from '../../../common/middleware/validate-dto.middleware.js';
import { LoginDto } from './dto/login.dto.js';
import { authController } from './auth.controller.js';
import { requireApiAuth } from './auth.middleware.js';
import { loginRateLimiter } from './login-rate-limit.middleware.js';
import { requireLoginJsonContentType } from './login-json-content-type.middleware.js';

const authRouter: Router = Router();

// POST /api/auth/login
authRouter.post(
  '/login',
  loginRateLimiter,
  requireLoginJsonContentType,
  validateDto(LoginDto),
  authController.login
);

// GET /api/auth/me
authRouter.get('/me', requireApiAuth, authController.me);

// POST /api/auth/logout
authRouter.post('/logout', requireApiAuth, authController.logout);

export { authRouter };
