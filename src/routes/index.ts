import { Router } from 'express';
import { apiRouter } from './api.route.js';
import { webRouter } from './web.route.js';

const appRouter: Router = Router();

appRouter.use('/api', apiRouter);
appRouter.use('/', webRouter);

export { appRouter };
