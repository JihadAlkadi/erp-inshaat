import { Router } from 'express';
import { userController } from './user.controller.js';
import { requireApiAuth } from '../auth/auth.middleware.js';
import { requirePermission } from '../authorization/authorization.middleware.js';
import { SystemPermission } from '../permission/constants/system-permission.enum.js';
import { validateDto } from '../../../common/middleware/validate-dto.middleware.js';
import { validateQueryDto } from '../../../common/middleware/validate-query-dto.middleware.js';
import { validateUuidParam } from '../../../common/middleware/validate-uuid-param.middleware.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { ListProductionDepartmentAdminLookupQueryDto } from '../../production/authorization/dto/list-production-department-admin-lookup-query.dto.js';
import { ListProductionYardAdminLookupQueryDto } from '../../production/authorization/dto/list-production-yard-admin-lookup-query.dto.js';
import { SetPermissionStateDto } from '../permission-grant/dto/set-permission-state.dto.js';
import { CreateAccessRuleDto } from '../access-rule/dto/create-access-rule.dto.js';
import { UpdateAccessRuleDto } from '../access-rule/dto/update-access-rule.dto.js';
import { validateUserUpdatePayload } from './user.middleware.js';

const userApiRouter: Router = Router();

// Lookups for User Access Rule administration
userApiRouter.get(
  '/lookups/departments',
  requireApiAuth,
  requirePermission(SystemPermission.USER_PERMISSION_MANAGE),
  validateQueryDto(ListProductionDepartmentAdminLookupQueryDto),
  userController.listDepartmentsLookup
);

userApiRouter.get(
  '/lookups/yards',
  requireApiAuth,
  requirePermission(SystemPermission.USER_PERMISSION_MANAGE),
  validateQueryDto(ListProductionYardAdminLookupQueryDto),
  userController.listYardsLookup
);

// GET /api/system/users - List users (Paginated, Search)
userApiRouter.get(
  '/',
  requireApiAuth,
  requirePermission(SystemPermission.USER_VIEW),
  validateQueryDto(ListUsersQueryDto),
  userController.listUsers
);

// GET /api/system/users/:id - Get specific user
userApiRouter.get(
  '/:id',
  requireApiAuth,
  requirePermission(SystemPermission.USER_VIEW),
  validateUuidParam('id'),
  userController.getUserById
);

// POST /api/system/users - Create new user
userApiRouter.post(
  '/',
  requireApiAuth,
  requirePermission(SystemPermission.USER_CREATE),
  validateDto(CreateUserDto),
  userController.createUser
);

// PATCH /api/system/users/:id - Update user (partial update / activate / deactivate)
userApiRouter.patch(
  '/:id',
  requireApiAuth,
  requirePermission(SystemPermission.USER_UPDATE),
  validateUuidParam('id'),
  validateDto(UpdateUserDto),
  validateUserUpdatePayload,
  userController.updateUser
);

// DELETE /api/system/users/:id - Soft delete (archive) user
userApiRouter.delete(
  '/:id',
  requireApiAuth,
  requirePermission(SystemPermission.USER_DELETE),
  validateUuidParam('id'),
  userController.deleteUser
);

// GET /api/system/users/:id/permissions - Get direct user permissions administration state
userApiRouter.get(
  '/:id/permissions',
  requireApiAuth,
  requirePermission(SystemPermission.USER_VIEW),
  validateUuidParam('id'),
  userController.getPermissionsState
);

// GET /api/system/users/:id/permissions/:permissionId/access-rules - Get access rules for user permission
userApiRouter.get(
  '/:id/permissions/:permissionId/access-rules',
  requireApiAuth,
  requirePermission(SystemPermission.USER_VIEW),
  validateUuidParam('id'),
  validateUuidParam('permissionId'),
  userController.getPermissionAccessRules
);

// PUT /api/system/users/:id/permissions/:permissionId/state - Set direct user permission enabled state
userApiRouter.put(
  '/:id/permissions/:permissionId/state',
  requireApiAuth,
  requirePermission(SystemPermission.USER_PERMISSION_MANAGE),
  validateUuidParam('id'),
  validateUuidParam('permissionId'),
  validateDto(SetPermissionStateDto),
  userController.setPermissionState
);

// POST /api/system/users/:id/permissions/:permissionId/access-rules - Add access rule to user permission
userApiRouter.post(
  '/:id/permissions/:permissionId/access-rules',
  requireApiAuth,
  requirePermission(SystemPermission.USER_PERMISSION_MANAGE),
  validateUuidParam('id'),
  validateUuidParam('permissionId'),
  validateDto(CreateAccessRuleDto),
  userController.createAccessRule
);

// PUT /api/system/users/:id/permissions/:permissionId/access-rules/:ruleId - Update access rule for user permission
userApiRouter.put(
  '/:id/permissions/:permissionId/access-rules/:ruleId',
  requireApiAuth,
  requirePermission(SystemPermission.USER_PERMISSION_MANAGE),
  validateUuidParam('id'),
  validateUuidParam('permissionId'),
  validateUuidParam('ruleId'),
  validateDto(UpdateAccessRuleDto),
  userController.updateAccessRule
);

// DELETE /api/system/users/:id/permissions/:permissionId/access-rules/:ruleId - Soft delete access rule for user permission
userApiRouter.delete(
  '/:id/permissions/:permissionId/access-rules/:ruleId',
  requireApiAuth,
  requirePermission(SystemPermission.USER_PERMISSION_MANAGE),
  validateUuidParam('id'),
  validateUuidParam('permissionId'),
  validateUuidParam('ruleId'),
  userController.deleteAccessRule
);

export { userApiRouter };
