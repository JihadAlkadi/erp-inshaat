import { Router } from 'express';
import { productionTeamController } from './production-team.controller.js';
import { requireApiAuth } from '../../system/auth/auth.middleware.js';
import { requirePermission } from '../../system/authorization/authorization.middleware.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { validateDto } from '../../../common/middleware/validate-dto.middleware.js';
import { validateUuidParam } from '../../../common/middleware/validate-uuid-param.middleware.js';
import { SetProductionDepartmentHeadDto } from './dto/set-production-department-head.dto.js';
import { CreateProductionEngineerAssignmentDto } from './dto/create-production-engineer-assignment.dto.js';
import { UpdateProductionEngineerYardsDto } from './dto/update-production-engineer-yards.dto.js';

const productionTeamApiRouter: Router = Router({ mergeParams: true });

productionTeamApiRouter.use(requireApiAuth);

// GET /api/production/departments/:departmentId/team - Get department team
productionTeamApiRouter.get(
  '/:departmentId/team',
  requirePermission(SystemPermission.PRODUCTION_ASSIGNMENT_VIEW),
  validateUuidParam('departmentId'),
  productionTeamController.getDepartmentTeam
);

// PUT /api/production/departments/:departmentId/team/head - Set department head
productionTeamApiRouter.put(
  '/:departmentId/team/head',
  requirePermission(SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE),
  validateUuidParam('departmentId'),
  validateDto(SetProductionDepartmentHeadDto),
  productionTeamController.setDepartmentHead
);

// POST /api/production/departments/:departmentId/team/engineers - Add engineer assignment
productionTeamApiRouter.post(
  '/:departmentId/team/engineers',
  requirePermission(SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE),
  validateUuidParam('departmentId'),
  validateDto(CreateProductionEngineerAssignmentDto),
  productionTeamController.addEngineer
);

// PUT /api/production/departments/:departmentId/team/engineers/:assignmentId - Update engineer yards
productionTeamApiRouter.put(
  '/:departmentId/team/engineers/:assignmentId',
  requirePermission(SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE),
  validateUuidParam('departmentId'),
  validateUuidParam('assignmentId'),
  validateDto(UpdateProductionEngineerYardsDto),
  productionTeamController.updateEngineerYards
);

// DELETE /api/production/departments/:departmentId/team/engineers/:assignmentId - Remove engineer assignment
productionTeamApiRouter.delete(
  '/:departmentId/team/engineers/:assignmentId',
  requirePermission(SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE),
  validateUuidParam('departmentId'),
  validateUuidParam('assignmentId'),
  productionTeamController.removeEngineer
);

export { productionTeamApiRouter };
