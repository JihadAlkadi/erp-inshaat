import { Request, Response, NextFunction } from 'express';
import { ProductionYardService, productionYardService } from './production-yard.service.js';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { CreateProductionYardDto } from './dto/create-production-yard.dto.js';
import { UpdateProductionYardDto } from './dto/update-production-yard.dto.js';
import { ListProductionYardsQueryDto } from './dto/list-production-yards-query.dto.js';
import { getProductionAccessPolicy } from '../authorization/production-authorization-context.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';

export class ProductionYardController {
  private readonly yardService: ProductionYardService;

  constructor(service: ProductionYardService = productionYardService) {
    this.yardService = service;
  }

  listYards = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery ?? req.query) as unknown as ListProductionYardsQueryDto;
      const policy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_YARD_VIEW
      );
      const result = await this.yardService.listYards(query, policy);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getYardById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const policy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_YARD_VIEW
      );
      const yard = await this.yardService.getYardById(id as string, policy);
      res.status(200).json(ApiResponse.success(yard));
    } catch (error) {
      next(error);
    }
  };

  createYard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateProductionYardDto;
      const policy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_YARD_CREATE
      );
      const yard = await this.yardService.createYard(dto, policy);
      res.status(201).json(ApiResponse.success(yard, 'تم إنشاء ساحة الإنتاج بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateYard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateProductionYardDto;
      const policy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_YARD_UPDATE
      );
      const yard = await this.yardService.updateYard(id as string, dto, policy);
      res.status(200).json(ApiResponse.success(yard, 'تم تحديث بيانات ساحة الإنتاج بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteYard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const policy = await getProductionAccessPolicy(
        req,
        req.user!,
        SystemPermission.PRODUCTION_YARD_DELETE
      );
      await this.yardService.softDeleteYard(id as string, policy);
      res.status(200).json(ApiResponse.success(null, 'تم أرشفة ساحة الإنتاج بنجاح'));
    } catch (error) {
      next(error);
    }
  };
}

export const productionYardController = new ProductionYardController();
