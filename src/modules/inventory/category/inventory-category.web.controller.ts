import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../../system/authorization/authorization.service.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../../system/auth/auth.types.js';

export class InventoryCategoryWebController {
  renderCategoryTree = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;

      const canCreateCategory = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_CATEGORY_CREATE
      );
      const canUpdateCategory = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_CATEGORY_UPDATE
      );
      const canDeleteCategory = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_CATEGORY_DELETE
      );

      res.render('dashboard/inventory/categories/index', {
        layout: 'dashboard/inventory/layout',
        title: 'إدارة الفئات',
        appName: 'كتالوج المنتجات',
        themeColor: '#10AC84',
        activeTab: 'categories',
        user: currentUser,
        canCreateCategory,
        canUpdateCategory,
        canDeleteCategory,
      });
    } catch (error) {
      next(error);
    }
  };

  renderCategoryCreate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;
      const parentId = typeof req.query.parentId === 'string' ? req.query.parentId.trim() : '';

      const canCreateCategory = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_CATEGORY_CREATE
      );

      res.render('dashboard/inventory/categories/create', {
        layout: 'dashboard/inventory/layout',
        title: 'إضافة فئة جديدة',
        appName: 'كتالوج المنتجات',
        themeColor: '#10AC84',
        activeTab: 'categories',
        user: currentUser,
        parentId,
        canCreateCategory,
      });
    } catch (error) {
      next(error);
    }
  };

  renderCategoryEdit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;
      const { id } = req.params;

      const canUpdateCategory = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_CATEGORY_UPDATE
      );

      res.render('dashboard/inventory/categories/edit', {
        layout: 'dashboard/inventory/layout',
        title: 'تعديل الفئة',
        appName: 'كتالوج المنتجات',
        themeColor: '#10AC84',
        activeTab: 'categories',
        user: currentUser,
        categoryId: id,
        canUpdateCategory,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const inventoryCategoryWebController = new InventoryCategoryWebController();
