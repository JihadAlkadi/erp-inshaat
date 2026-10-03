import { Router, Request, Response } from 'express';

const apiRouter: Router = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export { apiRouter };
