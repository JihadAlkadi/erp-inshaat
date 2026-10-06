import { Router } from 'express';
import { studiesTemplateController } from './controllers/studies-template.controller.js';
import { requireApiAuth } from '../../system/auth/auth.middleware.js';
import { requirePermission } from '../../system/authorization/authorization.middleware.js';
import { SystemPermission } from '../../system/permission/constants/system-permission.enum.js';
import { validateDto } from '../../../common/middleware/validate-dto.middleware.js';
import { validateQueryDto } from '../../../common/middleware/validate-query-dto.middleware.js';
import { validateUuidParam } from '../../../common/middleware/validate-uuid-param.middleware.js';

import { CreateStudiesTemplateDto } from './dto/create-template.dto.js';
import { UpdateStudiesTemplateDto } from './dto/update-template.dto.js';
import { ListStudiesTemplatesQueryDto } from './dto/list-templates-query.dto.js';
import { CreateTemplateSpecificationDto } from './dto/create-specification.dto.js';
import { UpdateTemplateSpecificationDto } from './dto/update-specification.dto.js';
import { ReorderTemplateSpecificationsDto } from './dto/reorder-specifications.dto.js';
import { CreateTemplateStageDto } from './dto/create-stage.dto.js';
import { UpdateTemplateStageDto } from './dto/update-stage.dto.js';
import { ReorderTemplateStagesDto } from './dto/reorder-stages.dto.js';
import { AddTemplateStageMaterialDto } from './dto/add-stage-material.dto.js';
import { UpdateTemplateStageMaterialDto } from './dto/update-stage-material.dto.js';

const studiesTemplateApiRouter: Router = Router();

studiesTemplateApiRouter.use(requireApiAuth);

// 1. Template Listing & Details
studiesTemplateApiRouter.get(
  '/',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_VIEW),
  validateQueryDto(ListStudiesTemplatesQueryDto),
  studiesTemplateController.listTemplates
);

studiesTemplateApiRouter.get(
  '/:id',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_VIEW),
  validateUuidParam('id'),
  studiesTemplateController.getTemplateById
);

studiesTemplateApiRouter.post(
  '/',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_CREATE),
  validateDto(CreateStudiesTemplateDto),
  studiesTemplateController.createTemplate
);

studiesTemplateApiRouter.put(
  '/:id',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateDto(UpdateStudiesTemplateDto),
  studiesTemplateController.updateTemplate
);

studiesTemplateApiRouter.delete(
  '/:id',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_DELETE),
  validateUuidParam('id'),
  studiesTemplateController.deleteTemplate
);

// 2. Specifications
studiesTemplateApiRouter.post(
  '/:id/specifications',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateDto(CreateTemplateSpecificationDto),
  studiesTemplateController.addSpecification
);

studiesTemplateApiRouter.patch(
  '/:id/specifications/reorder',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateDto(ReorderTemplateSpecificationsDto),
  studiesTemplateController.reorderSpecifications
);

studiesTemplateApiRouter.put(
  '/:id/specifications/:specId',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('specId'),
  validateDto(UpdateTemplateSpecificationDto),
  studiesTemplateController.updateSpecification
);

studiesTemplateApiRouter.delete(
  '/:id/specifications/:specId',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('specId'),
  studiesTemplateController.deleteSpecification
);

// 3. Stages
studiesTemplateApiRouter.post(
  '/:id/stages',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateDto(CreateTemplateStageDto),
  studiesTemplateController.addStage
);

studiesTemplateApiRouter.patch(
  '/:id/stages/reorder',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateDto(ReorderTemplateStagesDto),
  studiesTemplateController.reorderStages
);

studiesTemplateApiRouter.put(
  '/:id/stages/:stageId',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateDto(UpdateTemplateStageDto),
  studiesTemplateController.updateStage
);

studiesTemplateApiRouter.delete(
  '/:id/stages/:stageId',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  studiesTemplateController.deleteStage
);

// 4. Planned Materials
studiesTemplateApiRouter.post(
  '/:id/stages/:stageId/materials',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateDto(AddTemplateStageMaterialDto),
  studiesTemplateController.addPlannedMaterial
);

studiesTemplateApiRouter.put(
  '/:id/stages/:stageId/materials/:materialId',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateUuidParam('materialId'),
  validateDto(UpdateTemplateStageMaterialDto),
  studiesTemplateController.updatePlannedMaterial
);

studiesTemplateApiRouter.delete(
  '/:id/stages/:stageId/materials/:materialId',
  requirePermission(SystemPermission.STUDIES_TEMPLATE_UPDATE),
  validateUuidParam('id'),
  validateUuidParam('stageId'),
  validateUuidParam('materialId'),
  studiesTemplateController.removePlannedMaterial
);

export { studiesTemplateApiRouter };
