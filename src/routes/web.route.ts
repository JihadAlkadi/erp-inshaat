import { Router, Request, Response } from 'express';
import { requireWebAuth, redirectIfAuthenticated } from '../modules/system/auth/auth.middleware.js';
import { requirePermission } from '../modules/system/authorization/authorization.middleware.js';
import { requireProductionAccess } from '../modules/production/authorization/production-authorization.middleware.js';
import { SystemPermission } from '../modules/system/permission/constants/system-permission.enum.js';
import { validateUuidParam } from '../common/middleware/validate-uuid-param.middleware.js';
import { userWebController } from '../modules/system/user/user.web.controller.js';
import { roleWebController } from '../modules/system/role/role.web.controller.js';
import { productionDepartmentWebController } from '../modules/production/department/production-department.web.controller.js';
import { productionYardWebController } from '../modules/production/yard/production-yard.web.controller.js';
import { productionTeamWebController } from '../modules/production/team/production-team.web.controller.js';

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

// GET /system/users/:id/permissions - User Permissions Page (Protected)
webRouter.get(
  '/system/users/:id/permissions',
  requireWebAuth,
  requirePermission(SystemPermission.USER_VIEW),
  validateUuidParam('id'),
  userWebController.renderUserPermissionsForm
);

// GET /system/roles - System Roles List (Protected)
webRouter.get(
  '/system/roles',
  requireWebAuth,
  requirePermission(SystemPermission.ROLE_VIEW),
  roleWebController.renderRolesList
);

// GET /system/roles/create - Create Role Page (Protected)
webRouter.get(
  '/system/roles/create',
  requireWebAuth,
  requirePermission(SystemPermission.ROLE_CREATE),
  roleWebController.renderCreateRoleForm
);

// GET /system/roles/:id/edit - Edit Role Page (Protected)
webRouter.get(
  '/system/roles/:id/edit',
  requireWebAuth,
  requirePermission(SystemPermission.ROLE_UPDATE),
  validateUuidParam('id'),
  roleWebController.renderEditRoleForm
);

// GET /system/roles/:id/permissions - Role Permissions Page (Protected)
webRouter.get(
  '/system/roles/:id/permissions',
  requireWebAuth,
  requirePermission(SystemPermission.ROLE_VIEW),
  validateUuidParam('id'),
  roleWebController.renderRolePermissionsForm
);

// ==========================================
// PRODUCTION APPLICATION WEB ROUTES
// ==========================================

// GET /production - Production Dashboard (Protected)
webRouter.get('/production', requireWebAuth, (_req: Request, res: Response) => {
  res.render('dashboard/production/index', {
    layout: 'dashboard/production/layout',
    title: 'لوحة التحكم | إدارة الإنتاج',
    appName: 'إدارة الإنتاج',
    themeColor: '#0984E3',
    hasSidebar: true,
    sidebarPath: 'production/partials/sidebar',
    activeTab: 'dashboard',
  });
});

// GET /production/departments - Production Departments List (Protected)
webRouter.get(
  '/production/departments',
  requireWebAuth,
  requireProductionAccess(SystemPermission.PRODUCTION_DEPARTMENT_VIEW),
  productionDepartmentWebController.renderDepartmentsList
);

// GET /production/departments/create - Create Production Department Page (Protected)
webRouter.get(
  '/production/departments/create',
  requireWebAuth,
  requirePermission(SystemPermission.PRODUCTION_DEPARTMENT_CREATE),
  productionDepartmentWebController.renderCreateDepartmentForm
);

// GET /production/departments/:id/edit - Edit Production Department Page (Protected)
webRouter.get(
  '/production/departments/:id/edit',
  requireWebAuth,
  requireProductionAccess(SystemPermission.PRODUCTION_DEPARTMENT_UPDATE),
  validateUuidParam('id'),
  productionDepartmentWebController.renderEditDepartmentForm
);

// GET /production/departments/:departmentId/team - Department Team Management Page (Protected)
webRouter.get(
  '/production/departments/:departmentId/team',
  requireWebAuth,
  requireProductionAccess(SystemPermission.PRODUCTION_ASSIGNMENT_VIEW),
  validateUuidParam('departmentId'),
  productionTeamWebController.renderDepartmentTeam
);

// GET /production/departments/:departmentId/team/engineers/create - Add Engineer Page (Protected)
webRouter.get(
  '/production/departments/:departmentId/team/engineers/create',
  requireWebAuth,
  requireProductionAccess(SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE),
  validateUuidParam('departmentId'),
  productionTeamWebController.renderAddEngineerForm
);

// GET /production/departments/:departmentId/team/engineers/:assignmentId/edit - Edit Engineer Yards Page (Protected)
webRouter.get(
  '/production/departments/:departmentId/team/engineers/:assignmentId/edit',
  requireWebAuth,
  requireProductionAccess(SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE),
  validateUuidParam('departmentId'),
  validateUuidParam('assignmentId'),
  productionTeamWebController.renderEditEngineerYardsForm
);

// GET /production/yards - Production Yards List (Protected)
webRouter.get(
  '/production/yards',
  requireWebAuth,
  requireProductionAccess(SystemPermission.PRODUCTION_YARD_VIEW),
  productionYardWebController.renderYardsList
);

// GET /production/yards/create - Create Production Yard Page (Protected)
webRouter.get(
  '/production/yards/create',
  requireWebAuth,
  requireProductionAccess(SystemPermission.PRODUCTION_YARD_CREATE),
  productionYardWebController.renderCreateYardForm
);

// GET /production/yards/:id/edit - Edit Production Yard Page (Protected)
webRouter.get(
  '/production/yards/:id/edit',
  requireWebAuth,
  requireProductionAccess(SystemPermission.PRODUCTION_YARD_UPDATE),
  validateUuidParam('id'),
  productionYardWebController.renderEditYardForm
);

export { webRouter };


