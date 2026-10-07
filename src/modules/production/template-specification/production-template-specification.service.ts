import { DataSource, Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionTemplateEntity } from '../template/production-template.entity.js';
import { ProductionTemplateSpecificationEntity } from './production-template-specification.entity.js';
import {
  ProductionTemplateGuardService,
  productionTemplateGuardService,
} from '../template/production-template-guard.service.js';
import { CreateTemplateSpecificationDto } from './dto/create-specification.dto.js';
import { UpdateTemplateSpecificationDto } from './dto/update-specification.dto.js';
import { ReorderTemplateSpecificationsDto } from './dto/reorder-specifications.dto.js';
import {
  ProductionTemplateSpecificationDto,
  toProductionTemplateSpecificationDto,
} from './production-template-specification.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class ProductionTemplateSpecificationService {
  private specRepo: Repository<ProductionTemplateSpecificationEntity>;
  private guardService: ProductionTemplateGuardService;

  constructor(
    private dataSource: DataSource = AppDataSource,
    guardService: ProductionTemplateGuardService = productionTemplateGuardService
  ) {
    this.specRepo = this.dataSource.getRepository(ProductionTemplateSpecificationEntity);
    this.guardService = guardService;
  }

  async listSpecifications(templateId: string): Promise<ProductionTemplateSpecificationDto[]> {
    await this.guardService.requireExistingTemplate(templateId);

    const specs = await this.specRepo.find({
      where: { templateId },
      order: { sortOrder: 'ASC' },
    });

    return specs.map(toProductionTemplateSpecificationDto);
  }

  async addSpecification(
    templateId: string,
    dto: CreateTemplateSpecificationDto
  ): Promise<ProductionTemplateSpecificationDto> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Lock template row explicitly & check not archived
      await this.guardService.lockMutableTemplate(templateId, manager);

      // 2. Read current active specifications with lock
      const existingSpecs = await manager.find(ProductionTemplateSpecificationEntity, {
        where: { templateId },
        order: { sortOrder: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      const maxOrder = existingSpecs.length > 0 ? existingSpecs[existingSpecs.length - 1].sortOrder : 0;
      const nextOrder = maxOrder + 1;
      const sortOrder = dto.sortOrder && dto.sortOrder >= 1 && dto.sortOrder <= nextOrder ? dto.sortOrder : nextOrder;

      // If inserted before end, shift later specifications
      if (sortOrder < nextOrder) {
        await manager
          .createQueryBuilder()
          .update(ProductionTemplateSpecificationEntity)
          .set({ sortOrder: () => 'sort_order + 1' })
          .where('template_id = :templateId AND sort_order >= :sortOrder', {
            templateId,
            sortOrder,
          })
          .execute();
      }

      const spec = manager.create(ProductionTemplateSpecificationEntity, {
        templateId,
        name: dto.name.trim(),
        value: dto.value.trim(),
        unit: dto.unit ? dto.unit.trim() : null,
        sortOrder,
      });

      const saved = await manager.save(spec);
      return toProductionTemplateSpecificationDto(saved);
    });
  }

  async updateSpecification(
    templateId: string,
    specId: string,
    dto: UpdateTemplateSpecificationDto
  ): Promise<ProductionTemplateSpecificationDto> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Lock template row explicitly & check not archived
      await this.guardService.lockMutableTemplate(templateId, manager);

      const spec = await manager.findOne(ProductionTemplateSpecificationEntity, {
        where: { id: specId, templateId },
      });
      if (!spec) {
        throw new NotFoundError('الخاصية غير موجودة', 'PRODUCTION_TEMPLATE_SPECIFICATION_NOT_FOUND');
      }

      if (dto.name !== undefined) spec.name = dto.name.trim();
      if (dto.value !== undefined) spec.value = dto.value.trim();
      if (dto.unit !== undefined) spec.unit = dto.unit ? dto.unit.trim() : null;

      const saved = await manager.save(spec);
      return toProductionTemplateSpecificationDto(saved);
    });
  }

  async deleteSpecification(templateId: string, specId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // 1. Lock template row & verify not archived
      await this.guardService.lockMutableTemplate(templateId, manager);

      const spec = await manager.findOne(ProductionTemplateSpecificationEntity, {
        where: { id: specId, templateId },
      });
      if (!spec) {
        throw new NotFoundError('الخاصية غير موجودة', 'PRODUCTION_TEMPLATE_SPECIFICATION_NOT_FOUND');
      }

      await manager.delete(ProductionTemplateSpecificationEntity, specId);

      // Compact remaining specifications into dense 1..N
      const remaining = await manager.find(ProductionTemplateSpecificationEntity, {
        where: { templateId },
        order: { sortOrder: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      for (let i = 0; i < remaining.length; i++) {
        await manager.update(
          ProductionTemplateSpecificationEntity,
          { id: remaining[i].id },
          { sortOrder: i + 1 }
        );
      }
    });
  }

  async reorderSpecifications(
    templateId: string,
    dto: ReorderTemplateSpecificationsDto
  ): Promise<ProductionTemplateSpecificationDto[]> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Lock template row & verify not archived
      await this.guardService.lockMutableTemplate(templateId, manager);

      // 2. Lock active specifications
      const existingSpecs = await manager.find(ProductionTemplateSpecificationEntity, {
        where: { templateId },
        lock: { mode: 'pessimistic_write' },
      });

      const uniqueIds = new Set(dto.specificationIds);
      if (
        uniqueIds.size !== dto.specificationIds.length ||
        dto.specificationIds.length !== existingSpecs.length
      ) {
        throw new BusinessRuleError(
          'قائمة المعرفات غير متطابقة مع مواصفات القالب',
          'PRODUCTION_TEMPLATE_SPECIFICATION_INVALID_REORDER'
        );
      }

      const existingMap = new Map(existingSpecs.map((s) => [s.id, s]));
      for (const id of dto.specificationIds) {
        if (!existingMap.has(id)) {
          throw new BusinessRuleError(
            'أحد المعرفات لا يتبع لهذا القالب',
            'PRODUCTION_TEMPLATE_SPECIFICATION_INVALID_REORDER'
          );
        }
      }

      // Update dense ordering 1..N
      for (let i = 0; i < dto.specificationIds.length; i++) {
        const id = dto.specificationIds[i];
        await manager.update(
          ProductionTemplateSpecificationEntity,
          { id },
          { sortOrder: i + 1 }
        );
      }

      const updated = await manager.find(ProductionTemplateSpecificationEntity, {
        where: { templateId },
        order: { sortOrder: 'ASC' },
      });

      return updated.map(toProductionTemplateSpecificationDto);
    });
  }
}

export const productionTemplateSpecificationService = new ProductionTemplateSpecificationService();

