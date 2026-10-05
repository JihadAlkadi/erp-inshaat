import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../system/authorization/authorization.service.js';
import { SystemPermission } from '../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../system/auth/auth.types.js';

export class InventoryHomeWebController {
  renderInventoryHome = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;

      const canCreateCategory = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_CATEGORY_CREATE
      );
      const canCreateProduct = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_PRODUCT_CREATE
      );

      res.render('dashboard/inventory/index', {
        layout: 'dashboard/inventory/layout',
        title: 'لوحة المستودعات',
        appName: 'إدارة المستودعات',
        themeColor: '#10AC84',
        activeTab: 'dashboard',
        user: currentUser,
        canCreateCategory,
        canCreateProduct,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const inventoryHomeWebController = new InventoryHomeWebController();
