import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../system/authorization/authorization.service.js';
import { SystemPermission } from '../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../system/auth/auth.types.js';
import { AppDataSource } from '../../database/data-source.js';
import { InventoryProductEntity } from './product/inventory-product.entity.js';
import { InventoryCategoryEntity } from './category/inventory-category.entity.js';
import { InventoryProductUnitEntity } from './product/inventory-product-unit.entity.js';
import { IsNull } from 'typeorm';

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

      const productRepo = AppDataSource.getRepository(InventoryProductEntity);
      const categoryRepo = AppDataSource.getRepository(InventoryCategoryEntity);
      const unitRepo = AppDataSource.getRepository(InventoryProductUnitEntity);

      const [productsCount, activeProductsCount, categoriesCount, unitsCount] = await Promise.all([
        productRepo.count({ where: { deletedAt: IsNull() } }),
        productRepo.count({ where: { isActive: true, deletedAt: IsNull() } }),
        categoryRepo.count({ where: { deletedAt: IsNull() } }),
        unitRepo.count({ where: { deletedAt: IsNull() } }),
      ]);

      res.render('dashboard/inventory/index', {
        layout: 'dashboard/inventory/layout',
        title: 'لوحة التحكم | إدارة المستودعات',
        appName: 'إدارة المستودعات',
        themeColor: '#10AC84',
        hasSidebar: true,
        sidebarPath: 'inventory/partials/sidebar',
        activeTab: 'dashboard',
        user: currentUser,
        canCreateCategory,
        canCreateProduct,
        productsCount,
        activeProductsCount,
        categoriesCount,
        unitsCount,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const inventoryHomeWebController = new InventoryHomeWebController();
