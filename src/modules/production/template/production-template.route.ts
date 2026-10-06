import { Router } from 'express';
import { productionTemplateController } from './production-template.controller.js';
import { requireApiAuth } from '../../system/auth/auth.middleware.js';
import { requirePermission } from '../../system/authorization/authorization.middleware.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { validateDto } from '../../../common/middleware/validate-dto.middleware.js';
import { validateQueryDto } from '../../../common/middleware/validate-query-dto.middleware.js';
import { validateUuidParam } from '../../../common/middleware/validate-uuid-param.middleware.js';
import { CreateProductionTemplateDto } from './dto/create-template.dto.js';
import { UpdateProductionTemplateDto } from './dto/update-template.dto.js';
import { ListProductionTemplatesQueryDto } from './dto/list-templates-query.dto.js';
import { CreateTemplateSpecificationDto } from '../template-specification/dto/create-specification.dto.js';
import { UpdateTemplateSpecificationDto } from '../template-specification/dto/update-specification.dto.js';
import { ReorderTemplateSpecificationsDto } from '../template-specification/dto/reorder-specifications.dto.js';
import { CreateTemplateStageDto } from '../template-stage/dto/create-stage.dto.js';
import { UpdateTemplateStageDto } from '../template-stage/dto/update-stage.dto.js';
import { ReorderTemplateStagesDto } from '../template-stage/dto/reorder-stages.dto.js';
import { AddTemplateStageMaterialDto } from '../template-stage-material/dto/add-stage-material.dto.js';
import { UpdateTemplateStageMaterialDto } from '../template-stage-material/dto/update-stage-material.dto.js';
import { UpdateStageAttachmentDto } from '../template-stage-attachment/dto/update-stage-attachment.dto.js';
import { ReorderStageAttachmentsDto } from '../template-stage-attachment/dto/reorder-stage-attachments.dto.js';
import { upload } from '../../../config/multer.config.js';

const productionTemplateApiRouter: Router = Router();

productionTemplateApiRouter.use(requireApiAuth);

// ==========================================
// 1. TEMPLATES CORE ENDPOINTS
// ==========================================

// GET /api/production/templates - List templates (paginated, filtered)
productionTemplateApiRouter.get(
  '/',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_VIEW),
  validateQueryDto(ListProductionTemplatesQueryDto),
  productionTemplateController.listTemplates
);

// GET /api/production/templates/:id - Get template details with stages & specifications
productionTemplateApiRouter.get(
  '/:id',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_VIEW),
  validateUuidParam('id'),
  productionTemplateController.getTemplateById
);

// POST /api/production/templates - Create template
productionTemplateApiRouter.post(
  '/',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_CREATE),
  validateDto(CreateProductionTemplateDto),
  productionTemplateController.createTemplate
);

// PUT /api/production/templates/:id - Update template
productionTemplateApiRouter.put(
  '/:id',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateDto(UpdateProductionTemplateDto),
  productionTemplateController.updateTemplate
);

// DELETE /api/production/templates/:id - Soft delete template
productionTemplateApiRouter.delete(
  '/:id',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_DELETE),
  validateUuidParam('id'),
  productionTemplateController.deleteTemplate
);

// ==========================================
// 2. SPECIFICATIONS ENDPOINTS
// ==========================================

// POST /api/production/templates/:id/specifications - Add specification
productionTemplateApiRouter.post(
  '/:id/specifications',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateDto(CreateTemplateSpecificationDto),
  productionTemplateController.addSpecification
);

// PATCH /api/production/templates/:id/specifications/reorder - Reorder specifications
productionTemplateApiRouter.patch(
  '/:id/specifications/reorder',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateDto(ReorderTemplateSpecificationsDto),
  productionTemplateController.reorderSpecifications
);

// PUT /api/production/templates/:id/specifications/:specId - Update specification
productionTemplateApiRouter.put(
  '/:id/specifications/:specId',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('specId'),
  validateDto(UpdateTemplateSpecificationDto),
  productionTemplateController.updateSpecification
);

// DELETE /api/production/templates/:id/specifications/:specId - Delete specification
productionTemplateApiRouter.delete(
  '/:id/specifications/:specId',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('specId'),
  productionTemplateController.deleteSpecification
);

// ==========================================
// 3. STAGES ENDPOINTS
// ==========================================

// POST /api/production/templates/:id/stages - Add stage
productionTemplateApiRouter.post(
  '/:id/stages',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateDto(CreateTemplateStageDto),
  productionTemplateController.addStage
);

// PATCH /api/production/templates/:id/stages/reorder - Reorder stages densely
productionTemplateApiRouter.patch(
  '/:id/stages/reorder',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateDto(ReorderTemplateStagesDto),
  productionTemplateController.reorderStages
);

// PUT /api/production/templates/:id/stages/:stageId - Update stage
productionTemplateApiRouter.put(
  '/:id/stages/:stageId',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateDto(UpdateTemplateStageDto),
  productionTemplateController.updateStage
);

// DELETE /api/production/templates/:id/stages/:stageId - Soft delete stage (requires update permission)
productionTemplateApiRouter.delete(
  '/:id/stages/:stageId',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  productionTemplateController.softDeleteStage
);

// ==========================================
// 4. PLANNED MATERIALS ENDPOINTS
// ==========================================

// GET /api/production/templates/:id/stages/:stageId/materials - List stage materials
productionTemplateApiRouter.get(
  '/:id/stages/:stageId/materials',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_VIEW),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  productionTemplateController.listStageMaterials
);

// POST /api/production/templates/:id/stages/:stageId/materials - Add planned material
productionTemplateApiRouter.post(
  '/:id/stages/:stageId/materials',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateDto(AddTemplateStageMaterialDto),
  productionTemplateController.addStageMaterial
);

// PUT /api/production/templates/:id/stages/:stageId/materials/:materialId - Update planned material
productionTemplateApiRouter.put(
  '/:id/stages/:stageId/materials/:materialId',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateUuidParam('materialId'),
  validateDto(UpdateTemplateStageMaterialDto),
  productionTemplateController.updateStageMaterial
);

// DELETE /api/production/templates/:id/stages/:stageId/materials/:materialId - Remove planned material
productionTemplateApiRouter.delete(
  '/:id/stages/:stageId/materials/:materialId',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateUuidParam('materialId'),
  productionTemplateController.removeStageMaterial
);

// ==========================================
// 5. STAGE REFERENCE ATTACHMENTS ENDPOINTS
// ==========================================

// GET /api/production/templates/:id/stages/:stageId/attachments - List reference attachments
productionTemplateApiRouter.get(
  '/:id/stages/:stageId/attachments',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_VIEW),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  productionTemplateController.listStageAttachments
);

// POST /api/production/templates/:id/stages/:stageId/attachments - Upload reference attachment
productionTemplateApiRouter.post(
  '/:id/stages/:stageId/attachments',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  upload.single('file'),
  productionTemplateController.addStageAttachment
);

// PATCH /api/production/templates/:id/stages/:stageId/attachments/reorder - Reorder attachments
productionTemplateApiRouter.patch(
  '/:id/stages/:stageId/attachments/reorder',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateDto(ReorderStageAttachmentsDto),
  productionTemplateController.reorderStageAttachments
);

// PUT /api/production/templates/:id/stages/:stageId/attachments/:attachmentId - Update attachment metadata (description)
productionTemplateApiRouter.put(
  '/:id/stages/:stageId/attachments/:attachmentId',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateUuidParam('attachmentId'),
  validateDto(UpdateStageAttachmentDto),
  productionTemplateController.updateStageAttachment
);

// DELETE /api/production/templates/:id/stages/:stageId/attachments/:attachmentId - Soft delete reference attachment
productionTemplateApiRouter.delete(
  '/:id/stages/:stageId/attachments/:attachmentId',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateUuidParam('attachmentId'),
  productionTemplateController.softDeleteStageAttachment
);

// GET /api/production/templates/:id/stages/:stageId/attachments/:attachmentId/file - Download reference file (authenticated + authorized)
productionTemplateApiRouter.get(
  '/:id/stages/:stageId/attachments/:attachmentId/file',
  requirePermission(SystemPermission.PRODUCTION_TEMPLATE_VIEW),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateUuidParam('attachmentId'),
  productionTemplateController.downloadStageAttachment
);

export { productionTemplateApiRouter };
