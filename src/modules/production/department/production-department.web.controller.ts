import { Request, Response, NextFunction } from 'express';
import { ProductionDepartmentService, productionDepartmentService } from './production-department.service.js';
import { ListProductionDepartmentsQueryDto } from './dto/list-production-departments-query.dto.js';
import { authorizationService } from '../../system/authorization/authorization.service.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../../system/auth/auth.types.js';
import { productionTeamService } from '../team/production-team.service.js';

export class ProductionDepartmentWebController {
  private readonly departmentService: ProductionDepartmentService;

  constructor(service: ProductionDepartmentService = productionDepartmentService) {
    this.departmentService = service;
  }

  renderDepartmentsList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

      const queryDto: ListProductionDepartmentsQueryDto = { page, limit, search };
      const departmentsData = await this.departmentService.listDepartments(queryDto);

      const currentUser = req.user as AuthPrincipal;
      const userPermissions = await authorizationService.getEffectivePermissions(currentUser);

      const canCreate = userPermissions.includes(SystemPermission.PRODUCTION_DEPARTMENT_CREATE);
      const canUpdate = userPermissions.includes(SystemPermission.PRODUCTION_DEPARTMENT_UPDATE);
      const canDelete = userPermissions.includes(SystemPermission.PRODUCTION_DEPARTMENT_DELETE);
      const canViewTeam = userPermissions.includes(SystemPermission.PRODUCTION_ASSIGNMENT_VIEW);
      const canManageTeam = userPermissions.includes(SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE);

      res.render('dashboard/production/departments/index', {
        layout: 'dashboard/production/layout',
        title: 'أقسام الإنتاج',
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'departments',
        departments: departmentsData.items,
        pagination: {
          page: departmentsData.page,
          limit: departmentsData.limit,
          total: departmentsData.total,
          totalPages: departmentsData.totalPages,
        },
        search: search || '',
        canCreate,
        canUpdate,
        canDelete,
        canViewTeam,
        canManageTeam,
      });
    } catch (error) {
      next(error);
    }
  };

  renderCreateDepartmentForm = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const activeUsers = await productionTeamService.listAvailableDepartmentHeadUsers();

      res.render('dashboard/production/departments/create', {
        layout: 'dashboard/production/layout',
        title: 'إنشاء قسم إنتاج جديد',
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'departments',
        activeUsers,
      });
    } catch (error) {
      next(error);
    }
  };

  renderEditDepartmentForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const department = await this.departmentService.getDepartmentById(id as string);

      res.render('dashboard/production/departments/edit', {
        layout: 'dashboard/production/layout',
        title: `تعديل قسم الإنتاج: ${department.name}`,
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'departments',
        department,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const productionDepartmentWebController = new ProductionDepartmentWebController();
