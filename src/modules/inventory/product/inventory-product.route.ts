import { Router } from 'express';
import { inventoryProductController } from './inventory-product.controller.js';
import { requireApiAuth } from '../../system/auth/auth.middleware.js';
import { requirePermission, requireAnyPermission } from '../../system/authorization/authorization.middleware.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { validateDto } from '../../../common/middleware/validate-dto.middleware.js';
import { validateQueryDto } from '../../../common/middleware/validate-query-dto.middleware.js';
import { validateUuidParam } from '../../../common/middleware/validate-uuid-param.middleware.js';
import { CreateInventoryProductDto } from './dto/create-product.dto.js';
import { UpdateInventoryProductDto } from './dto/update-product.dto.js';
import { CreateInventoryProductUnitDto } from './dto/create-product-unit.dto.js';
import { UpdateInventoryProductUnitDto } from './dto/update-product-unit.dto.js';
import { ListInventoryProductsQueryDto } from './dto/list-products-query.dto.js';
import { ListInventoryProductUnitsQueryDto } from './dto/list-product-units-query.dto.js';

const inventoryProductApiRouter: Router = Router();

inventoryProductApiRouter.use(requireApiAuth);

// GET /api/inventory/products/reference-options - Minimal product reference picker (paginated, search)
inventoryProductApiRouter.get(
  '/reference-options',
  requireAnyPermission([
    SystemPermission.INVENTORY_PRODUCT_VIEW,
    SystemPermission.PRODUCTION_TEMPLATE_VIEW,
    SystemPermission.PRODUCTION_TEMPLATE_UPDATE,
  ]),
  inventoryProductController.listProductReferences
);

// GET /api/inventory/products - List products (paginated, filtered)
inventoryProductApiRouter.get(
  '/',
  requirePermission(SystemPermission.INVENTORY_PRODUCT_VIEW),
  validateQueryDto(ListInventoryProductsQueryDto),
  inventoryProductController.listProducts
);

// GET /api/inventory/products/:productId/units/reference-options - Minimal unit references for a product
inventoryProductApiRouter.get(
  '/:productId/units/reference-options',
  validateUuidParam('productId'),
  requireAnyPermission([
    SystemPermission.INVENTORY_PRODUCT_VIEW,
    SystemPermission.PRODUCTION_TEMPLATE_VIEW,
    SystemPermission.PRODUCTION_TEMPLATE_UPDATE,
  ]),
  inventoryProductController.listProductUnitReferences
);

// GET /api/inventory/products/:id - Get product details
inventoryProductApiRouter.get(
  '/:id',
  requirePermission(SystemPermission.INVENTORY_PRODUCT_VIEW),
  validateUuidParam('id'),
  inventoryProductController.getProductById
);

// POST /api/inventory/products - Create product with base unit
inventoryProductApiRouter.post(
  '/',
  requirePermission(SystemPermission.INVENTORY_PRODUCT_CREATE),
  validateDto(CreateInventoryProductDto),
  inventoryProductController.createProduct
);

// PATCH /api/inventory/products/:id - Update product
inventoryProductApiRouter.patch(
  '/:id',
  requirePermission(SystemPermission.INVENTORY_PRODUCT_UPDATE),
  validateUuidParam('id'),
  validateDto(UpdateInventoryProductDto),
  inventoryProductController.updateProduct
);

// DELETE /api/inventory/products/:id - Soft delete product
inventoryProductApiRouter.delete(
  '/:id',
  requirePermission(SystemPermission.INVENTORY_PRODUCT_DELETE),
  validateUuidParam('id'),
  inventoryProductController.deleteProduct
);

// --- Units Endpoints ---

// GET /api/inventory/products/:productId/units - List product units
inventoryProductApiRouter.get(
  '/:productId/units',
  requirePermission(SystemPermission.INVENTORY_PRODUCT_VIEW),
  validateUuidParam('productId'),
  validateQueryDto(ListInventoryProductUnitsQueryDto),
  inventoryProductController.listUnits
);

// POST /api/inventory/products/:productId/units - Add non-base unit
inventoryProductApiRouter.post(
  '/:productId/units',
  requirePermission(SystemPermission.INVENTORY_PRODUCT_UPDATE),
  validateUuidParam('productId'),
  validateDto(CreateInventoryProductUnitDto),
  inventoryProductController.createUnit
);

// PATCH /api/inventory/products/:productId/units/:unitId - Update unit
inventoryProductApiRouter.patch(
  '/:productId/units/:unitId',
  requirePermission(SystemPermission.INVENTORY_PRODUCT_UPDATE),
  validateUuidParam('productId'),
  validateUuidParam('unitId'),
  validateDto(UpdateInventoryProductUnitDto),
  inventoryProductController.updateUnit
);

// DELETE /api/inventory/products/:productId/units/:unitId - Soft delete non-base unit
inventoryProductApiRouter.delete(
  '/:productId/units/:unitId',
  requirePermission(SystemPermission.INVENTORY_PRODUCT_UPDATE),
  validateUuidParam('productId'),
  validateUuidParam('unitId'),
  inventoryProductController.deleteUnit
);

export { inventoryProductApiRouter };
