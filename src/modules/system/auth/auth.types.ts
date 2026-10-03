export interface SafeUser {
  id: string;
  fullName: string;
  phone: string;
  roleId: string;
}

export interface AuthPrincipal extends SafeUser {
  sessionId: string;
}

export interface JwtPayload {
  sub: string;
  sid: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

export interface LoginResult {
  user: SafeUser;
  token: string;
  expiresAt: Date;
  sessionId: string;
}

declare global {
  namespace Express {
    interface User extends AuthPrincipal {}
  }
}
