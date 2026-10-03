import { DataSource } from 'typeorm';
import { AppDataSource } from '../database/data-source.js';

export async function initializeDatabase(): Promise<DataSource> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    console.log('Database connected successfully');
  }
  return AppDataSource;
}
