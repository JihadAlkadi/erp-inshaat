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

const userApiRouter: Router = Router();

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

export { userApiRouter };
