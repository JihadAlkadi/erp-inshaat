import { ProductionTemplateStageEntity } from './production-template-stage.entity.js';
import { ConsecutiveDepartmentGroup, ProductionTemplateStageBrowserDto } from './production-template-stage.types.js';

/**
 * Pure Domain Presentation Helper:
 * Groups only consecutive stages that share the exact same departmentId.
 *
 * Rules:
 * - Template stages are globally ordered (1..N).
 * - Each stage belongs to a production department.
 * - If consecutive stages share the same departmentId, they are placed in the same visual group.
 * - When departmentId changes, a new visual group is opened, even if that department appeared earlier.
 * - The same department can appear multiple times non-consecutively as separate distinct visual groups.
 * - Visual groups are NOT database tables or persisted entities.
 */
export function deriveConsecutiveDepartmentGroups(
  stages: Array<ProductionTemplateStageEntity | ProductionTemplateStageBrowserDto>
): ConsecutiveDepartmentGroup<any>[] {
  if (!stages || stages.length === 0) {
    return [];
  }

  // Clone and sort defensively by sortOrder
  const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);

  const groups: ConsecutiveDepartmentGroup<any>[] = [];
  let currentGroup: ConsecutiveDepartmentGroup<any> | null = null;

  for (const stage of sorted) {
    const deptId = stage.departmentId;
    const deptName = (stage as any).departmentName || (stage as any).department?.name || 'قسم غير محدد';
    const deptCode = (stage as any).departmentCode || (stage as any).department?.code || 'N/A';

    if (!currentGroup || currentGroup.departmentId !== deptId) {
      currentGroup = {
        departmentId: deptId,
        departmentName: deptName,
        departmentCode: deptCode,
        stages: [stage],
      };
      groups.push(currentGroup);
    } else {
      currentGroup.stages.push(stage);
    }
  }

  return groups;
}

export const calculateConsecutiveDepartmentGroups = deriveConsecutiveDepartmentGroups;
