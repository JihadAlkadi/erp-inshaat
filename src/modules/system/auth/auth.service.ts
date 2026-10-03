import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { UserEntity } from '../user/user.entity.js';
import { SessionService, sessionService } from '../session/session.service.js';
import { envConfig } from '../../../config/env.config.js';
import { comparePassword } from '../../../common/security/password.util.js';
import { hashToken } from '../../../common/security/token-hash.util.js';
import { UnauthorizedError } from '../../../common/errors/unauthorized.error.js';
import { ForbiddenError } from '../../../common/errors/forbidden.error.js';
import { LoginDto } from './dto/login.dto.js';
import { AUTH_JWT_ISSUER, AUTH_JWT_AUDIENCE } from './auth.constants.js';
import { LoginResult, JwtPayload } from './auth.types.js';

export interface AuthContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuthService {
  private readonly userRepository: Repository<UserEntity>;
  private readonly sessionService: SessionService;

  constructor(
    userRepository: Repository<UserEntity> = AppDataSource.getRepository(UserEntity),
    sessionSvc: SessionService = sessionService
  ) {
    this.userRepository = userRepository;
    this.sessionService = sessionSvc;
  }

  async login(dto: LoginDto, context: AuthContext): Promise<LoginResult> {
    const user = await this.userRepository.findOne({
      where: {
        phone: dto.phone,
        deletedAt: IsNull(),
      },
    });

    if (!user) {
      throw new UnauthorizedError('رقم الهاتف أو كلمة المرور غير صحيحة');
    }

    const isPasswordValid = await comparePassword(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('رقم الهاتف أو كلمة المرور غير صحيحة');
    }

    if (!user.isActive) {
      throw new ForbiddenError('الحساب غير فعّال، يرجى مراجعة إدارة النظام');
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + envConfig.auth.sessionTtlMs);

    const payload: JwtPayload = {
      sub: user.id,
      sid: sessionId,
    };

    const token = jwt.sign(payload, envConfig.auth.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: `${envConfig.auth.sessionTtlDays}d`,
      issuer: AUTH_JWT_ISSUER,
      audience: AUTH_JWT_AUDIENCE,
    });

    const tokenHash = hashToken(token);

    await this.sessionService.createSession({
      id: sessionId,
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        roleId: user.roleId,
      },
      token,
      expiresAt,
      sessionId,
    };
  }
}

export const authService = new AuthService();
