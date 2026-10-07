import { ProductionTemplateStageAttachmentEntity } from './production-template-stage-attachment.entity.js';

export interface ProductionTemplateStageAttachmentDto {
  id: string;
  stageId: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  downloadUrl: string;
}

export function toStageAttachmentDto(
  att: ProductionTemplateStageAttachmentEntity,
  templateId: string
): ProductionTemplateStageAttachmentDto {
  const sizeNum = typeof att.sizeBytes === 'string' ? parseInt(att.sizeBytes, 10) : Number(att.sizeBytes);
  return {
    id: att.id,
    stageId: att.stageId,
    originalFileName: att.originalFileName,
    mimeType: att.mimeType,
    sizeBytes: isNaN(sizeNum) ? 0 : sizeNum,
    description: att.description,
    sortOrder: att.sortOrder,
    createdAt: att.createdAt,
    downloadUrl: `/api/production/templates/${templateId}/stages/${att.stageId}/attachments/${att.id}/file`,
  };
}
