import crypto from 'crypto';
import { envConfig } from '../../../config/env.config.js';

export class CsrfService {
  private readonly secret: string;

  constructor(secret: string = envConfig.auth.csrfSecret) {
    this.secret = secret;
  }

  /**
   * Generates a deterministic, session-bound HMAC-SHA256 CSRF token.
   * Format: HMAC-SHA256(secret, "erp-csrf-v1:<sessionId>") encoded as base64url.
   */
  generateToken(sessionId: string): string {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid sessionId provided for CSRF token generation');
    }
    return crypto
      .createHmac('sha256', this.secret)
      .update(`erp-csrf-v1:${sessionId}`)
      .digest('base64url');
  }

  /**
   * Validates a candidate CSRF token against the target sessionId using timing-safe comparison.
   */
  validateToken(sessionId: string, candidateToken: unknown): boolean {
    if (
      !sessionId ||
      typeof sessionId !== 'string' ||
      !candidateToken ||
      typeof candidateToken !== 'string'
    ) {
      return false;
    }

    try {
      const expectedToken = this.generateToken(sessionId);
      const expectedBuffer = Buffer.from(expectedToken, 'utf8');
      const candidateBuffer = Buffer.from(candidateToken, 'utf8');

      if (expectedBuffer.length !== candidateBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Evaluates whether an HTTP method is considered safe (idempotent / read-only) from CSRF perspective.
   */
  isSafeMethod(method: string): boolean {
    if (!method || typeof method !== 'string') {
      return false;
    }
    const upperMethod = method.trim().toUpperCase();
    return upperMethod === 'GET' || upperMethod === 'HEAD' || upperMethod === 'OPTIONS';
  }
}

export const csrfService = new CsrfService();
