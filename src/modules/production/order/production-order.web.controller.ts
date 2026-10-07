import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../../system/authorization/authorization.service.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../../system/auth/auth.types.js';
import { productionOrderService, ProductionOrderService } from './production-order.service.js';
import { safeJsonStringify } from './production-order.types.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class ProductionOrderWebController {
  constructor(private orderService: ProductionOrderService = productionOrderService) {}

  renderOrdersList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;

      const canCreateOrder = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.PRODUCTION_ORDER_CREATE
      );
      const canUpdateOrder = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.PRODUCTION_ORDER_UPDATE
      );
      const canDeleteOrder = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.PRODUCTION_ORDER_DELETE
      );

      res.render('dashboard/production/orders/index', {
        layout: 'dashboard/production/layout',
        title: 'أوامر الإنتاج - نظام ERP',
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'orders',
        user: currentUser,
        canCreateOrder,
        canUpdateOrder,
        canDeleteOrder,
      });
    } catch (error) {
      next(error);
    }
  };

  renderOrderCreate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;

      const canCreateOrder = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.PRODUCTION_ORDER_CREATE
      );

      res.render('dashboard/production/orders/create', {
        layout: 'dashboard/production/layout',
        title: 'إنشاء أمر إنتاج جديد',
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'orders',
        user: currentUser,
        canCreateOrder,
      });
    } catch (error) {
      next(error);
    }
  };

  renderOrderShow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;
      const { id } = req.params;

      const order = await this.orderService.getOrderById(id as string);
      const readiness = await this.orderService.validateDraftForRelease(id as string);

      const canUpdateOrder = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.PRODUCTION_ORDER_UPDATE
      );

      res.render('dashboard/production/orders/show', {
        layout: 'dashboard/production/layout',
        title: `${order.orderNumber} - تفاصيل أمر الإنتاج`,
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'orders',
        user: currentUser,
        canUpdateOrder,
        order,
        readiness,
        initialOrderJson: safeJsonStringify(order),
      });
    } catch (error) {
      next(error);
    }
  };

  renderOrderEdit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentUser = req.user as AuthPrincipal;
      const { id } = req.params;

      const order = await this.orderService.getOrderById(id as string);

      if (order.status !== 'DRAFT') {
        throw new BusinessRuleError(
          'لا يمكن تعديل أمر إنتاج خارج حالة المسودة',
          'PRODUCTION_ORDER_NOT_DRAFT'
        );
      }

      const canUpdateOrder = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.PRODUCTION_ORDER_UPDATE
      );
      const canDeleteOrder = await authorizationService.hasPermission(
        currentUser,
        SystemPermission.PRODUCTION_ORDER_DELETE
      );

      res.render('dashboard/production/orders/edit', {
        layout: 'dashboard/production/layout',
        title: `${order.orderNumber} - إعداد أمر الإنتاج`,
        appName: 'إدارة الإنتاج',
        themeColor: '#0984E3',
        hasSidebar: true,
        sidebarPath: 'production/partials/sidebar',
        activeTab: 'orders',
        user: currentUser,
        canUpdateOrder,
        canDeleteOrder,
        order,
        initialOrderJson: safeJsonStringify(order),
      });
    } catch (error) {
      next(error);
    }
  };
}

export const productionOrderWebController = new ProductionOrderWebController();
