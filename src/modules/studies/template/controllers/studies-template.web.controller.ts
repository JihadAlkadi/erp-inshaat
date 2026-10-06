import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../../../system/authorization/authorization.service.js';
import { SystemPermission } from '../../../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../../../system/auth/auth.types.js';
import { studiesTemplateService } from '../services/studies-template.service.js';
import { AppDataSource } from '../../../../database/data-source.js';
import { ProductionDepartmentEntity } from '../../../production/department/production-department.entity.js';
import { InventoryProductEntity } from '../../../inventory/product/inventory-product.entity.js';
import { deriveConsecutiveDepartmentGroups } from '../helpers/consecutive-grouping.helper.js';
import { IsNull } from 'typeorm';

export class StudiesTemplateWebController {
  renderTemplatesList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;

      const canCreateTemplate = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.STUDIES_TEMPLATE_CREATE
      );
      const canUpdateTemplate = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.STUDIES_TEMPLATE_UPDATE
      );
      const canDeleteTemplate = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.STUDIES_TEMPLATE_DELETE
      );

      res.render('dashboard/studies/templates/index', {
        layout: 'dashboard/studies/layout',
        title: 'قوالب التصنيع - نظام ERP',
        appName: 'إدارة الدراسات والقوالب',
        themeColor: '#4F46E5',
        hasSidebar: true,
        sidebarPath: 'studies/partials/sidebar',
        activeTab: 'templates',
        user: currentUser,
        canCreateTemplate,
        canUpdateTemplate,
        canDeleteTemplate,
      });
    } catch (error) {
      next(error);
    }
  };

  renderTemplateCreate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;

      const canCreateTemplate = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.STUDIES_TEMPLATE_CREATE
      );

      res.render('dashboard/studies/templates/create', {
        layout: 'dashboard/studies/layout',
        title: 'إنشاء قالب تصنيع جديد',
        appName: 'إدارة الدراسات والقوالب',
        themeColor: '#4F46E5',
        hasSidebar: true,
        sidebarPath: 'studies/partials/sidebar',
        activeTab: 'templates',
        user: currentUser,
        canCreateTemplate,
      });
    } catch (error) {
      next(error);
    }
  };

  renderTemplateShow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;
      const { id } = req.params;

      const template = await studiesTemplateService.getTemplateById(id as string);

      const canUpdateTemplate = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.STUDIES_TEMPLATE_UPDATE
      );
      const canDeleteTemplate = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.STUDIES_TEMPLATE_DELETE
      );

      // Load active production departments for stage modal dropdown
      const deptRepo = AppDataSource.getRepository(ProductionDepartmentEntity);
      const departments = await deptRepo.find({
        where: { isActive: true, deletedAt: IsNull() },
        order: { name: 'ASC' },
      });

      // Load active inventory products with their units for stage planned materials
      const productRepo = AppDataSource.getRepository(InventoryProductEntity);
      const products = await productRepo.find({
        where: { isActive: true, deletedAt: IsNull() },
        relations: { units: true },
        order: { name: 'ASC' },
      });

      // Calculate consecutive groups
      const consecutiveGroups = deriveConsecutiveDepartmentGroups(template.stages || []);

      res.render('dashboard/studies/templates/show', {
        layout: 'dashboard/studies/layout',
        title: `${template.name} - تفاصيل قالب التصنيع`,
        appName: 'إدارة الدراسات والقوالب',
        themeColor: '#4F46E5',
        hasSidebar: true,
        sidebarPath: 'studies/partials/sidebar',
        activeTab: 'templates',
        user: currentUser,
        template,
        consecutiveGroups,
        departments,
        products,
        canUpdateTemplate,
        canDeleteTemplate,
      });
    } catch (error) {
      next(error);
    }
  };

  renderTemplateEdit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;
      const { id } = req.params;

      const template = await studiesTemplateService.getTemplateById(id as string);

      const canUpdateTemplate = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.STUDIES_TEMPLATE_UPDATE
      );

      res.render('dashboard/studies/templates/edit', {
        layout: 'dashboard/studies/layout',
        title: `تعديل قالب ${template.name}`,
        appName: 'إدارة الدراسات والقوالب',
        themeColor: '#4F46E5',
        hasSidebar: true,
        sidebarPath: 'studies/partials/sidebar',
        activeTab: 'templates',
        user: currentUser,
        template,
        canUpdateTemplate,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const studiesTemplateWebController = new StudiesTemplateWebController();
