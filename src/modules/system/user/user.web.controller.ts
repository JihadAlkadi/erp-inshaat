import { Request, Response, NextFunction } from 'express';
import { UserService, userService } from './user.service.js';
import { UserPermissionService, userPermissionService } from './user-permission.service.js';
import { RoleService, roleService } from '../role/role.service.js';
import {
  AuthorizationService,
  authorizationService,
} from '../authorization/authorization.service.js';
import { SystemPermission } from '../permission/constants/system-permission.enum.js';
import { getProductionAccessPolicy } from '../../production/authorization/production-authorization-context.js';
import {
  ProductionUserResponsibilityReadService,
  productionUserResponsibilityReadService,
} from '../../production/team/production-user-responsibility-read.service.js';

export class UserWebController {
  private readonly userService: UserService;
  private readonly userPermissionService: UserPermissionService;
  private readonly roleService: RoleService;
  private readonly authorizationService: AuthorizationService;
  private readonly productionResponsibilityReadService: ProductionUserResponsibilityReadService;

  constructor(
    uService: UserService = userService,
    upService: UserPermissionService = userPermissionService,
    rService: RoleService = roleService,
    authzService: AuthorizationService = authorizationService,
    prodReadService: ProductionUserResponsibilityReadService = productionUserResponsibilityReadService
  ) {
    this.userService = uService;
    this.userPermissionService = upService;
    this.roleService = rService;
    this.authorizationService = authzService;
    this.productionResponsibilityReadService = prodReadService;
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
        canManagePermissions: effectivePerms.includes(SystemPermission.USER_PERMISSION_MANAGE),
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

  renderUserPermissionsForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const permStates = await this.userPermissionService.getUserPermissionsState(
        id as string,
        req.user?.id
      );
      const effectivePerms = await this.authorizationService.getEffectivePermissions(req.user!);

      const isSelf = permStates.isSelf;
      const canUpdate = effectivePerms.includes(SystemPermission.USER_UPDATE);
      const canDelete = !isSelf && effectivePerms.includes(SystemPermission.USER_DELETE);
      const canManagePermissions = !isSelf && effectivePerms.includes(SystemPermission.USER_PERMISSION_MANAGE);

      // Check production assignment view policy to show context strip if authorized
      const viewPolicy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_ASSIGNMENT_VIEW
      );
      const managePolicy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE
      );
      const canViewProduction = Boolean(viewPolicy.hasAnyAccess);

      let productionResponsibility;
      if (canViewProduction) {
        productionResponsibility =
          await this.productionResponsibilityReadService.getUserResponsibility(
            id as string,
            viewPolicy,
            managePolicy
          );
      }

      res.render('dashboard/system/users/permissions', {
        layout: 'dashboard/system/layout',
        title: `صلاحيات المستخدم: ${permStates.user.fullName} | إدارة النظام`,
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'users',
        activePortfolioTab: 'permissions',
        targetUser: permStates.user,
        permissions: permStates.permissions,
        isSelf,
        canUpdate,
        canDelete,
        canManagePermissions,
        canViewProduction,
        productionResponsibility,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const userWebController = new UserWebController();

