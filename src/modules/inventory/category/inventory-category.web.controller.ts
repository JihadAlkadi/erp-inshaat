import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../../system/authorization/authorization.service.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../../system/auth/auth.types.js';
import { inventoryCategoryService } from './inventory-category.service.js';

export class InventoryCategoryWebController {
  renderCategoryTree = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

      const result = await inventoryCategoryService.searchCategories({ page, limit, search });

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
        title: 'إدارة الفئات | إدارة المستودعات',
        appName: 'إدارة المستودعات',
        themeColor: '#10AC84',
        activeTab: 'categories',
        user: currentUser,
        categories: result.items,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
        search: search || '',
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
        appName: 'إدارة المستودعات',
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
        appName: 'إدارة المستودعات',
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
