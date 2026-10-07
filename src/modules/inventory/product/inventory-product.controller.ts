import { Request, Response, NextFunction } from 'express';
import { InventoryProductService, inventoryProductService } from './inventory-product.service.js';
import { inventoryProductReferenceService } from './inventory-product-reference.service.js';
import { ApiResponse } from '../../../common/responses/api-response.js';
import { CreateInventoryProductDto } from './dto/create-product.dto.js';
import { UpdateInventoryProductDto } from './dto/update-product.dto.js';
import { CreateInventoryProductUnitDto } from './dto/create-product-unit.dto.js';
import { UpdateInventoryProductUnitDto } from './dto/update-product-unit.dto.js';
import { ListInventoryProductsQueryDto } from './dto/list-products-query.dto.js';
import { ListInventoryProductUnitsQueryDto } from './dto/list-product-units-query.dto.js';

export class InventoryProductController {
  private readonly productService: InventoryProductService;

  constructor(service: InventoryProductService = inventoryProductService) {
    this.productService = service;
  }

  listProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery ?? req.query) as unknown as ListInventoryProductsQueryDto;
      const result = await this.productService.listProducts(query);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  getProductById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const product = await this.productService.getProductById(id as string);
      res.status(200).json(ApiResponse.success(product));
    } catch (error) {
      next(error);
    }
  };

  createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateInventoryProductDto;
      const product = await this.productService.createProduct(dto);
      res.status(201).json(ApiResponse.success(product, 'تم إنشاء المنتج ووحدته الأساسية بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateInventoryProductDto;
      const product = await this.productService.updateProduct(id as string, dto);
      res.status(200).json(ApiResponse.success(product, 'تم تحديث بيانات المنتج بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await this.productService.softDeleteProduct(id as string);
      res.status(200).json(ApiResponse.success(null, 'تم أرشفة المنتج بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  listUnits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId } = req.params;
      const query = (req.validatedQuery ?? req.query) as unknown as ListInventoryProductUnitsQueryDto;
      const result = await this.productService.listUnits(productId as string, query);
      res.status(200).json(ApiResponse.success(result));
    } catch (error) {
      next(error);
    }
  };

  createUnit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId } = req.params;
      const dto = req.body as CreateInventoryProductUnitDto;
      const unit = await this.productService.createUnit(productId as string, dto);
      res.status(201).json(ApiResponse.success(unit, 'تمت إضافة الوحدة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  updateUnit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId, unitId } = req.params;
      const dto = req.body as UpdateInventoryProductUnitDto;
      const unit = await this.productService.updateUnit(productId as string, unitId as string, dto);
      res.status(200).json(ApiResponse.success(unit, 'تم تحديث بيانات الوحدة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  deleteUnit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId, unitId } = req.params;
      await this.productService.softDeleteUnit(productId as string, unitId as string);
      res.status(200).json(ApiResponse.success(null, 'تم أرشفة الوحدة بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  listProductReferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;

      const result = await inventoryProductReferenceService.searchProductReferences(search, page, limit);
      res.status(200).json(ApiResponse.success(result, 'تم جلب خيارات المنتجات المرجعية بنجاح'));
    } catch (error) {
      next(error);
    }
  };

  listProductUnitReferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productId } = req.params;
      const result = await inventoryProductReferenceService.getProductUnitReferences(productId as string);
      res.status(200).json(ApiResponse.success(result, 'تم جلب خيارات وحدات المنتج بنجاح'));
    } catch (error) {
      next(error);
    }
  };
}

export const inventoryProductController = new InventoryProductController();
