import crypto from 'crypto';

/**
 * Computes SHA-256 hash of a raw token (hex string of 64 characters)
 * Used to store only hashed JWTs inside system_session.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
