import passport from 'passport';
import { createJwtStrategy } from '../modules/system/auth/passport-jwt.strategy.js';

export function initializePassport(): void {
  passport.use('jwt', createJwtStrategy());
}
