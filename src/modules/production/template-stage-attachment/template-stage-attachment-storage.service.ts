import {
  ProductionTemplateReferenceFileStorageService,
  ATTACHMENT_MAX_FILE_SIZE_BYTES,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_MIME_EXTENSIONS_MAP,
} from '../template/production-template-reference-file-storage.service.js';

export {
  ATTACHMENT_MAX_FILE_SIZE_BYTES,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_MIME_EXTENSIONS_MAP,
};

export class TemplateStageAttachmentStorageService extends ProductionTemplateReferenceFileStorageService {
  constructor(customStorageRoot?: string) {
    super(customStorageRoot);
  }

  /**
   * Saves a stage reference document with category prefix 'production-template-stage'.
   */
  async saveFile(
    stageId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer?: Buffer;
      path?: string;
    }
  ): Promise<{ storageKey: string; sizeBytes: number; mimeType: string }> {
    return this.saveFileWithPrefix('production-template-stage', stageId, file);
  }
}

export const templateStageAttachmentStorageService = new TemplateStageAttachmentStorageService();
