import { ProductionTemplateWorkflowItemEntity, ProductionTemplateWorkflowItemType } from './production-template-workflow-item.entity.js';

export interface ProductionTemplateWorkflowItemStageSummaryDto {
  id: string;
  name: string;
  description: string | null;
  departmentId: string;
  departmentName?: string;
  departmentCode?: string;
  estimatedDurationMinutes: number | null;
  estimatedCost: string | null;
  plannedMaterialsCount: number;
  attachmentsCount: number;
}

export interface ProductionTemplateWorkflowItemPatternSummaryDto {
  id: string;
  name: string;
  optionsCount: number;
}

export interface ProductionTemplateWorkflowItemDto {
  id: string;
  templateId: string;
  itemType: ProductionTemplateWorkflowItemType;
  sortOrder: number;
  stageId?: string | null;
  patternId?: string | null;
  stage?: ProductionTemplateWorkflowItemStageSummaryDto;
  pattern?: ProductionTemplateWorkflowItemPatternSummaryDto;
}

export function toProductionTemplateWorkflowItemDto(
  entity: ProductionTemplateWorkflowItemEntity,
  stageSummary?: ProductionTemplateWorkflowItemStageSummaryDto,
  patternSummary?: ProductionTemplateWorkflowItemPatternSummaryDto
): ProductionTemplateWorkflowItemDto {
  return {
    id: entity.id,
    templateId: entity.templateId,
    itemType: entity.itemType,
    sortOrder: entity.sortOrder,
    stageId: entity.stageId,
    patternId: entity.patternId,
    stage: stageSummary,
    pattern: patternSummary,
  };
}
