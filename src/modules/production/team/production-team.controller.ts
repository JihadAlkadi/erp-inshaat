import { Request, Response, NextFunction } from 'express';
import { ProductionTeamService, productionTeamService } from './production-team.service.js';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { SetProductionDepartmentHeadDto } from './dto/set-production-department-head.dto.js';
import { CreateProductionEngineerAssignmentDto } from './dto/create-production-engineer-assignment.dto.js';
import { UpdateProductionEngineerYardsDto } from './dto/update-production-engineer-yards.dto.js';
import { getProductionAccessPolicy } from '../authorization/production-authorization-context.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';

export class ProductionTeamController {
  private readonly teamService: ProductionTeamService;

  constructor(service: ProductionTeamService = productionTeamService) {
    this.teamService = service;
  }

  getDepartmentTeam = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const departmentId = (req.params.departmentId ?? req.params.id) as string;
      const policy = await getProductionAccessPolicy(req, req.user!, SystemPermission.PRODUCTION_ASSIGNMENT_VIEW);
      const team = await this.teamService.getDepartmentTeam(departmentId, policy);
      res.status(200).json(ApiResponse.success(team));
    } catch (error) {
      next(error);
    }
  };

  setDepartmentHead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const departmentId = (req.params.departmentId ?? req.params.id) as string;
      const dto = req.body as SetProductionDepartmentHeadDto;
      const policy = await getProductionAccessPolicy(req, req.user!, SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE);
      const result = await this.teamService.setDepartmentHead(departmentId, dto.userId, policy);
      res.status(200).json(ApiResponse.success(result.head, result.message));
    } catch (error) {
      next(error);
    }
  };

  addEngineer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const departmentId = (req.params.departmentId ?? req.params.id) as string;
      const dto = req.body as CreateProductionEngineerAssignmentDto;
      const policy = await getProductionAccessPolicy(req, req.user!, SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE);
      const result = await this.teamService.addEngineerToDepartment(departmentId, dto, policy);
      res.status(201).json(ApiResponse.success(result, 'تم إسناد المهندس وتحديد ساحاته بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateEngineerYards = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const departmentId = (req.params.departmentId ?? req.params.id) as string;
      const assignmentId = req.params.assignmentId as string;
      const dto = req.body as UpdateProductionEngineerYardsDto;
      const policy = await getProductionAccessPolicy(req, req.user!, SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE);
      const result = await this.teamService.updateEngineerYards(departmentId, assignmentId, dto, policy);
      res.status(200).json(ApiResponse.success(result, 'تم تحديث ساحات المهندس بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  removeEngineer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const departmentId = (req.params.departmentId ?? req.params.id) as string;
      const assignmentId = req.params.assignmentId as string;
      const policy = await getProductionAccessPolicy(req, req.user!, SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE);
      const result = await this.teamService.removeEngineerFromDepartment(departmentId, assignmentId, policy);
      res.status(200).json(ApiResponse.success(null, result.message));
    } catch (error) {
      next(error);
    }
  };
}

export const productionTeamController = new ProductionTeamController();
