import { ProductionTemplatePatternOptionTaskAttachmentEntity } from './production-template-pattern-option-task-attachment.entity.js';

export interface ProductionTemplatePatternOptionTaskAttachmentDto {
  id: string;
  taskId: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  downloadUrl: string;
}

export function toPatternOptionTaskAttachmentDto(
  att: ProductionTemplatePatternOptionTaskAttachmentEntity,
  templateId: string,
  patternId: string,
  optionId: string
): ProductionTemplatePatternOptionTaskAttachmentDto {
  const sizeNum = typeof att.sizeBytes === 'string' ? parseInt(att.sizeBytes, 10) : Number(att.sizeBytes);
  return {
    id: att.id,
    taskId: att.taskId,
    originalFileName: att.originalFileName,
    mimeType: att.mimeType,
    sizeBytes: isNaN(sizeNum) ? 0 : sizeNum,
    description: att.description,
    sortOrder: att.sortOrder,
    createdAt: att.createdAt,
    downloadUrl: `/api/production/templates/${templateId}/patterns/${patternId}/options/${optionId}/tasks/${att.taskId}/attachments/${att.id}/file`,
  };
}
