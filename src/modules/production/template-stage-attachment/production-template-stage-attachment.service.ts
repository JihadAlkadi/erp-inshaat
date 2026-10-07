import { DataSource, Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionTemplateEntity } from '../template/production-template.entity.js';
import { ProductionTemplateStageEntity } from '../template-stage/production-template-stage.entity.js';
import { ProductionTemplateStageAttachmentEntity } from './production-template-stage-attachment.entity.js';
import {
  TemplateStageAttachmentStorageService,
  templateStageAttachmentStorageService,
} from './template-stage-attachment-storage.service.js';
import {
  ProductionTemplateGuardService,
  productionTemplateGuardService,
} from '../template/production-template-guard.service.js';
import {
  ProductionTemplateStageAttachmentDto,
  toStageAttachmentDto,
} from './production-template-stage-attachment.types.js';
import { UpdateStageAttachmentDto } from './dto/update-stage-attachment.dto.js';
import { ReorderStageAttachmentsDto } from './dto/reorder-stage-attachments.dto.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class ProductionTemplateStageAttachmentService {
  private attachmentRepo: Repository<ProductionTemplateStageAttachmentEntity>;
  private stageRepo: Repository<ProductionTemplateStageEntity>;
  private templateRepo: Repository<ProductionTemplateEntity>;
  private storageService: TemplateStageAttachmentStorageService;
  private guardService: ProductionTemplateGuardService;

  constructor(
    private dataSource: DataSource = AppDataSource,
    storageService: TemplateStageAttachmentStorageService = templateStageAttachmentStorageService,
    guardService: ProductionTemplateGuardService = productionTemplateGuardService
  ) {
    this.attachmentRepo = this.dataSource.getRepository(ProductionTemplateStageAttachmentEntity);
    this.stageRepo = this.dataSource.getRepository(ProductionTemplateStageEntity);
    this.templateRepo = this.dataSource.getRepository(ProductionTemplateEntity);
    this.storageService = storageService;
    this.guardService = guardService;
  }

  async listStageAttachments(
    templateId: string,
    stageId: string
  ): Promise<ProductionTemplateStageAttachmentDto[]> {
    await this.guardService.requireExistingTemplate(templateId);

    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
    }

    const attachments = await this.attachmentRepo.find({
      where: { stageId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    return attachments.map((att) => toStageAttachmentDto(att, templateId));
  }

  async addStageAttachment(
    templateId: string,
    stageId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer?: Buffer;
      path?: string;
    },
    description?: string | null,
    userId?: string | null
  ): Promise<ProductionTemplateStageAttachmentDto> {
    if (!file) {
      throw new BusinessRuleError('الملف مطلوب', 'STAGE_ATTACHMENT_FILE_MISSING');
    }

    // Server-side description validation
    let cleanDescription: string | null = null;
    if (description !== undefined && description !== null) {
      const trimmed = description.trim();
      if (trimmed.length > 500) {
        await this.storageService.cleanupTemporaryFile(file.path);
        throw new BusinessRuleError('وصف الوثيقة يجب ألا يتجاوز 500 حرف', 'STAGE_ATTACHMENT_DESCRIPTION_TOO_LONG');
      }
      cleanDescription = trimmed.length > 0 ? trimmed : null;
    }

    let stored: { storageKey: string; sizeBytes: number; mimeType: string } | null = null;

    try {
      return await this.dataSource.transaction(async (manager) => {
        // 1. Lock template to serialize concurrent attachment modifications & check active
        await this.guardService.lockMutableTemplate(templateId, manager);

        const stage = await manager.findOne(ProductionTemplateStageEntity, {
          where: { id: stageId, templateId, deletedAt: IsNull() },
        });
        if (!stage) {
          throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
        }

        // 2. Delegate file storage to storage service
        stored = await this.storageService.saveFile(stageId, file);

        // 3. Determine next dense sortOrder
        const currentCount = await manager.count(ProductionTemplateStageAttachmentEntity, {
          where: { stageId, deletedAt: IsNull() },
        });
        const nextSortOrder = currentCount + 1;

        // 4. Save attachment record
        const attachment = manager.create(ProductionTemplateStageAttachmentEntity, {
          stageId,
          originalFileName: file.originalname.slice(0, 255),
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          description: cleanDescription,
          sortOrder: nextSortOrder,
          createdByUserId: userId || null,
        });

        const saved = await manager.save(attachment);
        return toStageAttachmentDto(saved, templateId);
      });
    } catch (err) {
      // Rollback physical final file if DB transaction failed
      if (stored) {
        await this.storageService.deleteStoredFile((stored as { storageKey: string }).storageKey);
      }
      await this.storageService.cleanupTemporaryFile(file.path);
      throw err;
    }
  }

  async updateStageAttachment(
    templateId: string,
    stageId: string,
    attachmentId: string,
    dto: UpdateStageAttachmentDto
  ): Promise<ProductionTemplateStageAttachmentDto> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Lock template & verify not archived
      await this.guardService.lockMutableTemplate(templateId, manager);

      const stage = await manager.findOne(ProductionTemplateStageEntity, {
        where: { id: stageId, templateId, deletedAt: IsNull() },
      });
      if (!stage) {
        throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
      }

      const attachment = await manager.findOne(ProductionTemplateStageAttachmentEntity, {
        where: { id: attachmentId, stageId, deletedAt: IsNull() },
      });
      if (!attachment) {
        throw new NotFoundError('الوثيقة المرفقة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_ATTACHMENT_NOT_FOUND');
      }

      if (dto.description !== undefined) {
        attachment.description = dto.description ? dto.description.trim() : null;
      }

      const saved = await manager.save(attachment);
      return toStageAttachmentDto(saved, templateId);
    });
  }

  async softDeleteStageAttachment(
    templateId: string,
    stageId: string,
    attachmentId: string
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // 1. Lock template & verify not archived
      await this.guardService.lockMutableTemplate(templateId, manager);

      const stage = await manager.findOne(ProductionTemplateStageEntity, {
        where: { id: stageId, templateId, deletedAt: IsNull() },
      });
      if (!stage) {
        throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
      }

      const attachment = await manager.findOne(ProductionTemplateStageAttachmentEntity, {
        where: { id: attachmentId, stageId, deletedAt: IsNull() },
      });
      if (!attachment) {
        throw new NotFoundError('الوثيقة المرفقة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_ATTACHMENT_NOT_FOUND');
      }

      // Soft delete: sets deletedAt (physical file is preserved)
      await manager.softDelete(ProductionTemplateStageAttachmentEntity, attachmentId);

      // 2. Compact remaining attachments into dense 1..N order
      const remaining = await manager.find(ProductionTemplateStageAttachmentEntity, {
        where: { stageId, deletedAt: IsNull() },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });

      for (let i = 0; i < remaining.length; i++) {
        const expectedOrder = i + 1;
        if (remaining[i].sortOrder !== expectedOrder) {
          remaining[i].sortOrder = expectedOrder;
          await manager.save(remaining[i]);
        }
      }
    });
  }

  async reorderStageAttachments(
    templateId: string,
    stageId: string,
    dto: ReorderStageAttachmentsDto
  ): Promise<ProductionTemplateStageAttachmentDto[]> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Lock template & verify not archived
      await this.guardService.lockMutableTemplate(templateId, manager);

      const stage = await manager.findOne(ProductionTemplateStageEntity, {
        where: { id: stageId, templateId, deletedAt: IsNull() },
      });
      if (!stage) {
        throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
      }

      const currentAttachments = await manager.find(ProductionTemplateStageAttachmentEntity, {
        where: { stageId, deletedAt: IsNull() },
      });

      // 2. Validate exact set match
      if (currentAttachments.length !== dto.attachmentIds.length) {
        throw new BusinessRuleError(
          'قائمة المعرفات لا تطابق عدد الوثائق الفعلي',
          'STAGE_ATTACHMENT_REORDER_SET_MISMATCH'
        );
      }

      const currentIdsSet = new Set(currentAttachments.map((a) => a.id));
      const incomingIdsSet = new Set(dto.attachmentIds);

      if (incomingIdsSet.size !== dto.attachmentIds.length) {
        throw new BusinessRuleError(
          'تحتوي قائمة المعرفات على عناصر مكررة',
          'STAGE_ATTACHMENT_REORDER_DUPLICATES'
        );
      }

      for (const id of dto.attachmentIds) {
        if (!currentIdsSet.has(id)) {
          throw new BusinessRuleError(
            'قائمة المعرفات تحتوي على وثائق غير تابعة لهذه المرحلة',
            'STAGE_ATTACHMENT_REORDER_FOREIGN_ITEM'
          );
        }
      }

      // 3. Apply dense 1..N order
      const attachmentMap = new Map(currentAttachments.map((a) => [a.id, a]));
      const updatedList: ProductionTemplateStageAttachmentEntity[] = [];

      for (let i = 0; i < dto.attachmentIds.length; i++) {
        const id = dto.attachmentIds[i];
        const att = attachmentMap.get(id)!;
        att.sortOrder = i + 1;
        await manager.save(att);
        updatedList.push(att);
      }

      return updatedList.map((a) => toStageAttachmentDto(a, templateId));
    });
  }

  async getAttachmentForDownload(
    templateId: string,
    stageId: string,
    attachmentId: string
  ): Promise<{ attachment: ProductionTemplateStageAttachmentEntity; absoluteFilePath: string }> {
    await this.guardService.requireExistingTemplate(templateId);

    const stage = await this.stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });
    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
    }

    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, stageId, deletedAt: IsNull() },
    });
    if (!attachment) {
      throw new NotFoundError('الوثيقة المرفقة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_ATTACHMENT_NOT_FOUND');
    }

    if (!this.storageService.fileExists(attachment.storageKey)) {
      throw new NotFoundError('الملف الفعلي للوثيقة غير متوفر على الخادم', 'ATTACHMENT_FILE_MISSING');
    }

    const absoluteFilePath = this.storageService.resolveAbsolutePath(attachment.storageKey);
    return {
      attachment,
      absoluteFilePath,
    };
  }
}

export const productionTemplateStageAttachmentService = new ProductionTemplateStageAttachmentService();

