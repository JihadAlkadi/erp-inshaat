import { Request, Response, NextFunction } from 'express';
import { StudiesTemplateService, studiesTemplateService } from '../services/studies-template.service.js';
import { ApiResponse } from '../../../../common/responses/api-response.js';

export class StudiesTemplateController {
  private service: StudiesTemplateService;

  constructor(service: StudiesTemplateService = studiesTemplateService) {
    this.service = service;
  }

  listTemplates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery ?? req.query) as any;
      const result = await this.service.listTemplates(query);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getTemplateById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.service.getTemplateById(id as string);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  createTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.createTemplate(req.body);
      res.status(201).json(ApiResponse.success(result, 'تم إنشاء قالب التصنيع بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.service.updateTemplate(id as string, req.body);
      res.status(200).json(ApiResponse.success(result, 'تم تحديث قالب التصنيع بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await this.service.softDeleteTemplate(id as string);
      res.status(200).json(ApiResponse.success(null, 'تمت أرشفة قالب التصنيع بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  // Specifications
  addSpecification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.service.addSpecification(id as string, req.body);
      res.status(201).json(ApiResponse.success(result, 'تمت إضافة الخاصية بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateSpecification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, specId } = req.params;
      const result = await this.service.updateSpecification(id as string, specId as string, req.body);
      res.status(200).json(ApiResponse.success(result, 'تم تحديث الخاصية بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteSpecification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, specId } = req.params;
      await this.service.deleteSpecification(id as string, specId as string);
      res.status(200).json(ApiResponse.success(null, 'تم حذف الخاصية بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  reorderSpecifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.service.reorderSpecifications(id as string, req.body);
      res.status(200).json(ApiResponse.success(result, 'تم إعادة ترتيب الخصائص بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  // Stages
  addStage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.service.addStage(id as string, req.body);
      res.status(201).json(ApiResponse.success(result, 'تمت إضافة المرحلة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateStage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId } = req.params;
      const result = await this.service.updateStage(id as string, stageId as string, req.body);
      res.status(200).json(ApiResponse.success(result, 'تم تحديث المرحلة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteStage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId } = req.params;
      await this.service.softDeleteStage(id as string, stageId as string);
      res.status(200).json(ApiResponse.success(null, 'تمت أرشفة المرحلة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  reorderStages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.service.reorderStages(id as string, req.body);
      res.status(200).json(ApiResponse.success(result, 'تم إعادة ترتيب المراحل بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  // Planned Materials
  addPlannedMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId } = req.params;
      const result = await this.service.addPlannedMaterial(id as string, stageId as string, req.body);
      res.status(201).json(ApiResponse.success(result, 'تمت إضافة المادة المخططة للمرحلة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updatePlannedMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId, materialId } = req.params;
      const result = await this.service.updatePlannedMaterial(
        id as string,
        stageId as string,
        materialId as string,
        req.body
      );
      res.status(200).json(ApiResponse.success(result, 'تم تحديث المادة المخططة للمرحلة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  removePlannedMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, stageId, materialId } = req.params;
      await this.service.removePlannedMaterial(id as string, stageId as string, materialId as string);
      res.status(200).json(ApiResponse.success(null, 'تم حذف المادة المخططة للمرحلة بنجاح'));
    } catch (error) {
      next(error);
    }
  };
}

export const studiesTemplateController = new StudiesTemplateController();
