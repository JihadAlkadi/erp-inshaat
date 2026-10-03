import { Request, Response, NextFunction } from 'express';
import { UserService, userService } from './user.service.js';
import { UserPermissionService, userPermissionService } from './user-permission.service.js';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { SetUserGlobalPermissionsDto } from './dto/set-user-global-permissions.dto.js';

export class UserController {
  private readonly userService: UserService;
  private readonly userPermissionService: UserPermissionService;

  constructor(
    uService: UserService = userService,
    upService: UserPermissionService = userPermissionService
  ) {
    this.userService = uService;
    this.userPermissionService = upService;
  }

  listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.validatedQuery) {
        throw new Error('Validated query parameters not found on request context');
      }
      const query = req.validatedQuery as ListUsersQueryDto;
      const result = await this.userService.listUsers(query);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id as string);
      res.status(200).json(ApiResponse.success(user));
    } catch (error) {
      next(error);
    }
  };

  createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateUserDto;
      const createdUser = await this.userService.createUser(dto);
      res.status(201).json(ApiResponse.success(createdUser, 'تم إنشاء المستخدم بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateUserDto;
      const updatedUser = await this.userService.updateUser(id as string, dto, req.user!);
      res.status(200).json(ApiResponse.success(updatedUser, 'تم تحديث بيانات المستخدم بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.userService.softDeleteUser(id as string, req.user!);
      res.status(200).json(ApiResponse.success(null, result.message));
    } catch (error) {
      next(error);
    }
  };

  getGlobalPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.userPermissionService.getUserGlobalPermissionStates(id as string);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  setGlobalPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as SetUserGlobalPermissionsDto;
      const result = await this.userPermissionService.setUserGlobalPermissions(
        id as string,
        dto.permissionIds,
        req.user!
      );
      res.status(200).json(ApiResponse.success(result, result.message));
    } catch (error) {
      next(error);
    }
  };
}

export const userController = new UserController();

