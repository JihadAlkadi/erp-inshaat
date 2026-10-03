import 'reflect-metadata';
import { Server } from 'http';
import { envConfig } from './config/env.config.js';
import { initializeDatabase } from './bootstrap/database.bootstrap.js';
import { AppDataSource } from './database/data-source.js';
import { app } from './app.js';

let server: Server | null = null;

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

async function handleShutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  if (server) {
    server.close(() => {
      console.log('HTTP server closed.');
    });
  }

  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('Database connection closed.');
  }

  process.exit(0);
}

process.on('SIGINT', () => void handleShutdown('SIGINT'));
process.on('SIGTERM', () => void handleShutdown('SIGTERM'));

void bootstrap();
