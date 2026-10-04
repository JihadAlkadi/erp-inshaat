import { Request, Response, NextFunction } from 'express';
import { ProductionTeamService, productionTeamService } from './production-team.service.js';
import { authorizationService } from '../../system/authorization/authorization.service.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../../system/auth/auth.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';

export class ProductionTeamWebController {
  private readonly teamService: ProductionTeamService;

  constructor(service: ProductionTeamService = productionTeamService) {
    this.teamService = service;
  }

  renderDepartmentTeam = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { departmentId } = req.params;
      const teamData = await this.teamService.getDepartmentTeam(departmentId as string);
      const activeUsers = await this.teamService.listAvailableDepartmentHeadUsers();
      const departmentYards = await this.teamService.listDepartmentActiveYards(departmentId as string);

      const currentUser = req.user as AuthPrincipal;
      const userPermissions = await authorizationService.getEffectivePermissions(currentUser);
      const canManage = userPermissions.includes(SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE);

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
      const teamData = await this.teamService.getDepartmentTeam(departmentId as string);
      const activeUsers = await this.teamService.listAvailableEngineerUsers(departmentId as string);
      const departmentYards = await this.teamService.listDepartmentActiveYards(departmentId as string);

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
      const teamData = await this.teamService.getDepartmentTeam(departmentId as string);
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
