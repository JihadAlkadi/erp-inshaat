import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../../system/authorization/authorization.service.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../../system/auth/auth.types.js';

export class InventoryProductWebController {
  renderProductList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;

      const canCreateProduct = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_PRODUCT_CREATE
      );
      const canUpdateProduct = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_PRODUCT_UPDATE
      );
      const canDeleteProduct = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_PRODUCT_DELETE
      );

      res.render('dashboard/inventory/products/index', {
        layout: 'dashboard/inventory/layout',
        title: 'دليل المنتجات',
        appName: 'إدارة المستودعات',
        themeColor: '#10AC84',
        activeTab: 'products',
        user: currentUser,
        canCreateProduct,
        canUpdateProduct,
        canDeleteProduct,
      });
    } catch (error) {
      next(error);
    }
  };

  renderProductCreate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;

      const canCreateProduct = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_PRODUCT_CREATE
      );

      res.render('dashboard/inventory/products/create', {
        layout: 'dashboard/inventory/layout',
        title: 'إضافة منتج جديد',
        appName: 'إدارة المستودعات',
        themeColor: '#10AC84',
        activeTab: 'products',
        user: currentUser,
        canCreateProduct,
      });
    } catch (error) {
      next(error);
    }
  };

  renderProductEdit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;
      const { id } = req.params;

      const canUpdateProduct = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_PRODUCT_UPDATE
      );
      const canDeleteProduct = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.INVENTORY_PRODUCT_DELETE
      );

      res.render('dashboard/inventory/products/edit', {
        layout: 'dashboard/inventory/layout',
        title: 'تعديل المنتج',
        appName: 'إدارة المستودعات',
        themeColor: '#10AC84',
        activeTab: 'products',
        user: currentUser,
        productId: id,
        canUpdateProduct,
        canDeleteProduct,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const inventoryProductWebController = new InventoryProductWebController();
