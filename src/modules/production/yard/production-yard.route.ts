import { Router } from 'express';
import { productionYardController } from './production-yard.controller.js';
import { requireApiAuth } from '../../system/auth/auth.middleware.js';
import { requirePermission } from '../../system/authorization/authorization.middleware.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { validateDto } from '../../../common/middleware/validate-dto.middleware.js';
import { validateQueryDto } from '../../../common/middleware/validate-query-dto.middleware.js';
import { validateUuidParam } from '../../../common/middleware/validate-uuid-param.middleware.js';
import { validateYardUpdatePayload } from './production-yard.middleware.js';
import { CreateProductionYardDto } from './dto/create-production-yard.dto.js';
import { UpdateProductionYardDto } from './dto/update-production-yard.dto.js';
import { ListProductionYardsQueryDto } from './dto/list-production-yards-query.dto.js';

const yardApiRouter: Router = Router();

yardApiRouter.use(requireApiAuth);

// GET /api/production/yards - List yards
yardApiRouter.get(
  '/',
  requirePermission(SystemPermission.PRODUCTION_YARD_VIEW),
  validateQueryDto(ListProductionYardsQueryDto),
  productionYardController.listYards
);

// GET /api/production/yards/:id - Get yard details
yardApiRouter.get(
  '/:id',
  requirePermission(SystemPermission.PRODUCTION_YARD_VIEW),
  validateUuidParam('id'),
  productionYardController.getYardById
);

// POST /api/production/yards - Create new yard
yardApiRouter.post(
  '/',
  requirePermission(SystemPermission.PRODUCTION_YARD_CREATE),
  validateDto(CreateProductionYardDto),
  productionYardController.createYard
);

// PATCH /api/production/yards/:id - Update yard
yardApiRouter.patch(
  '/:id',
  requirePermission(SystemPermission.PRODUCTION_YARD_UPDATE),
  validateUuidParam('id'),
  validateYardUpdatePayload,
  validateDto(UpdateProductionYardDto),
  productionYardController.updateYard
);

// DELETE /api/production/yards/:id - Soft delete yard
yardApiRouter.delete(
  '/:id',
  requirePermission(SystemPermission.PRODUCTION_YARD_DELETE),
  validateUuidParam('id'),
  productionYardController.deleteYard
);

export { yardApiRouter };
