import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  nodeEnv: string;
  port: number;
  db: {
    host: string;
    port: number;
    username: string;
    password?: string;
    database: string;
  };
}

function validateEnv(): EnvConfig {
  const missingVars: string[] = [];

  const nodeEnv = process.env.NODE_ENV || 'development';
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

  if (missingVars.length > 0) {
    throw new Error(
      `Missing or invalid required environment variables: ${missingVars.join(', ')}`
    );
  }

  return {
    nodeEnv,
    port: Number.isNaN(port) ? 3000 : port,
    db: {
      host: dbHost!,
      port: dbPort,
      username: dbUsername!,
      password: dbPassword,
      database: dbDatabase!,
    },
  };
}

export const envConfig = validateEnv();
