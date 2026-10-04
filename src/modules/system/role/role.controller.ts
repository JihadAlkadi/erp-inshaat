import { Request, Response, NextFunction } from 'express';
import { RoleService, roleService } from './role.service.js';
import { RolePermissionService, rolePermissionService } from './role-permission.service.js';
import {
  ProductionAdminLookupService,
  productionAdminLookupService,
} from '../../production/authorization/production-admin-lookup.service.js';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { ListRolesQueryDto } from './dto/list-roles-query.dto.js';
import { ListProductionDepartmentAdminLookupQueryDto } from '../../production/authorization/dto/list-production-department-admin-lookup-query.dto.js';
import { ListProductionYardAdminLookupQueryDto } from '../../production/authorization/dto/list-production-yard-admin-lookup-query.dto.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { SetPermissionStateDto } from '../permission-grant/dto/set-permission-state.dto.js';
import { CreateAccessRuleDto } from '../access-rule/dto/create-access-rule.dto.js';
import { UpdateAccessRuleDto } from '../access-rule/dto/update-access-rule.dto.js';

export class RoleController {
  private readonly roleService: RoleService;
  private readonly rolePermissionService: RolePermissionService;
  private readonly adminLookupService: ProductionAdminLookupService;

  constructor(
    rService: RoleService = roleService,
    rpService: RolePermissionService = rolePermissionService,
    lookupService: ProductionAdminLookupService = productionAdminLookupService
  ) {
    this.roleService = rService;
    this.rolePermissionService = rpService;
    this.adminLookupService = lookupService;
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
      const result = await this.rolePermissionService.getRolePermissionsState(id as string);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getPermissionAccessRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, permissionId } = req.params;
      const result = await this.rolePermissionService.getRolePermissionAccessRules(
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
      const result = await this.rolePermissionService.setRolePermissionState(
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
      const result = await this.rolePermissionService.createRoleAccessRule(
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
      const result = await this.rolePermissionService.updateRoleAccessRule(
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
      const result = await this.rolePermissionService.deleteRoleAccessRule(
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

export const roleController = new RoleController();
