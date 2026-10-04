import { Request, Response, NextFunction } from 'express';
import { ProductionTeamService, productionTeamService } from './production-team.service.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { getProductionAccessPolicy } from '../authorization/production-authorization-context.js';
import { canAccessDepartment } from '../authorization/production-access-query.helper.js';

export class ProductionTeamWebController {
  private readonly teamService: ProductionTeamService;

  constructor(service: ProductionTeamService = productionTeamService) {
    this.teamService = service;
  }

  renderDepartmentTeam = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { departmentId } = req.params;
      const viewPolicy = await getProductionAccessPolicy(req, req.user!, SystemPermission.PRODUCTION_ASSIGNMENT_VIEW);
      const managePolicy = await getProductionAccessPolicy(req, req.user!, SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE);

      const teamData = await this.teamService.getDepartmentTeam(departmentId as string, viewPolicy);
      const canManage = canAccessDepartment(managePolicy, departmentId as string);

      let activeUsers: Array<{ id: string; fullName: string; phone: string }> = [];
      let departmentYards: Array<{ id: string; name: string; code: string }> = [];

      if (canManage) {
        [activeUsers, departmentYards] = await Promise.all([
          this.teamService.listAvailableDepartmentHeadUsers(),
          this.teamService.listDepartmentActiveYards(departmentId as string),
        ]);
      }

      res.render('dashboard/production/team/index', {
        layout: 'dashboard/production/layout',
        title: `فريق عمل قسم: ${teamData.department.name}`,
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'departments',
        department: teamData.department,
        head: teamData.head,
        engineers: teamData.engineers,
        activeUsers,
        departmentYards,
        canManage,
      });
    } catch (error) {
      next(error);
    }
  };

  renderAddEngineerForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { departmentId } = req.params;
      const managePolicy = await getProductionAccessPolicy(req, req.user!, SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE);
      if (!canAccessDepartment(managePolicy, departmentId as string)) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      const teamData = await this.teamService.getDepartmentTeam(departmentId as string, managePolicy);
      const [activeUsers, departmentYards] = await Promise.all([
        this.teamService.listAvailableEngineerUsers(),
        this.teamService.listDepartmentActiveYards(departmentId as string),
      ]);

      res.render('dashboard/production/team/create-engineer', {
        layout: 'dashboard/production/layout',
        title: `إسناد مهندس جديد - ${teamData.department.name}`,
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'departments',
        department: teamData.department,
        activeUsers,
        departmentYards,
      });
    } catch (error) {
      next(error);
    }
  };

  renderEditEngineerYardsForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { departmentId, assignmentId } = req.params;
      const managePolicy = await getProductionAccessPolicy(req, req.user!, SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE);
      if (!canAccessDepartment(managePolicy, departmentId as string)) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      const teamData = await this.teamService.getDepartmentTeam(departmentId as string, managePolicy);
      const engineer = teamData.engineers.find((e) => e.assignmentId === assignmentId);

      if (!engineer) {
        throw new NotFoundError('تعيين المهندس غير موجود', 'PRODUCTION_ENGINEER_ASSIGNMENT_NOT_FOUND');
      }

      const departmentYards = await this.teamService.listDepartmentActiveYards(departmentId as string);

      res.render('dashboard/production/team/edit-engineer', {
        layout: 'dashboard/production/layout',
        title: `تعديل ساحات المهندس: ${engineer.fullName}`,
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'departments',
        department: teamData.department,
        engineer,
        departmentYards,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const productionTeamWebController = new ProductionTeamWebController();
