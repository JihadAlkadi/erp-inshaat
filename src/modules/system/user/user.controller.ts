import { Request, Response, NextFunction } from 'express';
import { UserService, userService } from './user.service.js';
import { UserPermissionService, userPermissionService } from './user-permission.service.js';
import {
  ProductionAdminLookupService,
  productionAdminLookupService,
} from '../../production/authorization/production-admin-lookup.service.js';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { ListProductionDepartmentAdminLookupQueryDto } from '../../production/authorization/dto/list-production-department-admin-lookup-query.dto.js';
import { ListProductionYardAdminLookupQueryDto } from '../../production/authorization/dto/list-production-yard-admin-lookup-query.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { SetPermissionStateDto } from '../permission-grant/dto/set-permission-state.dto.js';
import { CreateAccessRuleDto } from '../access-rule/dto/create-access-rule.dto.js';
import { UpdateAccessRuleDto } from '../access-rule/dto/update-access-rule.dto.js';

export class UserController {
  private readonly userService: UserService;
  private readonly userPermissionService: UserPermissionService;
  private readonly adminLookupService: ProductionAdminLookupService;

  constructor(
    uService: UserService = userService,
    upService: UserPermissionService = userPermissionService,
    lookupService: ProductionAdminLookupService = productionAdminLookupService
  ) {
    this.userService = uService;
    this.userPermissionService = upService;
    this.adminLookupService = lookupService;
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

  listDepartmentsLookup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.validatedQuery) {
        throw new Error('Validated query parameters not found on request context');
      }
      const query = req.validatedQuery as ListProductionDepartmentAdminLookupQueryDto;
      const result = await this.adminLookupService.listDepartmentsForLookup(query.search, query.limit);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  listYardsLookup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.validatedQuery) {
        throw new Error('Validated query parameters not found on request context');
      }
      const query = req.validatedQuery as ListProductionYardAdminLookupQueryDto;
      const result = await this.adminLookupService.listYardsForLookup(query.search, query.departmentId, query.limit);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getPermissionsState = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.userPermissionService.getUserPermissionsState(
        id as string,
        req.user?.id
      );
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getPermissionAccessRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, permissionId } = req.params;
      const result = await this.userPermissionService.getUserPermissionAccessRules(
        id as string,
        permissionId as string
      );
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  setPermissionState = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, permissionId } = req.params;
      const dto = req.body as SetPermissionStateDto;
      const result = await this.userPermissionService.setUserPermissionState(
        id as string,
        permissionId as string,
        dto.enabled,
        req.user!
      );
      res.status(200).json(ApiResponse.success(result, result.message));
    } catch (error) {
      next(error);
    }
  };

  createAccessRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, permissionId } = req.params;
      const dto = req.body as CreateAccessRuleDto;
      const result = await this.userPermissionService.createUserAccessRule(
        id as string,
        permissionId as string,
        dto,
        req.user!
      );
      res.status(201).json(ApiResponse.success(result, 'تمت إضافة قاعدة الوصول بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateAccessRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, permissionId, ruleId } = req.params;
      const dto = req.body as UpdateAccessRuleDto;
      const result = await this.userPermissionService.updateUserAccessRule(
        id as string,
        permissionId as string,
        ruleId as string,
        dto,
        req.user!
      );
      res.status(200).json(ApiResponse.success(result, 'تم تحديث قاعدة الوصول بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteAccessRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, permissionId, ruleId } = req.params;
      const result = await this.userPermissionService.deleteUserAccessRule(
        id as string,
        permissionId as string,
        ruleId as string,
        req.user!
      );
      res.status(200).json(ApiResponse.success(null, result.message));
    } catch (error) {
      next(error);
    }
  };
}

export const userController = new UserController();
