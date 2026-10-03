import { Router } from 'express';
import { productionDepartmentController } from './production-department.controller.js';
import { requireApiAuth } from '../../system/auth/auth.middleware.js';
import { requirePermission } from '../../system/authorization/authorization.middleware.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { validateDto } from '../../../common/middleware/validate-dto.middleware.js';
import { validateQueryDto } from '../../../common/middleware/validate-query-dto.middleware.js';
import { validateUuidParam } from '../../../common/middleware/validate-uuid-param.middleware.js';
import { validateDepartmentUpdatePayload } from './production-department.middleware.js';
import { CreateProductionDepartmentDto } from './dto/create-production-department.dto.js';
import { UpdateProductionDepartmentDto } from './dto/update-production-department.dto.js';
import { ListProductionDepartmentsQueryDto } from './dto/list-production-departments-query.dto.js';

const departmentApiRouter: Router = Router();

departmentApiRouter.use(requireApiAuth);

// GET /api/production/departments - List departments
departmentApiRouter.get(
  '/',
  requirePermission(SystemPermission.PRODUCTION_DEPARTMENT_VIEW),
  validateQueryDto(ListProductionDepartmentsQueryDto),
  productionDepartmentController.listDepartments
);

// GET /api/production/departments/:id - Get department details
departmentApiRouter.get(
  '/:id',
  requirePermission(SystemPermission.PRODUCTION_DEPARTMENT_VIEW),
  validateUuidParam('id'),
  productionDepartmentController.getDepartmentById
);

// POST /api/production/departments - Create new department
departmentApiRouter.post(
  '/',
  requirePermission(SystemPermission.PRODUCTION_DEPARTMENT_CREATE),
  validateDto(CreateProductionDepartmentDto),
  productionDepartmentController.createDepartment
);

// PATCH /api/production/departments/:id - Update department
departmentApiRouter.patch(
  '/:id',
  requirePermission(SystemPermission.PRODUCTION_DEPARTMENT_UPDATE),
  validateUuidParam('id'),
  validateDepartmentUpdatePayload,
  validateDto(UpdateProductionDepartmentDto),
  productionDepartmentController.updateDepartment
);

// DELETE /api/production/departments/:id - Soft delete department
departmentApiRouter.delete(
  '/:id',
  requirePermission(SystemPermission.PRODUCTION_DEPARTMENT_DELETE),
  validateUuidParam('id'),
  productionDepartmentController.deleteDepartment
);

export { departmentApiRouter };
