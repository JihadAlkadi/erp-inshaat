import { DataSource, Repository, IsNull, QueryFailedError } from 'typeorm';
import { AppDataSource } from '../../../../database/data-source.js';
import { StudiesTemplateEntity } from '../entities/studies-template.entity.js';
import { StudiesTemplateSpecificationEntity } from '../entities/studies-template-specification.entity.js';
import { StudiesTemplateStageEntity } from '../entities/studies-template-stage.entity.js';
import { StudiesTemplateStageMaterialEntity } from '../entities/studies-template-stage-material.entity.js';
import { ProductionDepartmentEntity } from '../../../production/department/production-department.entity.js';
import { InventoryProductEntity } from '../../../inventory/product/inventory-product.entity.js';
import { InventoryProductUnitEntity } from '../../../inventory/product/inventory-product-unit.entity.js';

import { CreateStudiesTemplateDto } from '../dto/create-template.dto.js';
import { UpdateStudiesTemplateDto } from '../dto/update-template.dto.js';
import { ListStudiesTemplatesQueryDto } from '../dto/list-templates-query.dto.js';
import { CreateTemplateSpecificationDto } from '../dto/create-specification.dto.js';
import { UpdateTemplateSpecificationDto } from '../dto/update-specification.dto.js';
import { ReorderTemplateSpecificationsDto } from '../dto/reorder-specifications.dto.js';
import { CreateTemplateStageDto } from '../dto/create-stage.dto.js';
import { UpdateTemplateStageDto } from '../dto/update-stage.dto.js';
import { ReorderTemplateStagesDto } from '../dto/reorder-stages.dto.js';
import { AddTemplateStageMaterialDto } from '../dto/add-stage-material.dto.js';
import { UpdateTemplateStageMaterialDto } from '../dto/update-stage-material.dto.js';

import { NotFoundError } from '../../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../../common/errors/conflict.error.js';
import { BusinessRuleError } from '../../../../common/errors/business-rule.error.js';

export interface PaginatedTemplatesResult {
  items: Array<StudiesTemplateEntity & { stagesCount: number; specsCount: number }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class StudiesTemplateService {
  private templateRepo: Repository<StudiesTemplateEntity>;
  private specRepo: Repository<StudiesTemplateSpecificationEntity>;
  private stageRepo: Repository<StudiesTemplateStageEntity>;
  private materialRepo: Repository<StudiesTemplateStageMaterialEntity>;
  private departmentRepo: Repository<ProductionDepartmentEntity>;
  private productRepo: Repository<InventoryProductEntity>;
  private productUnitRepo: Repository<InventoryProductUnitEntity>;

  constructor(private dataSource: DataSource = AppDataSource) {
    this.templateRepo = this.dataSource.getRepository(StudiesTemplateEntity);
    this.specRepo = this.dataSource.getRepository(StudiesTemplateSpecificationEntity);
    this.stageRepo = this.dataSource.getRepository(StudiesTemplateStageEntity);
    this.materialRepo = this.dataSource.getRepository(StudiesTemplateStageMaterialEntity);
    this.departmentRepo = this.dataSource.getRepository(ProductionDepartmentEntity);
    this.productRepo = this.dataSource.getRepository(InventoryProductEntity);
    this.productUnitRepo = this.dataSource.getRepository(InventoryProductUnitEntity);
  }

  // ==========================================
  // 1. TEMPLATE CRUD & LISTING
  // ==========================================

  async listTemplates(query: ListStudiesTemplatesQueryDto): Promise<PaginatedTemplatesResult> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const qb = this.templateRepo.createQueryBuilder('t')
      .where('t.deleted_at IS NULL');

    if (query.status === 'active') {
      qb.andWhere('t.is_active = :isActive', { isActive: true });
    } else if (query.status === 'inactive') {
      qb.andWhere('t.is_active = :isActive', { isActive: false });
    }

    if (query.search && query.search.trim() !== '') {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(t.name LIKE :term OR t.code LIKE :term OR t.reference_number LIKE :term)', { term });
    }

    const total = await qb.getCount();

    const rawItems = await qb
      .addSelect((subQb) => {
        return subQb
          .select('COUNT(stage.id)', 'stages_count')
          .from(StudiesTemplateStageEntity, 'stage')
          .where('stage.template_id = t.id')
          .andWhere('stage.deleted_at IS NULL');
      }, 'stages_count')
      .addSelect((subQb) => {
        return subQb
          .select('COUNT(spec.id)', 'specs_count')
          .from(StudiesTemplateSpecificationEntity, 'spec')
          .where('spec.template_id = t.id');
      }, 'specs_count')
      .orderBy('t.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getRawAndEntities();

    const items = rawItems.entities.map((entity, index) => {
      const raw = rawItems.raw[index];
      const stagesCount = parseInt(raw.stages_count || '0', 10);
      const specsCount = parseInt(raw.specs_count || '0', 10);
      return Object.assign(entity, { stagesCount, specsCount });
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getTemplateById(id: string): Promise<StudiesTemplateEntity> {
    const template = await this.templateRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: {
        specifications: true,
        stages: {
          department: true,
          plannedMaterials: {
            product: true,
            productUnit: true,
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundError('القالب غير موجود', 'STUDIES_TEMPLATE_NOT_FOUND');
    }

    // Sort specifications by sortOrder
    if (template.specifications) {
      template.specifications.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // Sort stages globally by sortOrder
    if (template.stages) {
      // Filter out soft deleted stages just in case
      template.stages = template.stages.filter((s) => !s.deletedAt);
      template.stages.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return template;
  }

  async createTemplate(dto: CreateStudiesTemplateDto): Promise<StudiesTemplateEntity> {
    const normalizedCode = dto.code.trim().toUpperCase();

    // Check code uniqueness including soft deleted records
    const existing = await this.templateRepo.findOne({
      where: { code: normalizedCode },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictError('رمز القالب مستخدم مسبقاً', 'STUDIES_TEMPLATE_CODE_ALREADY_EXISTS');
    }

    const template = this.templateRepo.create({
      name: dto.name.trim(),
      code: normalizedCode,
      referenceNumber: dto.referenceNumber ? dto.referenceNumber.trim() : null,
      description: dto.description ? dto.description.trim() : null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    try {
      return await this.templateRepo.save(template);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).driverError?.errno === 1062) {
        throw new ConflictError('رمز القالب مستخدم مسبقاً', 'STUDIES_TEMPLATE_CODE_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  async updateTemplate(id: string, dto: UpdateStudiesTemplateDto): Promise<StudiesTemplateEntity> {
    const template = await this.templateRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundError('القالب غير موجود', 'STUDIES_TEMPLATE_NOT_FOUND');
    }

    if (dto.name !== undefined) {
      template.name = dto.name.trim();
    }
    if (dto.referenceNumber !== undefined) {
      template.referenceNumber = dto.referenceNumber ? dto.referenceNumber.trim() : null;
    }
    if (dto.description !== undefined) {
      template.description = dto.description ? dto.description.trim() : null;
    }
    if (dto.isActive !== undefined) {
      template.isActive = dto.isActive;
    }

    return await this.templateRepo.save(template);
  }

  async softDeleteTemplate(id: string): Promise<void> {
    const template = await this.templateRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundError('القالب غير موجود', 'STUDIES_TEMPLATE_NOT_FOUND');
    }

    template.isActive = false;
    await this.templateRepo.save(template);
    await this.templateRepo.softDelete(id);
  }

  // ==========================================
  // 2. SPECIFICATIONS CRUD & REORDER
  // ==========================================

  async addSpecification(
    templateId: string,
    dto: CreateTemplateSpecificationDto
  ): Promise<StudiesTemplateSpecificationEntity> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundError('القالب غير موجود', 'STUDIES_TEMPLATE_NOT_FOUND');
    }

    // Determine sortOrder if omitted
    let sortOrder = dto.sortOrder;
    if (!sortOrder) {
      const maxSpec = await this.specRepo.findOne({
        where: { templateId },
        order: { sortOrder: 'DESC' },
      });
      sortOrder = maxSpec ? maxSpec.sortOrder + 1 : 1;
    }

    const spec = this.specRepo.create({
      templateId,
      name: dto.name.trim(),
      value: dto.value.trim(),
      unit: dto.unit ? dto.unit.trim() : null,
      sortOrder,
    });

    return await this.specRepo.save(spec);
  }

  async updateSpecification(
    templateId: string,
    specId: string,
    dto: UpdateTemplateSpecificationDto
  ): Promise<StudiesTemplateSpecificationEntity> {
    const spec = await this.specRepo.findOne({
      where: { id: specId, templateId },
    });
    if (!spec) {
      throw new NotFoundError('الخاصية غير موجودة', 'STUDIES_TEMPLATE_SPECIFICATION_NOT_FOUND');
    }

    if (dto.name !== undefined) spec.name = dto.name.trim();
    if (dto.value !== undefined) spec.value = dto.value.trim();
    if (dto.unit !== undefined) spec.unit = dto.unit ? dto.unit.trim() : null;
    if (dto.sortOrder !== undefined) spec.sortOrder = dto.sortOrder;

    return await this.specRepo.save(spec);
  }

  async deleteSpecification(templateId: string, specId: string): Promise<void> {
    const spec = await this.specRepo.findOne({
      where: { id: specId, templateId },
    });
    if (!spec) {
      throw new NotFoundError('الخاصية غير موجودة', 'STUDIES_TEMPLATE_SPECIFICATION_NOT_FOUND');
    }

    await this.specRepo.delete(specId);
  }

  async reorderSpecifications(
    templateId: string,
    dto: ReorderTemplateSpecificationsDto
  ): Promise<StudiesTemplateSpecificationEntity[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const template = await queryRunner.manager.findOne(StudiesTemplateEntity, {
        where: { id: templateId, deletedAt: IsNull() },
      });
      if (!template) {
        throw new NotFoundError('القالب غير موجود', 'STUDIES_TEMPLATE_NOT_FOUND');
      }

      const existingSpecs = await queryRunner.manager.find(StudiesTemplateSpecificationEntity, {
        where: { templateId },
      });

      // Validate that specificationIds contains exactly the existing set with no duplicates
      const uniqueIds = new Set(dto.specificationIds);
      if (
        uniqueIds.size !== dto.specificationIds.length ||
        dto.specificationIds.length !== existingSpecs.length
      ) {
        throw new BusinessRuleError(
          'قائمة المعرفات غير متطابقة مع مواصفات القالب',
          'STUDIES_TEMPLATE_SPECIFICATION_INVALID_REORDER'
        );
      }

      const existingMap = new Map(existingSpecs.map((s) => [s.id, s]));
      for (const id of dto.specificationIds) {
        if (!existingMap.has(id)) {
          throw new BusinessRuleError(
            'أحد المعرفات لا يتبع لهذا القالب',
            'STUDIES_TEMPLATE_SPECIFICATION_INVALID_REORDER'
          );
        }
      }

      // Update sort orders to dense 1..N
      for (let i = 0; i < dto.specificationIds.length; i++) {
        const id = dto.specificationIds[i];
        await queryRunner.manager.update(
          StudiesTemplateSpecificationEntity,
          { id },
          { sortOrder: i + 1 }
        );
      }

      await queryRunner.commitTransaction();

      return await this.specRepo.find({
        where: { templateId },
        order: { sortOrder: 'ASC' },
      });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // 3. STAGES CRUD & GLOBAL REORDER
  // ==========================================

  async addStage(templateId: string, dto: CreateTemplateStageDto): Promise<StudiesTemplateStageEntity> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundError('القالب غير موجود', 'STUDIES_TEMPLATE_NOT_FOUND');
    }

    // Validate department exists and is active and not soft-deleted
    const department = await this.departmentRepo.findOne({
      where: { id: dto.departmentId },
      withDeleted: true,
    });
    if (!department) {
      throw new NotFoundError('قسم الإنتاج المحدد غير موجود', 'STUDIES_TEMPLATE_STAGE_DEPARTMENT_NOT_FOUND');
    }
    if (department.deletedAt) {
      throw new BusinessRuleError('قسم الإنتاج المحدد مؤرشف', 'STUDIES_TEMPLATE_STAGE_DEPARTMENT_ARCHIVED');
    }
    if (!department.isActive) {
      throw new BusinessRuleError('قسم الإنتاج المحدد معطل', 'STUDIES_TEMPLATE_STAGE_DEPARTMENT_INACTIVE');
    }

    // Determine sortOrder: dense append to end
    const maxStage = await this.stageRepo.findOne({
      where: { templateId, deletedAt: IsNull() },
      order: { sortOrder: 'DESC' },
    });
    const nextOrder = maxStage ? maxStage.sortOrder + 1 : 1;
    const sortOrder = dto.sortOrder && dto.sortOrder >= 1 && dto.sortOrder <= nextOrder ? dto.sortOrder : nextOrder;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // If inserted before the end, shift later stages
      if (sortOrder < nextOrder) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(StudiesTemplateStageEntity)
          .set({ sortOrder: () => 'sort_order + 1' })
          .where('template_id = :templateId AND sort_order >= :sortOrder AND deleted_at IS NULL', {
            templateId,
            sortOrder,
          })
          .execute();
      }

      const stage = queryRunner.manager.create(StudiesTemplateStageEntity, {
        templateId,
        departmentId: dto.departmentId,
        name: dto.name.trim(),
        description: dto.description ? dto.description.trim() : null,
        sortOrder,
        estimatedDurationMinutes: dto.estimatedDurationMinutes !== undefined ? dto.estimatedDurationMinutes : null,
        estimatedCost: dto.estimatedCost ? dto.estimatedCost : null,
      });

      const savedStage = await queryRunner.manager.save(stage);
      await queryRunner.commitTransaction();

      // Return with loaded department
      return await this.stageRepo.findOneOrFail({
        where: { id: savedStage.id },
        relations: { department: true },
      });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async updateStage(
    templateId: string,
    stageId: string,
    dto: UpdateTemplateStageDto
  ): Promise<StudiesTemplateStageEntity> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'STUDIES_TEMPLATE_STAGE_NOT_FOUND');
    }

    // If departmentId is changed, validate the new department
    if (dto.departmentId !== undefined && dto.departmentId !== stage.departmentId) {
      const department = await this.departmentRepo.findOne({
        where: { id: dto.departmentId },
        withDeleted: true,
      });
      if (!department) {
        throw new NotFoundError('قسم الإنتاج المحدد غير موجود', 'STUDIES_TEMPLATE_STAGE_DEPARTMENT_NOT_FOUND');
      }
      if (department.deletedAt) {
        throw new BusinessRuleError('قسم الإنتاج المحدد مؤرشف', 'STUDIES_TEMPLATE_STAGE_DEPARTMENT_ARCHIVED');
      }
      if (!department.isActive) {
        throw new BusinessRuleError('قسم الإنتاج المحدد معطل', 'STUDIES_TEMPLATE_STAGE_DEPARTMENT_INACTIVE');
      }
      stage.departmentId = dto.departmentId;
    }

    if (dto.name !== undefined) stage.name = dto.name.trim();
    if (dto.description !== undefined) stage.description = dto.description ? dto.description.trim() : null;
    if (dto.estimatedDurationMinutes !== undefined) stage.estimatedDurationMinutes = dto.estimatedDurationMinutes;
    if (dto.estimatedCost !== undefined) stage.estimatedCost = dto.estimatedCost;

    await this.stageRepo.save(stage);

    return await this.stageRepo.findOneOrFail({
      where: { id: stageId },
      relations: { department: true },
    });
  }

  async softDeleteStage(templateId: string, stageId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const stage = await queryRunner.manager.findOne(StudiesTemplateStageEntity, {
        where: { id: stageId, templateId, deletedAt: IsNull() },
      });
      if (!stage) {
        throw new NotFoundError('المرحلة غير موجودة', 'STUDIES_TEMPLATE_STAGE_NOT_FOUND');
      }

      await queryRunner.manager.softDelete(StudiesTemplateStageEntity, stageId);

      // Re-compact remaining active stages into dense 1..N
      const remainingStages = await queryRunner.manager.find(StudiesTemplateStageEntity, {
        where: { templateId, deletedAt: IsNull() },
        order: { sortOrder: 'ASC' },
      });

      for (let i = 0; i < remainingStages.length; i++) {
        await queryRunner.manager.update(
          StudiesTemplateStageEntity,
          { id: remainingStages[i].id },
          { sortOrder: i + 1 }
        );
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async reorderStages(
    templateId: string,
    dto: ReorderTemplateStagesDto
  ): Promise<StudiesTemplateStageEntity[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock template row to serialize reorders
      const template = await queryRunner.manager.findOne(StudiesTemplateEntity, {
        where: { id: templateId, deletedAt: IsNull() },
      });
      if (!template) {
        throw new NotFoundError('القالب غير موجود', 'STUDIES_TEMPLATE_NOT_FOUND');
      }

      const existingStages = await queryRunner.manager.find(StudiesTemplateStageEntity, {
        where: { templateId, deletedAt: IsNull() },
      });

      const uniqueIds = new Set(dto.stageIds);
      if (
        uniqueIds.size !== dto.stageIds.length ||
        dto.stageIds.length !== existingStages.length
      ) {
        throw new BusinessRuleError(
          'قائمة المعرفات غير متطابقة مع مراحل القالب',
          'STUDIES_TEMPLATE_STAGE_INVALID_REORDER'
        );
      }

      const existingMap = new Map(existingStages.map((s) => [s.id, s]));
      for (const id of dto.stageIds) {
        if (!existingMap.has(id)) {
          throw new BusinessRuleError(
            'أحد المعرفات لا يتبع لهذا القالب',
            'STUDIES_TEMPLATE_STAGE_INVALID_REORDER'
          );
        }
      }

      // Re-order densely 1..N
      for (let i = 0; i < dto.stageIds.length; i++) {
        const id = dto.stageIds[i];
        await queryRunner.manager.update(
          StudiesTemplateStageEntity,
          { id },
          { sortOrder: i + 1 }
        );
      }

      await queryRunner.commitTransaction();

      return await this.stageRepo.find({
        where: { templateId, deletedAt: IsNull() },
        relations: { department: true },
        order: { sortOrder: 'ASC' },
      });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // 4. PLANNED MATERIALS CRUD
  // ==========================================

  async addPlannedMaterial(
    templateId: string,
    stageId: string,
    dto: AddTemplateStageMaterialDto
  ): Promise<StudiesTemplateStageMaterialEntity> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'STUDIES_TEMPLATE_STAGE_NOT_FOUND');
    }

    // Cross-module validation: Product must exist, not deleted, and active
    const product = await this.productRepo.findOne({
      where: { id: dto.productId, deletedAt: IsNull() },
    });
    if (!product) {
      throw new NotFoundError('المنتج المحدد غير موجود', 'STUDIES_TEMPLATE_MATERIAL_PRODUCT_NOT_FOUND');
    }
    if (!product.isActive) {
      throw new BusinessRuleError('المنتج المحدد معطل', 'STUDIES_TEMPLATE_MATERIAL_PRODUCT_INACTIVE');
    }

    // Cross-module validation: Unit must exist, not deleted, and belong to the product
    const unit = await this.productUnitRepo.findOne({
      where: { id: dto.productUnitId },
      withDeleted: true,
    });
    if (!unit) {
      throw new NotFoundError('وحدة القياس المحددة غير موجودة', 'STUDIES_TEMPLATE_MATERIAL_UNIT_NOT_FOUND');
    }
    if (unit.deletedAt) {
      throw new BusinessRuleError('وحدة القياس المحددة مؤرشفة', 'STUDIES_TEMPLATE_MATERIAL_UNIT_ARCHIVED');
    }
    if (unit.productId !== dto.productId) {
      throw new BusinessRuleError(
        'وحدة القياس المحددة لا تنتمي إلى هذا المنتج',
        'STUDIES_TEMPLATE_MATERIAL_UNIT_NOT_BELONG_TO_PRODUCT'
      );
    }

    // Validate quantity > 0
    const qtyNum = parseFloat(dto.plannedQuantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      throw new BusinessRuleError('الكمية المخططة يجب أن تكون أكبر من الصفر', 'STUDIES_TEMPLATE_STAGE_MATERIAL_INVALID_QUANTITY');
    }

    // Check duplicate: prevent same product unit for the same stage
    const duplicate = await this.materialRepo.findOne({
      where: { stageId, productUnitId: dto.productUnitId },
    });
    if (duplicate) {
      throw new ConflictError(
        'تمت إضافة وحدة القياس هذه مسبقاً لهذه المرحلة',
        'STUDIES_TEMPLATE_STAGE_MATERIAL_ALREADY_EXISTS'
      );
    }

    const material = this.materialRepo.create({
      stageId,
      productId: dto.productId,
      productUnitId: dto.productUnitId,
      plannedQuantity: dto.plannedQuantity,
    });

    const saved = await this.materialRepo.save(material);

    return await this.materialRepo.findOneOrFail({
      where: { id: saved.id },
      relations: {
        product: true,
        productUnit: true,
      },
    });
  }

  async updatePlannedMaterial(
    templateId: string,
    stageId: string,
    materialId: string,
    dto: UpdateTemplateStageMaterialDto
  ): Promise<StudiesTemplateStageMaterialEntity> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'STUDIES_TEMPLATE_STAGE_NOT_FOUND');
    }

    const material = await this.materialRepo.findOne({
      where: { id: materialId, stageId },
    });
    if (!material) {
      throw new NotFoundError('المادة المخططة غير موجودة', 'STUDIES_TEMPLATE_STAGE_MATERIAL_NOT_FOUND');
    }

    // If productUnitId changed, validate it belongs to the same product and not duplicate
    if (dto.productUnitId !== undefined && dto.productUnitId !== material.productUnitId) {
      const unit = await this.productUnitRepo.findOne({
        where: { id: dto.productUnitId },
        withDeleted: true,
      });
      if (!unit) {
        throw new NotFoundError('وحدة القياس المحددة غير موجودة', 'STUDIES_TEMPLATE_MATERIAL_UNIT_NOT_FOUND');
      }
      if (unit.deletedAt) {
        throw new BusinessRuleError('وحدة القياس المحددة مؤرشفة', 'STUDIES_TEMPLATE_MATERIAL_UNIT_ARCHIVED');
      }
      if (unit.productId !== material.productId) {
        throw new BusinessRuleError(
          'وحدة القياس المحددة لا تنتمي إلى هذا المنتج',
          'STUDIES_TEMPLATE_MATERIAL_UNIT_NOT_BELONG_TO_PRODUCT'
        );
      }

      const duplicate = await this.materialRepo.findOne({
        where: { stageId, productUnitId: dto.productUnitId },
      });
      if (duplicate && duplicate.id !== materialId) {
        throw new ConflictError(
          'تمت إضافة وحدة القياس هذه مسبقاً لهذه المرحلة',
          'STUDIES_TEMPLATE_STAGE_MATERIAL_ALREADY_EXISTS'
        );
      }
      material.productUnitId = dto.productUnitId;
    }

    const qtyNum = parseFloat(dto.plannedQuantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      throw new BusinessRuleError('الكمية المخططة يجب أن تكون أكبر من الصفر', 'STUDIES_TEMPLATE_STAGE_MATERIAL_INVALID_QUANTITY');
    }
    material.plannedQuantity = dto.plannedQuantity;

    await this.materialRepo.save(material);

    return await this.materialRepo.findOneOrFail({
      where: { id: materialId },
      relations: {
        product: true,
        productUnit: true,
      },
    });
  }

  async removePlannedMaterial(templateId: string, stageId: string, materialId: string): Promise<void> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'STUDIES_TEMPLATE_STAGE_NOT_FOUND');
    }

    const material = await this.materialRepo.findOne({
      where: { id: materialId, stageId },
    });
    if (!material) {
      throw new NotFoundError('المادة المخططة غير موجودة', 'STUDIES_TEMPLATE_STAGE_MATERIAL_NOT_FOUND');
    }

    await this.materialRepo.delete(materialId);
  }
}

export const studiesTemplateService = new StudiesTemplateService();
