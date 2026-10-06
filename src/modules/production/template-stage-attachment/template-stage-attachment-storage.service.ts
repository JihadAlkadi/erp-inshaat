import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export const ATTACHMENT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

export class TemplateStageAttachmentStorageService {
  private readonly storageRoot: string;

  constructor(customStorageRoot?: string) {
    this.storageRoot = path.resolve(
      process.cwd(),
      customStorageRoot || process.env.FILE_STORAGE_ROOT || 'storage/template-stage-attachments'
    );
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  /**
   * Validates file buffer/meta and saves it under an opaque, safe storageKey.
   * Path traversal resistant: ignores original filename when constructing storage path.
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
    // 1. Validate file size
    if (file.size > ATTACHMENT_MAX_FILE_SIZE_BYTES) {
      throw new BusinessRuleError(
        `حجم الملف يتجاوز الحد الأقصى المسموح به وهو 20 ميغابايت`,
        'ATTACHMENT_FILE_TOO_LARGE'
      );
    }
    if (file.size <= 0) {
      throw new BusinessRuleError('الملف فارغ', 'ATTACHMENT_FILE_EMPTY');
    }

    // 2. Validate MIME type
    const mimeType = file.mimetype.toLowerCase();
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) {
      throw new BusinessRuleError(
        'نوع الملف غير مدعوم. الأنواع المسموحة هي: PDF, PNG, JPG, WEBP',
        'ATTACHMENT_UNSUPPORTED_MIME_TYPE'
      );
    }

    // 3. Validate Extension
    const rawExt = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(rawExt)) {
      throw new BusinessRuleError(
        'امتداد الملف غير مدعوم. الامتدادات المسموحة هي: .pdf, .png, .jpg, .jpeg, .webp',
        'ATTACHMENT_UNSUPPORTED_EXTENSION'
      );
    }

    // Sanitize extension (no traversal or invalid chars)
    const safeExt = rawExt.replace(/[^a-z0-9.]/gi, '');

    // 4. Generate opaque key: production-template-stage/<stageId>/<uuid><safeExt>
    const safeStageId = stageId.replace(/[^a-zA-Z0-9_-]/g, '');
    const fileId = crypto.randomUUID();
    const relativeKey = path.posix.join(
      'production-template-stage',
      safeStageId,
      `${fileId}${safeExt}`
    );

    const targetFullPath = path.resolve(this.storageRoot, relativeKey);

    // Prevent path traversal outside storageRoot
    if (!targetFullPath.startsWith(this.storageRoot)) {
      throw new BusinessRuleError('مسار التخزين غير صالح', 'ATTACHMENT_INVALID_PATH');
    }

    // Ensure parent dir exists
    const targetDir = path.dirname(targetFullPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Write file
    if (file.buffer) {
      await fs.promises.writeFile(targetFullPath, file.buffer);
    } else if (file.path) {
      await fs.promises.copyFile(file.path, targetFullPath);
      // Clean up multer temp file if any
      try {
        await fs.promises.unlink(file.path);
      } catch {
        // Ignore unlink failure on temp file
      }
    } else {
      throw new BusinessRuleError('محتوى الملف غير متوفر', 'ATTACHMENT_FILE_DATA_MISSING');
    }

    return {
      storageKey: relativeKey,
      sizeBytes: file.size,
      mimeType,
    };
  }

  /**
   * Resolves absolute path of an attachment file with strict path traversal checks.
   */
  resolveAbsolutePath(storageKey: string): string {
    if (!storageKey || storageKey.includes('..') || storageKey.includes('\0')) {
      throw new BusinessRuleError('مفتاح التخزين غير صالح', 'ATTACHMENT_INVALID_KEY');
    }

    const resolved = path.resolve(this.storageRoot, storageKey);
    if (!resolved.startsWith(this.storageRoot)) {
      throw new BusinessRuleError('مسار الملف خارج نطاق التخزين المسموح', 'ATTACHMENT_PATH_TRAVERSAL');
    }

    return resolved;
  }

  /**
   * Checks whether the file physically exists on disk.
   */
  fileExists(storageKey: string): boolean {
    try {
      const p = this.resolveAbsolutePath(storageKey);
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }

  /**
   * Deletes a file physically if it exists.
   */
  async deleteFile(storageKey: string): Promise<void> {
    try {
      const p = this.resolveAbsolutePath(storageKey);
      if (fs.existsSync(p)) {
        await fs.promises.unlink(p);
      }
    } catch {
      // Ignore physical delete errors for soft delete / historical integrity
    }
  }
}

export const templateStageAttachmentStorageService = new TemplateStageAttachmentStorageService();
