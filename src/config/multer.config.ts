import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer, { StorageEngine } from 'multer';

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const uploadsDir = path.resolve(process.cwd(), 'storage/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeFilename = `${crypto.randomUUID()}${ext}`;
    cb(null, safeFilename);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});
