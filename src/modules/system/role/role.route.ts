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
import { ListProductionDepartmentAdminLookupQueryDto } from '../../production/authorization/dto/list-production-department-admin-lookup-query.dto.js';
import { ListProductionYardAdminLookupQueryDto } from '../../production/authorization/dto/list-production-yard-admin-lookup-query.dto.js';
import { SetPermissionStateDto } from '../permission-grant/dto/set-permission-state.dto.js';
import { CreateAccessRuleDto } from '../access-rule/dto/create-access-rule.dto.js';
import { UpdateAccessRuleDto } from '../access-rule/dto/update-access-rule.dto.js';
import { validateRoleUpdatePayload } from './role.middleware.js';

const roleApiRouter: Router = Router();

// Lookups for Role Access Rule administration
roleApiRouter.get(
  '/lookups/departments',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_PERMISSION_MANAGE),
  validateQueryDto(ListProductionDepartmentAdminLookupQueryDto),
  roleController.listDepartmentsLookup
);

roleApiRouter.get(
  '/lookups/yards',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_PERMISSION_MANAGE),
  validateQueryDto(ListProductionYardAdminLookupQueryDto),
  roleController.listYardsLookup
);

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

// GET /api/system/roles/:id/permissions - Get role permissions administration state
roleApiRouter.get(
  '/:id/permissions',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_VIEW),
  validateUuidParam('id'),
  roleController.getPermissionsState
);

// GET /api/system/roles/:id/permissions/:permissionId/access-rules - Get access rules for role permission
roleApiRouter.get(
  '/:id/permissions/:permissionId/access-rules',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_VIEW),
  validateUuidParam('id'),
  validateUuidParam('permissionId'),
  roleController.getPermissionAccessRules
);

// PUT /api/system/roles/:id/permissions/:permissionId/state - Set role permission enabled state
roleApiRouter.put(
  '/:id/permissions/:permissionId/state',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_PERMISSION_MANAGE),
  validateUuidParam('id'),
  validateUuidParam('permissionId'),
  validateDto(SetPermissionStateDto),
  roleController.setPermissionState
);

// POST /api/system/roles/:id/permissions/:permissionId/access-rules - Add access rule to role permission
roleApiRouter.post(
  '/:id/permissions/:permissionId/access-rules',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_PERMISSION_MANAGE),
  validateUuidParam('id'),
  validateUuidParam('permissionId'),
  validateDto(CreateAccessRuleDto),
  roleController.createAccessRule
);

// PUT /api/system/roles/:id/permissions/:permissionId/access-rules/:ruleId - Update access rule for role permission
roleApiRouter.put(
  '/:id/permissions/:permissionId/access-rules/:ruleId',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_PERMISSION_MANAGE),
  validateUuidParam('id'),
  validateUuidParam('permissionId'),
  validateUuidParam('ruleId'),
  validateDto(UpdateAccessRuleDto),
  roleController.updateAccessRule
);

// DELETE /api/system/roles/:id/permissions/:permissionId/access-rules/:ruleId - Soft delete access rule for role permission
roleApiRouter.delete(
  '/:id/permissions/:permissionId/access-rules/:ruleId',
  requireApiAuth,
  requirePermission(SystemPermission.ROLE_PERMISSION_MANAGE),
  validateUuidParam('id'),
  validateUuidParam('permissionId'),
  validateUuidParam('ruleId'),
  roleController.deleteAccessRule
);

export { roleApiRouter };
