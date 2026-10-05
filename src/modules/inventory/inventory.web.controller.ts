import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../system/authorization/authorization.service.js';
import { SystemPermission } from '../system/permission/constants/system-permission.enum.js';
import { AuthPrincipal } from '../system/auth/auth.types.js';

export class InventoryHomeWebController {
  renderInventoryHome = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.redirect('/inventory/products');
    } catch (error) {
      next(error);
    }
  };
}

export const inventoryHomeWebController = new InventoryHomeWebController();
