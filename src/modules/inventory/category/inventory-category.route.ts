import { Router } from 'express';
import { inventoryCategoryController } from './inventory-category.controller.js';
import { requireApiAuth } from '../../system/auth/auth.middleware.js';
import { requirePermission } from '../../system/authorization/authorization.middleware.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { validateDto } from '../../../common/middleware/validate-dto.middleware.js';
import { validateQueryDto } from '../../../common/middleware/validate-query-dto.middleware.js';
import { validateUuidParam } from '../../../common/middleware/validate-uuid-param.middleware.js';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto.js';
import { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto.js';
import { ListInventoryCategoriesQueryDto } from './dto/list-inventory-categories-query.dto.js';
import { CategoryOptionsQueryDto } from './dto/category-options-query.dto.js';

const inventoryCategoryApiRouter: Router = Router();

inventoryCategoryApiRouter.use(requireApiAuth);

// GET /api/inventory/categories - List / search categories (paginated)
inventoryCategoryApiRouter.get(
  '/',
  requirePermission(SystemPermission.INVENTORY_CATEGORY_VIEW),
  validateQueryDto(ListInventoryCategoriesQueryDto),
  inventoryCategoryController.searchCategories
);

// GET /api/inventory/categories/roots - List root categories (paginated)
inventoryCategoryApiRouter.get(
  '/roots',
  requirePermission(SystemPermission.INVENTORY_CATEGORY_VIEW),
  validateQueryDto(ListInventoryCategoriesQueryDto),
  inventoryCategoryController.listRoots
);

// GET /api/inventory/categories/search - Search categories (paginated)
inventoryCategoryApiRouter.get(
  '/search',
  requirePermission(SystemPermission.INVENTORY_CATEGORY_VIEW),
  validateQueryDto(ListInventoryCategoriesQueryDto),
  inventoryCategoryController.searchCategories
);

// GET /api/inventory/categories/options - Paginated active category options lookup
inventoryCategoryApiRouter.get(
  '/options',
  requirePermission(SystemPermission.INVENTORY_CATEGORY_VIEW),
  validateQueryDto(CategoryOptionsQueryDto),
  inventoryCategoryController.listOptions
);

// GET /api/inventory/categories/:id/children - List direct children (paginated)
inventoryCategoryApiRouter.get(
  '/:id/children',
  requirePermission(SystemPermission.INVENTORY_CATEGORY_VIEW),
  validateUuidParam('id'),
  validateQueryDto(ListInventoryCategoriesQueryDto),
  inventoryCategoryController.listChildren
);

// GET /api/inventory/categories/:id - Get category details
inventoryCategoryApiRouter.get(
  '/:id',
  requirePermission(SystemPermission.INVENTORY_CATEGORY_VIEW),
  validateUuidParam('id'),
  inventoryCategoryController.getCategoryById
);

// POST /api/inventory/categories - Create category
inventoryCategoryApiRouter.post(
  '/',
  requirePermission(SystemPermission.INVENTORY_CATEGORY_CREATE),
  validateDto(CreateInventoryCategoryDto),
  inventoryCategoryController.createCategory
);

// PATCH /api/inventory/categories/:id - Update category
inventoryCategoryApiRouter.patch(
  '/:id',
  requirePermission(SystemPermission.INVENTORY_CATEGORY_UPDATE),
  validateUuidParam('id'),
  validateDto(UpdateInventoryCategoryDto),
  inventoryCategoryController.updateCategory
);

// DELETE /api/inventory/categories/:id - Soft delete category
inventoryCategoryApiRouter.delete(
  '/:id',
  requirePermission(SystemPermission.INVENTORY_CATEGORY_DELETE),
  validateUuidParam('id'),
  inventoryCategoryController.deleteCategory
);

export { inventoryCategoryApiRouter };
