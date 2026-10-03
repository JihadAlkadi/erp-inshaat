import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseConfig } from '../config/database.config.js';

export const AppDataSource = new DataSource(databaseConfig);
