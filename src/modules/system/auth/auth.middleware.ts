import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { UnauthorizedError } from '../../../common/errors/unauthorized.error.js';
import { ForbiddenError } from '../../../common/errors/forbidden.error.js';
import { AuthPrincipal } from './auth.types.js';
import { csrfService } from './csrf.service.js';

export function requireApiAuth(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('jwt', { session: false }, (err: unknown, user?: AuthPrincipal | false) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return next(new UnauthorizedError('يرجى تسجيل الدخول أولاً'));
    }
    req.user = user;

    // Session-bound CSRF validation on unsafe methods for authenticated API requests
    if (!csrfService.isSafeMethod(req.method)) {
      const candidateToken = req.headers['x-csrf-token'];
      if (!candidateToken || typeof candidateToken !== 'string' || candidateToken.trim() === '') {
        return next(new ForbiddenError('رمز الحماية ضد التزوير مفقود', 'CSRF_TOKEN_MISSING'));
      }
      if (!csrfService.validateToken(user.sessionId, candidateToken.trim())) {
        return next(new ForbiddenError('رمز الحماية ضد التزوير غير صالح', 'CSRF_TOKEN_INVALID'));
      }
    }

    next();
  })(req, res, next);
}

export function requireWebAuth(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('jwt', { session: false }, (err: unknown, user?: AuthPrincipal | false) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.redirect('/login');
    }
    req.user = user;
    res.locals.user = user;
    res.locals.csrfToken = csrfService.generateToken(user.sessionId);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    // Session-bound CSRF validation on unsafe methods for authenticated Web requests
    if (!csrfService.isSafeMethod(req.method)) {
      const candidateToken = req.headers['x-csrf-token'];
      if (!candidateToken || typeof candidateToken !== 'string' || candidateToken.trim() === '') {
        return next(new ForbiddenError('رمز الحماية ضد التزوير مفقود', 'CSRF_TOKEN_MISSING'));
      }
      if (!csrfService.validateToken(user.sessionId, candidateToken.trim())) {
        return next(new ForbiddenError('رمز الحماية ضد التزوير غير صالح', 'CSRF_TOKEN_INVALID'));
      }
    }

    next();
  })(req, res, next);
}

export function redirectIfAuthenticated(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('jwt', { session: false }, (err: unknown, user?: AuthPrincipal | false) => {
    if (err) {
      return next(err);
    }
    if (user) {
      return res.redirect('/');
    }
    next();
  })(req, res, next);
}

