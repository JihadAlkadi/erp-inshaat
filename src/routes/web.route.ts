import { Router, Request, Response } from 'express';
import { requireWebAuth, redirectIfAuthenticated } from '../modules/system/auth/auth.middleware.js';
import { requirePermission } from '../modules/system/authorization/authorization.middleware.js';
import { SystemPermission } from '../modules/system/permission/constants/system-permission.enum.js';
import { validateUuidParam } from '../common/middleware/validate-uuid-param.middleware.js';
import { userWebController } from '../modules/system/user/user.web.controller.js';

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

// GET /system/users - System Users List (Protected)
webRouter.get(
  '/system/users',
  requireWebAuth,
  requirePermission(SystemPermission.USER_VIEW),
  userWebController.renderUsersList
);

// GET /system/users/create - Create User Page (Protected)
webRouter.get(
  '/system/users/create',
  requireWebAuth,
  requirePermission(SystemPermission.USER_CREATE),
  userWebController.renderCreateUserForm
);

// GET /system/users/:id/edit - Edit User Page (Protected)
webRouter.get(
  '/system/users/:id/edit',
  requireWebAuth,
  requirePermission(SystemPermission.USER_UPDATE),
  validateUuidParam('id'),
  userWebController.renderEditUserForm
);

export { webRouter };

