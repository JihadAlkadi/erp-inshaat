import { Request, Response, NextFunction } from 'express';
import { ProductionDepartmentService, productionDepartmentService } from './production-department.service.js';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { CreateProductionDepartmentDto } from './dto/create-production-department.dto.js';
import { UpdateProductionDepartmentDto } from './dto/update-production-department.dto.js';
import { ListProductionDepartmentsQueryDto } from './dto/list-production-departments-query.dto.js';
import { getProductionAccessPolicy } from '../authorization/production-authorization-context.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';

export class ProductionDepartmentController {
  private readonly departmentService: ProductionDepartmentService;

  constructor(service: ProductionDepartmentService = productionDepartmentService) {
    this.departmentService = service;
  }

  listDepartments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery ?? req.query) as unknown as ListProductionDepartmentsQueryDto;
      const policy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_DEPARTMENT_VIEW
      );
      const result = await this.departmentService.listDepartments(query, policy);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getDepartmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const policy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_DEPARTMENT_VIEW
      );
      const department = await this.departmentService.getDepartmentById(id as string, policy);
      res.status(200).json(ApiResponse.success(department));
    } catch (error) {
      next(error);
    }
  };

  createDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateProductionDepartmentDto;
      const department = await this.departmentService.createDepartment(dto);
      res.status(201).json(ApiResponse.success(department, 'تم إنشاء قسم الإنتاج بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateProductionDepartmentDto;
      const policy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_DEPARTMENT_UPDATE
      );
      const department = await this.departmentService.updateDepartment(id as string, dto, policy);
      res.status(200).json(ApiResponse.success(department, 'تم تحديث بيانات قسم الإنتاج بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const policy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_DEPARTMENT_DELETE
      );
      await this.departmentService.softDeleteDepartment(id as string, policy);
      res.status(200).json(ApiResponse.success(null, 'تم أرشفة قسم الإنتاج بنجاح'));
    } catch (error) {
      next(error);
    }
  };
}

export const productionDepartmentController = new ProductionDepartmentController();
