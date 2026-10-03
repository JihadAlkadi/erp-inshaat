import { Request, Response, NextFunction } from 'express';
import { UserService, userService } from './user.service.js';
import { RoleService, roleService } from '../role/role.service.js';
import {
  AuthorizationService,
  authorizationService,
} from '../authorization/authorization.service.js';
import { SystemPermission } from '../permission/constants/system-permission.enum.js';

export class UserWebController {
  private readonly userService: UserService;
  private readonly roleService: RoleService;
  private readonly authorizationService: AuthorizationService;

  constructor(
    uService: UserService = userService,
    rService: RoleService = roleService,
    authzService: AuthorizationService = authorizationService
  ) {
    this.userService = uService;
    this.roleService = rService;
    this.authorizationService = authzService;
  }

  renderUsersList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

      const result = await this.userService.listUsers({ page, limit, search });
      const effectivePerms = await this.authorizationService.getEffectivePermissions(req.user!);

      res.render('dashboard/system/users/index', {
        layout: 'dashboard/system/layout',
        title: 'إدارة المستخدمين | إدارة النظام',
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'users',
        users: result.items,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
        search: search || '',
        canCreate: effectivePerms.includes(SystemPermission.USER_CREATE),
        canUpdate: effectivePerms.includes(SystemPermission.USER_UPDATE),
        canDelete: effectivePerms.includes(SystemPermission.USER_DELETE),
        currentUserId: req.user!.id,
      });
    } catch (error) {
      next(error);
    }
  };

  renderCreateUserForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roles = await this.roleService.listActiveRoles();

      res.render('dashboard/system/users/create', {
        layout: 'dashboard/system/layout',
        title: 'إضافة مستخدم جديد | إدارة النظام',
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'users',
        roles,
      });
    } catch (error) {
      next(error);
    }
  };

  renderEditUserForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id as string);
      const roles = await this.roleService.listActiveRoles();

      res.render('dashboard/system/users/edit', {
        layout: 'dashboard/system/layout',
        title: `تعديل المستخدم: ${user.fullName} | إدارة النظام`,
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'users',
        targetUser: user,
        roles,
        isSelf: req.user!.id === id,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const userWebController = new UserWebController();
