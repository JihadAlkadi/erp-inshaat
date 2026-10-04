import path from 'path';
import express, { Express } from 'express';
import { appRouter } from './routes/index.js';
import { notFoundMiddleware } from './common/middleware/not-found.middleware.js';
import { errorHandlerMiddleware } from './common/middleware/error-handler.middleware.js';

import expressLayouts from 'express-ejs-layouts';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { initializePassport } from './bootstrap/passport.bootstrap.js';
import { envConfig } from './config/env.config.js';

const app: Express = express();

// Trust Proxy Configuration (only when explicitly configured with positive hops)
if (envConfig.trustProxyHops > 0) {
  app.set('trust proxy', envConfig.trustProxyHops);
}

// View Engine & Layouts setup
app.set('view engine', 'ejs');
app.set('views', path.resolve(process.cwd(), 'src/views'));
app.use(expressLayouts);
app.set('layout', 'dashboard/layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Static files
app.use(express.static(path.resolve(process.cwd(), 'src/public')));

// Body & Cookie parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Initialize Passport & JWT Strategy
initializePassport();
app.use(passport.initialize());

// Application Routes
app.use(appRouter);

// Not Found Handler (MUST be after all routes)
app.use(notFoundMiddleware);

// Global Error Handler (MUST be last middleware)
app.use(errorHandlerMiddleware);

export { app };
