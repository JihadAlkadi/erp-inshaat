import 'reflect-metadata';
import { Server } from 'http';
import { envConfig } from './config/env.config.js';
import { initializeDatabase } from './bootstrap/database.bootstrap.js';
import { AppDataSource } from './database/data-source.js';
import { app } from './app.js';

let server: Server | null = null;
let isShuttingDown = false;

async function bootstrap(): Promise<void> {
  try {
    await initializeDatabase();

    server = app.listen(envConfig.port, () => {
      console.log(`Server running on port ${envConfig.port}`);
    });
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

function closeHttpServer(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }

    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        server = null;
        console.log('HTTP server closed.');
        resolve();
      }
    });
  });
}

async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  try {
    await closeHttpServer();

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('Database connection closed.');
    }

    process.exitCode = 0;
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => void handleShutdown('SIGINT'));
process.on('SIGTERM', () => void handleShutdown('SIGTERM'));

void bootstrap();
