import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { ProductionTemplateService, productionTemplateService } from './production-template.service.js';
import {
  ProductionTemplateSpecificationService,
  productionTemplateSpecificationService,
} from '../template-specification/production-template-specification.service.js';
import {
  ProductionTemplateStageService,
  productionTemplateStageService,
} from '../template-stage/production-template-stage.service.js';
import {
  ProductionTemplateStageMaterialService,
  productionTemplateStageMaterialService,
} from '../template-stage-material/production-template-stage-material.service.js';
import { CreateProductionTemplateDto } from './dto/create-template.dto.js';
import { UpdateProductionTemplateDto } from './dto/update-template.dto.js';
import { ListProductionTemplatesQueryDto } from './dto/list-templates-query.dto.js';
import { CreateTemplateSpecificationDto } from '../template-specification/dto/create-specification.dto.js';
import { UpdateTemplateSpecificationDto } from '../template-specification/dto/update-specification.dto.js';
import { ReorderTemplateSpecificationsDto } from '../template-specification/dto/reorder-specifications.dto.js';
import { CreateTemplateStageDto } from '../template-stage/dto/create-stage.dto.js';
import { UpdateTemplateStageDto } from '../template-stage/dto/update-stage.dto.js';
import { ReorderTemplateStagesDto } from '../template-stage/dto/reorder-stages.dto.js';
import { AddTemplateStageMaterialDto } from '../template-stage-material/dto/add-stage-material.dto.js';
import { UpdateTemplateStageMaterialDto } from '../template-stage-material/dto/update-stage-material.dto.js';

export class ProductionTemplateController {
  constructor(
    private templateService: ProductionTemplateService = productionTemplateService,
    private specService: ProductionTemplateSpecificationService = productionTemplateSpecificationService,
    private stageService: ProductionTemplateStageService = productionTemplateStageService,
    private materialService: ProductionTemplateStageMaterialService = productionTemplateStageMaterialService
  ) {}

  // ==========================================
  // TEMPLATES
  // ==========================================

  listTemplates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery ?? req.query) as unknown as ListProductionTemplatesQueryDto;
      const result = await this.templateService.listTemplates(query);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getTemplateById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const template = await this.templateService.getTemplateById(id as string);
      res.status(200).json(ApiResponse.success(template));
    } catch (error) {
      next(error);
    }
  };

  createTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateProductionTemplateDto;
      const template = await this.templateService.createTemplate(dto);
      res.status(201).json(ApiResponse.success(template, 'تم إنشاء قالب التصنيع بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateProductionTemplateDto;
      const template = await this.templateService.updateTemplate(id as string, dto);
      res.status(200).json(ApiResponse.success(template, 'تم تحديث بيانات القالب بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await this.templateService.softDeleteTemplate(id as string);
      res.status(200).json(ApiResponse.success(null, 'تم أرشفة قالب التصنيع بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // SPECIFICATIONS
  // ==========================================

  addSpecification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as CreateTemplateSpecificationDto;
      const spec = await this.specService.addSpecification(id as string, dto);
      res.status(201).json(ApiResponse.success(spec, 'تمت إضافة الخاصية بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateSpecification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, specId } = req.params;
      const dto = req.body as UpdateTemplateSpecificationDto;
      const spec = await this.specService.updateSpecification(id as string, specId as string, dto);
      res.status(200).json(ApiResponse.success(spec, 'تم تعديل الخاصية بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteSpecification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, specId } = req.params;
      await this.specService.deleteSpecification(id as string, specId as string);
      res.status(200).json(ApiResponse.success(null, 'تم حذف الخاصية بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  reorderSpecifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as ReorderTemplateSpecificationsDto;
      const specs = await this.specService.reorderSpecifications(id as string, dto);
      res.status(200).json(ApiResponse.success(specs, 'تم تحديث ترتيب المواصفات بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // STAGES
  // ==========================================

  addStage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as CreateTemplateStageDto;
      const stage = await this.stageService.addStage(id as string, dto);
      res.status(201).json(ApiResponse.success(stage, 'تمت إضافة المرحلة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateStage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId } = req.params;
      const dto = req.body as UpdateTemplateStageDto;
      const stage = await this.stageService.updateStage(id as string, stageId as string, dto);
      res.status(200).json(ApiResponse.success(stage, 'تم تحديث بيانات المرحلة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  softDeleteStage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId } = req.params;
      await this.stageService.softDeleteStage(id as string, stageId as string);
      res.status(200).json(ApiResponse.success(null, 'تمت أرشفة المرحلة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  reorderStages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as ReorderTemplateStagesDto;
      const stages = await this.stageService.reorderStages(id as string, dto);
      res.status(200).json(ApiResponse.success(stages, 'تم تحديث ترتيب المراحل بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // PLANNED MATERIALS
  // ==========================================

  listStageMaterials = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId } = req.params;
      const materials = await this.materialService.listStageMaterials(id as string, stageId as string);
      res.status(200).json(ApiResponse.success(materials));
    } catch (error) {
      next(error);
    }
  };

  addStageMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId } = req.params;
      const dto = req.body as AddTemplateStageMaterialDto;
      const material = await this.materialService.addPlannedMaterial(id as string, stageId as string, dto);
      res.status(201).json(ApiResponse.success(material, 'تمت إضافة المادة المخططة للمرحلة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateStageMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId, materialId } = req.params;
      const dto = req.body as UpdateTemplateStageMaterialDto;
      const material = await this.materialService.updatePlannedMaterial(
        id as string,
        stageId as string,
        materialId as string,
        dto
      );
      res.status(200).json(ApiResponse.success(material, 'تم تحديث المادة المخططة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  removeStageMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId, materialId } = req.params;
      await this.materialService.removePlannedMaterial(id as string, stageId as string, materialId as string);
      res.status(200).json(ApiResponse.success(null, 'تم حذف المادة المخططة بنجاح'));
    } catch (error) {
      next(error);
    }
  };
}

export const productionTemplateController = new ProductionTemplateController();
