import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  db: {
    host: string;
    port: number;
    username: string;
    password?: string;
    database: string;
  };
  auth: {
    jwtSecret: string;
    csrfSecret: string;
    sessionTtlDays: number;
    sessionTtlMs: number;
    loginRateLimitWindowMinutes: number;
    loginRateLimitWindowMs: number;
    loginRateLimitMax: number;
  };
  trustProxyHops: number;
}

function validateEnv(): EnvConfig {
  const missingVars: string[] = [];

  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const portStr = process.env.PORT || '3000';
  const port = parseInt(portStr, 10);

  const dbHost = process.env.DB_HOST;
  const dbPortStr = process.env.DB_PORT || '3306';
  const dbPort = parseInt(dbPortStr, 10);
  const dbUsername = process.env.DB_USERNAME;
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbDatabase = process.env.DB_DATABASE;

  if (!dbHost) missingVars.push('DB_HOST');
  if (!dbPortStr || Number.isNaN(dbPort)) missingVars.push('DB_PORT');
  if (dbUsername === undefined || dbUsername === '') missingVars.push('DB_USERNAME');
  if (!dbDatabase) missingVars.push('DB_DATABASE');

  const authJwtSecret = process.env.AUTH_JWT_SECRET;
  if (!authJwtSecret || authJwtSecret.trim() === '') {
    missingVars.push('AUTH_JWT_SECRET');
  } else if (authJwtSecret.length < 32) {
    throw new Error('AUTH_JWT_SECRET must be at least 32 characters long.');
  }

  const authCsrfSecret = process.env.AUTH_CSRF_SECRET;
  if (!authCsrfSecret || authCsrfSecret.trim() === '') {
    missingVars.push('AUTH_CSRF_SECRET');
  } else if (authCsrfSecret.length < 32) {
    throw new Error('AUTH_CSRF_SECRET must be at least 32 characters long.');
  }

  if (missingVars.length > 0) {
    throw new Error(
      `Missing or invalid required environment variables: ${missingVars.join(', ')}`
    );
  }

  const sessionTtlDaysStr = process.env.AUTH_SESSION_TTL_DAYS || '30';
  const sessionTtlDays = parseInt(sessionTtlDaysStr, 10);
  const validSessionTtlDays = Number.isNaN(sessionTtlDays) || sessionTtlDays <= 0 ? 30 : sessionTtlDays;
  const sessionTtlMs = validSessionTtlDays * 24 * 60 * 60 * 1000;

  // Login Rate Limiting Config
  const rateLimitWindowMinutesStr = process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES || '15';
  const rateLimitWindowMinutes = parseInt(rateLimitWindowMinutesStr, 10);
  if (Number.isNaN(rateLimitWindowMinutes) || rateLimitWindowMinutes <= 0 || rateLimitWindowMinutes > 1440) {
    throw new Error('AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES must be a positive integer between 1 and 1440.');
  }
  const rateLimitWindowMs = rateLimitWindowMinutes * 60 * 1000;

  const rateLimitMaxStr = process.env.AUTH_LOGIN_RATE_LIMIT_MAX || '15';
  const rateLimitMax = parseInt(rateLimitMaxStr, 10);
  if (Number.isNaN(rateLimitMax) || rateLimitMax <= 0 || rateLimitMax > 10000) {
    throw new Error('AUTH_LOGIN_RATE_LIMIT_MAX must be a positive integer between 1 and 10000.');
  }

  // Trust Proxy Hops Config
  const trustProxyHopsStr = process.env.TRUST_PROXY_HOPS || '0';
  const trustProxyHops = parseInt(trustProxyHopsStr, 10);
  if (Number.isNaN(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 20) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 20.');
  }

  return {
    nodeEnv,
    isProduction,
    port: Number.isNaN(port) ? 3000 : port,
    db: {
      host: dbHost!,
      port: dbPort,
      username: dbUsername!,
      password: dbPassword,
      database: dbDatabase!,
    },
    auth: {
      jwtSecret: authJwtSecret!,
      csrfSecret: authCsrfSecret!,
      sessionTtlDays: validSessionTtlDays,
      sessionTtlMs,
      loginRateLimitWindowMinutes: rateLimitWindowMinutes,
      loginRateLimitWindowMs: rateLimitWindowMs,
      loginRateLimitMax: rateLimitMax,
    },
    trustProxyHops,
  };
}

export const envConfig = validateEnv();
