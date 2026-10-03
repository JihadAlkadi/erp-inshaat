import { Repository, EntityManager } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { SessionEntity } from './session.entity.js';
import { hashToken } from '../../../common/security/token-hash.util.js';

export interface CreateSessionParams {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export class SessionService {
  private readonly sessionRepository: Repository<SessionEntity>;

  constructor(sessionRepository: Repository<SessionEntity> = AppDataSource.getRepository(SessionEntity)) {
    this.sessionRepository = sessionRepository;
  }

  async createSession(params: CreateSessionParams, manager?: EntityManager): Promise<SessionEntity> {
    const repo = manager ? manager.getRepository(SessionEntity) : this.sessionRepository;
    const session = repo.create({
      id: params.id,
      userId: params.userId,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
      lastUsedAt: new Date(),
      isActive: true,
      revokedAt: null,
      revokedReason: null,
    });

    return repo.save(session);
  }

  async validateSession(
    sessionId: string,
    userId: string,
    rawToken: string
  ): Promise<SessionEntity | null> {
    const computedHash = hashToken(rawToken);

    const session = await this.sessionRepository.findOne({
      where: {
        id: sessionId,
        userId,
        tokenHash: computedHash,
        isActive: true,
      },
    });

    if (!session) {
      return null;
    }

    if (session.revokedAt !== null) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return session;
  }

  async touchSession(sessionId: string, currentLastUsedAt: Date): Promise<void> {
    const fiveMinutesMs = 5 * 60 * 1000;
    const now = Date.now();

    if (now - currentLastUsedAt.getTime() >= fiveMinutesMs) {
      await this.sessionRepository.update(sessionId, {
        lastUsedAt: new Date(),
      });
    }
  }

  async revokeSession(sessionId: string, reason: string = 'LOGOUT', manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(SessionEntity) : this.sessionRepository;
    await repo.update(
      { id: sessionId, isActive: true },
      {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason,
      }
    );
  }

  async revokeUserSessions(
    userId: string,
    reason: string = 'USER_DEACTIVATED',
    manager?: EntityManager
  ): Promise<void> {
    const repo = manager ? manager.getRepository(SessionEntity) : this.sessionRepository;
    await repo.update(
      { userId, isActive: true },
      {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason,
      }
    );
  }
}

export const sessionService = new SessionService();
