import { Request, Response, NextFunction } from 'express';
import { RoleService, roleService } from './role.service.js';
import { RolePermissionService, rolePermissionService } from './role-permission.service.js';
import {
  AuthorizationService,
  authorizationService,
} from '../authorization/authorization.service.js';
import { SystemPermission } from '../permission/constants/system-permission.enum.js';
import { SystemRole } from './constants/system-role.enum.js';

export class RoleWebController {
  private readonly roleService: RoleService;
  private readonly rolePermissionService: RolePermissionService;
  private readonly authorizationService: AuthorizationService;

  constructor(
    rService: RoleService = roleService,
    rpService: RolePermissionService = rolePermissionService,
    authzService: AuthorizationService = authorizationService
  ) {
    this.roleService = rService;
    this.rolePermissionService = rpService;
    this.authorizationService = authzService;
  }

  renderRolesList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

      const result = await this.roleService.listRoles({ page, limit, search });
      const effectivePerms = await this.authorizationService.getEffectivePermissions(req.user!);

      res.render('dashboard/system/roles/index', {
        layout: 'dashboard/system/layout',
        title: 'إدارة الأدوار والصلاحيات | إدارة النظام',
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'roles',
        roles: result.items,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
        search: search || '',
        canCreate: effectivePerms.includes(SystemPermission.ROLE_CREATE),
        canUpdate: effectivePerms.includes(SystemPermission.ROLE_UPDATE),
        canDelete: effectivePerms.includes(SystemPermission.ROLE_DELETE),
        canManagePermissions: effectivePerms.includes(SystemPermission.ROLE_PERMISSION_MANAGE),
        systemAdminCode: SystemRole.SYSTEM_ADMIN,
      });
    } catch (error) {
      next(error);
    }
  };

  renderCreateRoleForm = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.render('dashboard/system/roles/create', {
        layout: 'dashboard/system/layout',
        title: 'إضافة دور جديد | إدارة النظام',
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'roles',
      });
    } catch (error) {
      next(error);
    }
  };

  renderEditRoleForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const role = await this.roleService.getRoleById(id as string);

      res.render('dashboard/system/roles/edit', {
        layout: 'dashboard/system/layout',
        title: `تعديل الدور: ${role.name} | إدارة النظام`,
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'roles',
        targetRole: role,
        isSystemAdmin: role.code === SystemRole.SYSTEM_ADMIN,
      });
    } catch (error) {
      next(error);
    }
  };

  renderRolePermissionsForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const permStates = await this.rolePermissionService.getRolePermissionsState(id as string);
      const effectivePerms = await this.authorizationService.getEffectivePermissions(req.user!);

      res.render('dashboard/system/roles/permissions', {
        layout: 'dashboard/system/layout',
        title: `صلاحيات الدور: ${permStates.role.name} | إدارة النظام`,
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'roles',
        role: permStates.role,
        permissions: permStates.permissions,
        isSystemAdmin: permStates.isSystemAdmin,
        canManagePermissions: effectivePerms.includes(SystemPermission.ROLE_PERMISSION_MANAGE),
      });
    } catch (error) {
      next(error);
    }
  };
}

export const roleWebController = new RoleWebController();
