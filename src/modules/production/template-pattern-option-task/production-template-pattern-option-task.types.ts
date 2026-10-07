import { ProductionTemplatePatternOptionTaskEntity } from './production-template-pattern-option-task.entity.js';

export interface ProductionTemplatePatternOptionTaskDto {
  id: string;
  optionId: string;
  departmentId: string;
  departmentName?: string;
  departmentCode?: string;
  department?: {
    id: string;
    name: string;
    code: string;
  };
  name: string;
  description: string | null;
  sortOrder: number;
  estimatedDurationMinutes: number | null;
  estimatedCost: string | null;
  plannedMaterialsCount: number;
  attachmentsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toProductionTemplatePatternOptionTaskDto(
  entity: ProductionTemplatePatternOptionTaskEntity,
  plannedMaterialsCountOverride?: number,
  attachmentsCountOverride?: number
): ProductionTemplatePatternOptionTaskDto {
  const plannedMaterialsCount =
    plannedMaterialsCountOverride !== undefined
      ? plannedMaterialsCountOverride
      : (entity.plannedMaterials || []).length;

  const attachmentsCount =
    attachmentsCountOverride !== undefined
      ? attachmentsCountOverride
      : (entity.attachments || []).filter((a) => !a.deletedAt).length;

  const dept = entity.department
    ? {
        id: entity.department.id,
        name: entity.department.name,
        code: entity.department.code,
      }
    : undefined;

  return {
    id: entity.id,
    optionId: entity.optionId,
    departmentId: entity.departmentId,
    departmentName: dept?.name,
    departmentCode: dept?.code,
    department: dept,
    name: entity.name,
    description: entity.description,
    sortOrder: entity.sortOrder,
    estimatedDurationMinutes: entity.estimatedDurationMinutes,
    estimatedCost: entity.estimatedCost ? String(entity.estimatedCost) : null,
    plannedMaterialsCount,
    attachmentsCount,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
