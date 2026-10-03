import { Request, Response, NextFunction } from 'express';
import { RoleService, roleService } from './role.service.js';
import { RolePermissionService, rolePermissionService } from './role-permission.service.js';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { ListRolesQueryDto } from './dto/list-roles-query.dto.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { SetRoleGlobalPermissionsDto } from './dto/set-role-global-permissions.dto.js';

export class RoleController {
  private readonly roleService: RoleService;
  private readonly rolePermissionService: RolePermissionService;

  constructor(
    rService: RoleService = roleService,
    rpService: RolePermissionService = rolePermissionService
  ) {
    this.roleService = rService;
    this.rolePermissionService = rpService;
  }

  listRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.validatedQuery) {
        throw new Error('Validated query parameters not found on request context');
      }
      const query = req.validatedQuery as ListRolesQueryDto;
      const result = await this.roleService.listRoles(query);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getRoleById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const role = await this.roleService.getRoleById(id as string);
      res.status(200).json(ApiResponse.success(role));
    } catch (error) {
      next(error);
    }
  };

  createRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateRoleDto;
      const createdRole = await this.roleService.createRole(dto);
      res.status(201).json(ApiResponse.success(createdRole, 'تم إنشاء الدور بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateRoleDto;
      const updatedRole = await this.roleService.updateRole(id as string, dto);
      res.status(200).json(ApiResponse.success(updatedRole, 'تم تحديث بيانات الدور بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.roleService.softDeleteRole(id as string);
      res.status(200).json(ApiResponse.success(null, result.message));
    } catch (error) {
      next(error);
    }
  };

  getGlobalPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.rolePermissionService.getRoleGlobalPermissionStates(id as string);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  setGlobalPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as SetRoleGlobalPermissionsDto;
      const result = await this.rolePermissionService.setRoleGlobalPermissions(
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

export const roleController = new RoleController();
