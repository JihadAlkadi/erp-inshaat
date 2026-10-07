import { DataSource, Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionTemplatePatternOptionTaskAttachmentEntity } from './production-template-pattern-option-task-attachment.entity.js';
import {
  ProductionTemplateReferenceFileStorageService,
  productionTemplateReferenceFileStorageService,
} from '../template/production-template-reference-file-storage.service.js';
import {
  ProductionTemplateGuardService,
  productionTemplateGuardService,
} from '../template/production-template-guard.service.js';
import {
  ProductionTemplatePatternOptionTaskAttachmentDto,
  toPatternOptionTaskAttachmentDto,
} from './production-template-pattern-option-task-attachment.types.js';
import { UpdatePatternOptionTaskAttachmentDto } from './dto/update-task-attachment.dto.js';
import { ReorderPatternOptionTaskAttachmentsDto } from './dto/reorder-task-attachments.dto.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class ProductionTemplatePatternOptionTaskAttachmentService {
  private attachmentRepo: Repository<ProductionTemplatePatternOptionTaskAttachmentEntity>;
  private storageService: ProductionTemplateReferenceFileStorageService;
  private guardService: ProductionTemplateGuardService;

  constructor(
    private dataSource: DataSource = AppDataSource,
    storageService: ProductionTemplateReferenceFileStorageService = productionTemplateReferenceFileStorageService,
    guardService: ProductionTemplateGuardService = productionTemplateGuardService
  ) {
    this.attachmentRepo = this.dataSource.getRepository(ProductionTemplatePatternOptionTaskAttachmentEntity);
    this.storageService = storageService;
    this.guardService = guardService;
  }

  async listTaskAttachments(
    templateId: string,
    patternId: string,
    optionId: string,
    taskId: string
  ): Promise<ProductionTemplatePatternOptionTaskAttachmentDto[]> {
    await this.guardService.requireTaskBelongsToOption(
      templateId,
      patternId,
      optionId,
      taskId
    );

    const attachments = await this.attachmentRepo.find({
      where: { taskId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    return attachments.map((att) =>
      toPatternOptionTaskAttachmentDto(att, templateId, patternId, optionId)
    );
  }

  async addTaskAttachment(
    templateId: string,
    patternId: string,
    optionId: string,
    taskId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer?: Buffer;
      path?: string;
    },
    description?: string | null,
    userId?: string | null
  ): Promise<ProductionTemplatePatternOptionTaskAttachmentDto> {
    if (!file) {
      throw new BusinessRuleError('الملف مطلوب', 'TASK_ATTACHMENT_FILE_MISSING');
    }

    let cleanDescription: string | null = null;
    if (description !== undefined && description !== null) {
      const trimmed = description.trim();
      if (trimmed.length > 500) {
        await this.storageService.cleanupTemporaryFile(file.path);
        throw new BusinessRuleError(
          'وصف الوثيقة يجب ألا يتجاوز 500 حرف',
          'TASK_ATTACHMENT_DESCRIPTION_TOO_LONG'
        );
      }
      cleanDescription = trimmed.length > 0 ? trimmed : null;
    }

    let stored: { storageKey: string; sizeBytes: number; mimeType: string } | null = null;

    try {
      return await this.dataSource.transaction(async (manager) => {
        // 1. Lock template row
        await this.guardService.lockMutableTemplate(templateId, manager);

        // 2. Verify task ownership chain
        await this.guardService.requireTaskBelongsToOption(
          templateId,
          patternId,
          optionId,
          taskId,
          manager
        );

        // 3. Save physical file with prefix
        stored = await this.storageService.saveFileWithPrefix(
          'production-template-pattern-task',
          taskId,
          file
        );

        // 4. Dense sort order
        const currentCount = await manager.count(
          ProductionTemplatePatternOptionTaskAttachmentEntity,
          {
            where: { taskId, deletedAt: IsNull() },
          }
        );
        const nextSortOrder = currentCount + 1;

        const attachment = manager.create(ProductionTemplatePatternOptionTaskAttachmentEntity, {
          taskId,
          originalFileName: file.originalname.slice(0, 255),
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          description: cleanDescription,
          sortOrder: nextSortOrder,
          createdByUserId: userId || null,
        });

        const saved = await manager.save(attachment);
        return toPatternOptionTaskAttachmentDto(saved, templateId, patternId, optionId);
      });
    } catch (err) {
      if (stored) {
        await this.storageService.deleteStoredFile((stored as { storageKey: string }).storageKey);
      }
      await this.storageService.cleanupTemporaryFile(file.path);
      throw err;
    }
  }

  async updateTaskAttachment(
    templateId: string,
    patternId: string,
    optionId: string,
    taskId: string,
    attachmentId: string,
    dto: UpdatePatternOptionTaskAttachmentDto
  ): Promise<ProductionTemplatePatternOptionTaskAttachmentDto> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Lock template
      await this.guardService.lockMutableTemplate(templateId, manager);

      // 2. Verify task ownership
      await this.guardService.requireTaskBelongsToOption(
        templateId,
        patternId,
        optionId,
        taskId,
        manager
      );

      const attachment = await manager.findOne(
        ProductionTemplatePatternOptionTaskAttachmentEntity,
        {
          where: { id: attachmentId, taskId, deletedAt: IsNull() },
        }
      );
      if (!attachment) {
        throw new NotFoundError(
          'الوثيقة المرفقة غير موجودة',
          'PRODUCTION_TEMPLATE_PATTERN_TASK_ATTACHMENT_NOT_FOUND'
        );
      }

      if (dto.description !== undefined) {
        attachment.description = dto.description ? dto.description.trim() : null;
      }

      const saved = await manager.save(attachment);
      return toPatternOptionTaskAttachmentDto(saved, templateId, patternId, optionId);
    });
  }

  async softDeleteTaskAttachment(
    templateId: string,
    patternId: string,
    optionId: string,
    taskId: string,
    attachmentId: string
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // 1. Lock template
      await this.guardService.lockMutableTemplate(templateId, manager);

      // 2. Verify task ownership
      await this.guardService.requireTaskBelongsToOption(
        templateId,
        patternId,
        optionId,
        taskId,
        manager
      );

      const attachment = await manager.findOne(
        ProductionTemplatePatternOptionTaskAttachmentEntity,
        {
          where: { id: attachmentId, taskId, deletedAt: IsNull() },
        }
      );
      if (!attachment) {
        throw new NotFoundError(
          'الوثيقة المرفقة غير موجودة',
          'PRODUCTION_TEMPLATE_PATTERN_TASK_ATTACHMENT_NOT_FOUND'
        );
      }

      await manager.softDelete(ProductionTemplatePatternOptionTaskAttachmentEntity, attachmentId);

      // Compact remaining attachments densely 1..N
      const remaining = await manager.find(
        ProductionTemplatePatternOptionTaskAttachmentEntity,
        {
          where: { taskId, deletedAt: IsNull() },
          order: { sortOrder: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        }
      );

      for (let i = 0; i < remaining.length; i++) {
        await manager.update(
          ProductionTemplatePatternOptionTaskAttachmentEntity,
          { id: remaining[i].id },
          { sortOrder: i + 1 }
        );
      }
    });
  }

  async reorderTaskAttachments(
    templateId: string,
    patternId: string,
    optionId: string,
    taskId: string,
    dto: ReorderPatternOptionTaskAttachmentsDto
  ): Promise<ProductionTemplatePatternOptionTaskAttachmentDto[]> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Lock template
      await this.guardService.lockMutableTemplate(templateId, manager);

      // 2. Verify task ownership
      await this.guardService.requireTaskBelongsToOption(
        templateId,
        patternId,
        optionId,
        taskId,
        manager
      );

      const existing = await manager.find(
        ProductionTemplatePatternOptionTaskAttachmentEntity,
        {
          where: { taskId, deletedAt: IsNull() },
          lock: { mode: 'pessimistic_write' },
        }
      );

      const uniqueIds = new Set(dto.attachmentIds);
      if (
        uniqueIds.size !== dto.attachmentIds.length ||
        dto.attachmentIds.length !== existing.length
      ) {
        throw new BusinessRuleError(
          'قائمة المعرفات غير متطابقة مع وثائق المهمة',
          'PRODUCTION_TEMPLATE_PATTERN_TASK_ATTACHMENT_INVALID_REORDER'
        );
      }

      const existingMap = new Map(existing.map((a) => [a.id, a]));
      for (const id of dto.attachmentIds) {
        if (!existingMap.has(id)) {
          throw new BusinessRuleError(
            'أحد المعرفات لا يتبع لوثائق هذه المهمة',
            'PRODUCTION_TEMPLATE_PATTERN_TASK_ATTACHMENT_INVALID_REORDER'
          );
        }
      }

      for (let i = 0; i < dto.attachmentIds.length; i++) {
        await manager.update(
          ProductionTemplatePatternOptionTaskAttachmentEntity,
          { id: dto.attachmentIds[i] },
          { sortOrder: i + 1 }
        );
      }

      return await this.listTaskAttachments(templateId, patternId, optionId, taskId);
    });
  }

  async getTaskAttachmentForDownload(
    templateId: string,
    patternId: string,
    optionId: string,
    taskId: string,
    attachmentId: string
  ): Promise<{
    absolutePath: string;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
  }> {
    // 1. Check parent template is active
    await this.guardService.requireExistingTemplate(templateId);

    // 2. Verify full chain
    await this.guardService.requireTaskBelongsToOption(
      templateId,
      patternId,
      optionId,
      taskId
    );

    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, taskId, deletedAt: IsNull() },
    });
    if (!attachment) {
      throw new NotFoundError(
        'الوثيقة المرفقة غير موجودة',
        'PRODUCTION_TEMPLATE_PATTERN_TASK_ATTACHMENT_NOT_FOUND'
      );
    }

    if (!this.storageService.fileExists(attachment.storageKey)) {
      throw new BusinessRuleError('الملف الفعلي غير متوفر على الخادم', 'ATTACHMENT_FILE_MISSING');
    }

    const absolutePath = this.storageService.resolveAbsolutePath(attachment.storageKey);
    const sizeNum = typeof attachment.sizeBytes === 'string'
      ? parseInt(attachment.sizeBytes, 10)
      : Number(attachment.sizeBytes);

    return {
      absolutePath,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      sizeBytes: isNaN(sizeNum) ? 0 : sizeNum,
    };
  }
}

export const productionTemplatePatternOptionTaskAttachmentService =
  new ProductionTemplatePatternOptionTaskAttachmentService();
