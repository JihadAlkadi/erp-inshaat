import { Router, Request, Response } from 'express';
import { authRouter } from '../modules/system/auth/auth.route.js';
import { userApiRouter } from '../modules/system/user/user.route.js';

const apiRouter: Router = Router();

// Public Health Check
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Authentication Routes (/api/auth)
apiRouter.use('/auth', authRouter);

// System Users Routes (/api/system/users)
apiRouter.use('/system/users', userApiRouter);

export { apiRouter };

