import { Router, Request, Response } from 'express';
import { requireWebAuth, redirectIfAuthenticated } from '../modules/system/auth/auth.middleware.js';

const webRouter: Router = Router();

// GET / - Home Applications Launcher Page (Protected)
webRouter.get('/', requireWebAuth, (_req: Request, res: Response) => {
  res.render('dashboard/index', {
    title: 'نظام ERP',
    appName: 'نظام ERP',
    themeColor: '#714B67',
    hasSidebar: false,
    sidebarPath: null,
  });
});

// GET /login - Login Page (Redirect if authenticated)
webRouter.get('/login', redirectIfAuthenticated, (_req: Request, res: Response) => {
  res.render('login', {
    layout: false,
    title: 'تسجيل الدخول - ERP',
  });
});

// GET /system - System Dashboard (Protected)
webRouter.get('/system', requireWebAuth, (_req: Request, res: Response) => {
  res.render('dashboard/system/index', {
    layout: 'dashboard/system/layout',
    title: 'لوحة التحكم | إدارة النظام',
    appName: 'إدارة النظام',
    themeColor: '#714B67',
    hasSidebar: true,
    sidebarPath: 'system/partials/sidebar',
    activeTab: 'dashboard',
  });
});

export { webRouter };
