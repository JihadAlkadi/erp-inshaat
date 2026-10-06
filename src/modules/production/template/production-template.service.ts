import { DataSource, Repository, IsNull, QueryFailedError } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionTemplateEntity } from './production-template.entity.js';
import { ProductionTemplateStageEntity } from '../template-stage/production-template-stage.entity.js';
import { ProductionTemplateSpecificationEntity } from '../template-specification/production-template-specification.entity.js';
import { CreateProductionTemplateDto } from './dto/create-template.dto.js';
import { UpdateProductionTemplateDto } from './dto/update-template.dto.js';
import { ListProductionTemplatesQueryDto } from './dto/list-templates-query.dto.js';
import {
  PaginatedProductionTemplatesResult,
  ProductionTemplateDetailDto,
  ProductionTemplateDto,
  toProductionTemplateDto,
  toProductionTemplateListItemDto,
} from './production-template.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';

export class ProductionTemplateService {
  private templateRepo: Repository<ProductionTemplateEntity>;

  constructor(private dataSource: DataSource = AppDataSource) {
    this.templateRepo = this.dataSource.getRepository(ProductionTemplateEntity);
  }

  async listTemplates(query: ListProductionTemplatesQueryDto): Promise<PaginatedProductionTemplatesResult> {
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
          .from(ProductionTemplateStageEntity, 'stage')
          .where('stage.template_id = t.id')
          .andWhere('stage.deleted_at IS NULL');
      }, 'stages_count')
      .addSelect((subQb) => {
        return subQb
          .select('COUNT(spec.id)', 'specs_count')
          .from(ProductionTemplateSpecificationEntity, 'spec')
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
      return toProductionTemplateListItemDto(entity, stagesCount, specsCount);
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getTemplateById(id: string): Promise<ProductionTemplateDetailDto> {
    const template = await this.templateRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: {
        specifications: true,
        stages: {
          department: true,
          plannedMaterials: true,
          attachments: true,
        },
      },
    });

    if (!template) {
      throw new NotFoundError('القالب غير موجود', 'PRODUCTION_TEMPLATE_NOT_FOUND');
    }

    const specifications = (template.specifications || [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        id: s.id,
        name: s.name,
        value: s.value,
        unit: s.unit,
        sortOrder: s.sortOrder,
      }));

    const stages = (template.stages || [])
      .filter((s) => !s.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => {
        const plannedMaterialsCount = (s.plannedMaterials || []).length;
        const attachmentsCount = (s.attachments || []).filter((a: any) => !a.deletedAt).length;

        return {
          id: s.id,
          name: s.name,
          description: s.description,
          departmentId: s.departmentId,
          departmentName: s.department?.name,
          departmentCode: s.department?.code,
          sortOrder: s.sortOrder,
          estimatedDurationMinutes: s.estimatedDurationMinutes,
          estimatedCost: s.estimatedCost ? String(s.estimatedCost) : null,
          plannedMaterialsCount,
          attachmentsCount,
        };
      });

    return {
      id: template.id,
      name: template.name,
      referenceNumber: template.referenceNumber,
      code: template.code,
      description: template.description,
      isActive: template.isActive,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      specifications,
      stages,
    };
  }

  async findTemplateEntityById(id: string): Promise<ProductionTemplateEntity> {
    const template = await this.templateRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundError('القالب غير موجود', 'PRODUCTION_TEMPLATE_NOT_FOUND');
    }
    return template;
  }

  async createTemplate(dto: CreateProductionTemplateDto): Promise<ProductionTemplateDto> {
    const normalizedCode = dto.code.trim().toUpperCase();

    // Check code uniqueness including soft deleted records
    const existing = await this.templateRepo.findOne({
      where: { code: normalizedCode },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictError('رمز القالب مستخدم مسبقاً', 'PRODUCTION_TEMPLATE_CODE_ALREADY_EXISTS');
    }

    const template = this.templateRepo.create({
      name: dto.name.trim(),
      code: normalizedCode,
      referenceNumber: dto.referenceNumber ? dto.referenceNumber.trim() : null,
      description: dto.description ? dto.description.trim() : null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    try {
      const saved = await this.templateRepo.save(template);
      return toProductionTemplateDto(saved);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).driverError?.errno === 1062) {
        throw new ConflictError('رمز القالب مستخدم مسبقاً', 'PRODUCTION_TEMPLATE_CODE_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  async updateTemplate(id: string, dto: UpdateProductionTemplateDto): Promise<ProductionTemplateDto> {
    const template = await this.templateRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundError('القالب غير موجود', 'PRODUCTION_TEMPLATE_NOT_FOUND');
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

    const saved = await this.templateRepo.save(template);
    return toProductionTemplateDto(saved);
  }

  async softDeleteTemplate(id: string): Promise<void> {
    const template = await this.templateRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundError('القالب غير موجود', 'PRODUCTION_TEMPLATE_NOT_FOUND');
    }

    template.isActive = false;
    await this.templateRepo.save(template);
    await this.templateRepo.softDelete(id);
  }
}

export const productionTemplateService = new ProductionTemplateService();
