import { Request, Response, NextFunction } from 'express';
import { InventoryCategoryService, inventoryCategoryService } from './inventory-category.service.js';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto.js';
import { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto.js';
import { ListInventoryCategoriesQueryDto } from './dto/list-inventory-categories-query.dto.js';
import { CategoryOptionsQueryDto } from './dto/category-options-query.dto.js';

export class InventoryCategoryController {
  private readonly categoryService: InventoryCategoryService;

  constructor(service: InventoryCategoryService = inventoryCategoryService) {
    this.categoryService = service;
  }

  listRoots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery ?? req.query) as unknown as ListInventoryCategoriesQueryDto;
      const result = await this.categoryService.listRoots(query);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  listChildren = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const query = (req.validatedQuery ?? req.query) as unknown as ListInventoryCategoriesQueryDto;
      const result = await this.categoryService.listChildren(id as string, query);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  searchCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery ?? req.query) as unknown as ListInventoryCategoriesQueryDto;
      const result = await this.categoryService.searchCategories(query);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  listOptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery ?? req.query) as unknown as CategoryOptionsQueryDto;
      const result = await this.categoryService.listOptions(query);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getCategoryById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const category = await this.categoryService.getCategoryById(id as string);
      res.status(200).json(ApiResponse.success(category));
    } catch (error) {
      next(error);
    }
  };

  createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateInventoryCategoryDto;
      const category = await this.categoryService.createCategory(dto);
      res.status(201).json(ApiResponse.success(category, 'تم إنشاء فئة المنتجات بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateInventoryCategoryDto;
      const category = await this.categoryService.updateCategory(id as string, dto);
      res.status(200).json(ApiResponse.success(category, 'تم تحديث فئة المنتجات بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await this.categoryService.softDeleteCategory(id as string);
      res.status(200).json(ApiResponse.success(null, 'تم أرشفة فئة المنتجات بنجاح'));
    } catch (error) {
      next(error);
    }
  };
}

export const inventoryCategoryController = new InventoryCategoryController();
