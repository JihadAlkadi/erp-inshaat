import { Request, Response, NextFunction } from 'express';
import { UserPortfolioService, userPortfolioService } from './user-portfolio.service.js';
import { getProductionAccessPolicy } from '../../../production/authorization/production-authorization-context.js';
import { SystemPermission } from '../../permission/constants/system-permission.enum.js';

export class UserPortfolioWebController {
  private readonly portfolioService: UserPortfolioService;

  constructor(service: UserPortfolioService = userPortfolioService) {
    this.portfolioService = service;
  }

  /**
   * GET /system/users/:id - User Portfolio Overview
   */
  renderOverview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
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

      const viewModel = await this.portfolioService.getOverview(
        id as string,
        req.user!,
        viewPolicy,
        managePolicy
      );

      res.render('dashboard/system/users/portfolio/overview', {
        layout: 'dashboard/system/layout',
        title: `الملف الإداري: ${viewModel.targetUser.fullName} | إدارة النظام`,
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'users',
        ...viewModel,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /system/users/:id/account - User Portfolio Account Details
   */
  renderAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const viewPolicy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_ASSIGNMENT_VIEW
      );

      const viewModel = await this.portfolioService.getAccount(
        id as string,
        req.user!,
        viewPolicy
      );

      res.render('dashboard/system/users/portfolio/account', {
        layout: 'dashboard/system/layout',
        title: `بيانات الحساب: ${viewModel.targetUser.fullName} | إدارة النظام`,
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'users',
        ...viewModel,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /system/users/:id/production - User Portfolio Production Responsibility
   */
  renderProduction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
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

      const viewModel = await this.portfolioService.getProduction(
        id as string,
        req.user!,
        viewPolicy,
        managePolicy
      );

      res.render('dashboard/system/users/portfolio/production', {
        layout: 'dashboard/system/layout',
        title: `المسؤولية التشغيلية: ${viewModel.targetUser.fullName} | إدارة النظام`,
        appName: 'إدارة النظام',
        themeColor: '#714B67',
        hasSidebar: true,
        sidebarPath: 'system/partials/sidebar',
        activeTab: 'users',
        ...viewModel,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const userPortfolioWebController = new UserPortfolioWebController();
