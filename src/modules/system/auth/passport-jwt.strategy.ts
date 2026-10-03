import { Request } from 'express';
import { Strategy as JwtStrategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { UserEntity } from '../user/user.entity.js';
import { sessionService } from '../session/session.service.js';
import { envConfig } from '../../../config/env.config.js';
import { AUTH_COOKIE_NAME, AUTH_JWT_ISSUER, AUTH_JWT_AUDIENCE } from './auth.constants.js';
import { JwtPayload, AuthPrincipal } from './auth.types.js';

function cookieExtractor(req: Request): string | null {
  if (req && req.cookies) {
    const token = req.cookies[AUTH_COOKIE_NAME];
    if (typeof token === 'string' && token.trim() !== '') {
      return token;
    }
  }
  return null;
}

export function createJwtStrategy(): JwtStrategy {
  const options: StrategyOptionsWithRequest = {
    jwtFromRequest: cookieExtractor,
    secretOrKey: envConfig.auth.jwtSecret,
    algorithms: ['HS256'],
    issuer: AUTH_JWT_ISSUER,
    audience: AUTH_JWT_AUDIENCE,
    passReqToCallback: true,
  };

  return new JwtStrategy(options, async (req: Request, payload: JwtPayload, done: (err: unknown, user?: AuthPrincipal | false) => void) => {
    try {
      if (!payload || !payload.sub || !payload.sid) {
        return done(null, false);
      }

      const rawToken = cookieExtractor(req);
      if (!rawToken) {
        return done(null, false);
      }

      const session = await sessionService.validateSession(payload.sid, payload.sub, rawToken);
      if (!session) {
        return done(null, false);
      }

      const userRepository = AppDataSource.getRepository(UserEntity);
      const user = await userRepository.findOne({
        where: {
          id: payload.sub,
          deletedAt: IsNull(),
        },
      });

      if (!user || !user.isActive) {
        return done(null, false);
      }

      // Await throttled touch for session last_used_at to safely handle any DB error in try/catch
      await sessionService.touchSession(session.id, session.lastUsedAt);

      const principal: AuthPrincipal = {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        roleId: user.roleId,
        sessionId: session.id,
      };

      return done(null, principal);
    } catch (error) {
      return done(error, false);
    }
  });
}
