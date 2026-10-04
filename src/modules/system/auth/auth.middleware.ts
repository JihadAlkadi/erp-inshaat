import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { UnauthorizedError } from '../../../common/errors/unauthorized.error.js';
import { AuthPrincipal } from './auth.types.js';
import { csrfService } from './csrf.service.js';
import { validateCsrfToken } from './csrf.middleware.js';

export function requireApiAuth(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('jwt', { session: false }, (err: unknown, user?: AuthPrincipal | false) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return next(new UnauthorizedError('يرجى تسجيل الدخول أولاً'));
    }
    req.user = user;

    return validateCsrfToken(req, res, next);
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

    return validateCsrfToken(req, res, next);
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
