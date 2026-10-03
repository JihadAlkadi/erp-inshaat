import fs from 'fs';
import path from 'path';
import winston from 'winston';

const logsDir = path.resolve(process.cwd(), 'storage/logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const isDevelopment = process.env.NODE_ENV === 'development';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${stack ? `\n${stack}` : ''}`;
  })
);

const transports: winston.transport[] = [
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: logFormat,
  }),
];

if (isDevelopment) {
  transports.push(
    new winston.transports.Console({
      level: 'error',
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    })
  );
}

export const logger = winston.createLogger({
  level: 'error',
  transports,
});
