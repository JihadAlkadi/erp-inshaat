import { Router } from 'express';
import { roleController } from './role.controller.js';
import { requireApiAuth } from '../auth/auth.middleware.js';
import { requirePermission } from '../authorization/authorization.middleware.js';
import { SystemPermission } from '../permission/constants/system-permission.enum.js';
import { validateDto } from '../../../common/middleware/validate-dto.middleware.js';
import { validateQueryDto } from '../../../common/middleware/validate-query-dto.middleware.js';
import { validateUuidParam } from '../../../common/middleware/validate-uuid-param.middleware.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { ListRolesQueryDto } from './dto/list-roles-query.dto.js';
import { SetRoleGlobalPermissionsDto } from './dto/set-role-global-permissions.dto.js';
import { validateRoleUpdatePayload } from './role.middleware.js';

const roleApiRouter: Router = Router();

// GET /api/system/roles - List roles (Paginated, Search)
roleApiRouter.get(
  '/',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_VIEW),
  validateQueryDto(ListRolesQueryDto),
  roleController.listRoles
);

// GET /api/system/roles/:id - Get specific role
roleApiRouter.get(
  '/:id',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_VIEW),
  validateUuidParam('id'),
  roleController.getRoleById
);

// POST /api/system/roles - Create new role
roleApiRouter.post(
  '/',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_CREATE),
  validateDto(CreateRoleDto),
  roleController.createRole
);

// PATCH /api/system/roles/:id - Update role (name, description, isActive)
roleApiRouter.patch(
  '/:id',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_UPDATE),
  validateUuidParam('id'),
  validateDto(UpdateRoleDto),
  validateRoleUpdatePayload,
  roleController.updateRole
);

// DELETE /api/system/roles/:id - Soft delete role
roleApiRouter.delete(
  '/:id',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_DELETE),
  validateUuidParam('id'),
  roleController.deleteRole
);

// GET /api/system/roles/:id/global-permissions - Get role global permission states
roleApiRouter.get(
  '/:id/global-permissions',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_VIEW),
  validateUuidParam('id'),
  roleController.getGlobalPermissions
);

// PUT /api/system/roles/:id/global-permissions - Set role global permissions
roleApiRouter.put(
  '/:id/global-permissions',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_PERMISSION_MANAGE),
  validateUuidParam('id'),
  validateDto(SetRoleGlobalPermissionsDto),
  roleController.setGlobalPermissions
);

export { roleApiRouter };
