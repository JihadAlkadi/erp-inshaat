import { Router, Request, Response } from 'express';

const webRouter: Router = Router();

// GET / - Home Applications Launcher Page
webRouter.get('/', (_req: Request, res: Response) => {
  res.render('dashboard/index', {
    title: 'نظام ERP',
    appName: 'نظام ERP',
    themeColor: '#714B67',
    hasSidebar: false,
    sidebarPath: null
  });
});

// GET /login - Login Page
webRouter.get('/login', (_req: Request, res: Response) => {
  res.render('login', {
    layout: false,
    title: 'تسجيل الدخول - ERP'
  });
});

// GET /system - System Dashboard
webRouter.get('/system', (_req: Request, res: Response) => {
  res.render('dashboard/system/index', {
    layout: 'dashboard/system/layout',
    title: 'لوحة التحكم | إدارة النظام',
    appName: 'إدارة النظام',
    themeColor: '#714B67',
    hasSidebar: true,
    sidebarPath: 'system/partials/sidebar',
    activeTab: 'dashboard'
  });
});

export { webRouter };
