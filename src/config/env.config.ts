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

function parseStrictIntegerEnv(
  name: string,
  rawValue: string | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (rawValue === undefined || rawValue === '') {
    return defaultValue;
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  const parsed = Number(rawValue);

  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
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

  if (authJwtSecret && authCsrfSecret && authJwtSecret === authCsrfSecret) {
    throw new Error('AUTH_CSRF_SECRET must be different from AUTH_JWT_SECRET.');
  }

  if (missingVars.length > 0) {
    throw new Error(
      `Missing or invalid required environment variables: ${missingVars.join(', ')}`
    );
  }

  const sessionTtlDays = parseStrictIntegerEnv(
    'AUTH_SESSION_TTL_DAYS',
    process.env.AUTH_SESSION_TTL_DAYS,
    30,
    1,
    3650
  );
  const sessionTtlMs = sessionTtlDays * 24 * 60 * 60 * 1000;

  // Login Rate Limiting Config
  const rateLimitWindowMinutes = parseStrictIntegerEnv(
    'AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES',
    process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES,
    15,
    1,
    1440
  );
  const rateLimitWindowMs = rateLimitWindowMinutes * 60 * 1000;

  const rateLimitMax = parseStrictIntegerEnv(
    'AUTH_LOGIN_RATE_LIMIT_MAX',
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX,
    15,
    1,
    10000
  );

  // Trust Proxy Hops Config
  const trustProxyHops = parseStrictIntegerEnv(
    'TRUST_PROXY_HOPS',
    process.env.TRUST_PROXY_HOPS,
    0,
    0,
    20
  );

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
      sessionTtlDays,
      sessionTtlMs,
      loginRateLimitWindowMinutes: rateLimitWindowMinutes,
      loginRateLimitWindowMs: rateLimitWindowMs,
      loginRateLimitMax: rateLimitMax,
    },
    trustProxyHops,
  };
}

export const envConfig = validateEnv();
