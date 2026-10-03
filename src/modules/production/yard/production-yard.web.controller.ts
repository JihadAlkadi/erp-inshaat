import { Request, Response, NextFunction } from 'express';
import { ProductionYardService, productionYardService } from './production-yard.service.js';
import { ProductionDepartmentService, productionDepartmentService } from '../department/production-department.service.js';
import { ListProductionYardsQueryDto } from './dto/list-production-yards-query.dto.js';
import { authorizationService } from '../../system/authorization/authorization.service.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../../system/auth/auth.types.js';

export class ProductionYardWebController {
  private readonly yardService: ProductionYardService;
  private readonly departmentService: ProductionDepartmentService;

  constructor(
    yardService: ProductionYardService = productionYardService,
    deptService: ProductionDepartmentService = productionDepartmentService
  ) {
    this.yardService = yardService;
    this.departmentService = deptService;
  }

  renderYardsList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
      const departmentId = typeof req.query.departmentId === 'string' && req.query.departmentId.trim() !== ''
        ? req.query.departmentId.trim()
        : undefined;

      const queryDto: ListProductionYardsQueryDto = { page, limit, search, departmentId };
      const yardsData = await this.yardService.listYards(queryDto);
      const activeDepartments = await this.departmentService.listActiveDepartments();

      const currentUser = req.user as AuthPrincipal;
      const userPermissions = await authorizationService.getEffectivePermissions(currentUser);

      const canCreate = userPermissions.includes(SystemPermission.PRODUCTION_YARD_CREATE);
      const canUpdate = userPermissions.includes(SystemPermission.PRODUCTION_YARD_UPDATE);
      const canDelete = userPermissions.includes(SystemPermission.PRODUCTION_YARD_DELETE);

      res.render('dashboard/production/yards/index', {
        layout: 'dashboard/production/layout',
        title: 'ساحات الإنتاج',
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'yards',
        yards: yardsData.items,
        departments: activeDepartments,
        selectedDepartmentId: departmentId || '',
        pagination: {
          page: yardsData.page,
          limit: yardsData.limit,
          total: yardsData.total,
          totalPages: yardsData.totalPages,
        },
        search: search || '',
        canCreate,
        canUpdate,
        canDelete,
      });
    } catch (error) {
      next(error);
    }
  };

  renderCreateYardForm = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const activeDepartments = await this.departmentService.listActiveDepartments();

      res.render('dashboard/production/yards/create', {
        layout: 'dashboard/production/layout',
        title: 'إنشاء ساحة إنتاج جديدة',
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'yards',
        departments: activeDepartments,
      });
    } catch (error) {
      next(error);
    }
  };

  renderEditYardForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const yard = await this.yardService.getYardById(id as string);
      const activeDepartments = await this.departmentService.listActiveDepartments();

      // Ensure the current department is in the list even if it was deactivated
      const hasCurrentDept = activeDepartments.some((d) => d.id === yard.departmentId);
      if (!hasCurrentDept && yard.departmentId) {
        activeDepartments.push({
          id: yard.departmentId,
          name: `${yard.departmentName} (معطل)`,
          code: '',
        });
      }

      res.render('dashboard/production/yards/edit', {
        layout: 'dashboard/production/layout',
        title: `تعديل ساحة الإنتاج: ${yard.name}`,
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'yards',
        yard,
        departments: activeDepartments,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const productionYardWebController = new ProductionYardWebController();
