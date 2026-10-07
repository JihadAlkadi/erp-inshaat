import { ProductionTemplateStageEntity } from './production-template-stage.entity.js';
import { ConsecutiveDepartmentGroup, ProductionTemplateStageBrowserDto } from './production-template-stage.types.js';

export type MixedWorkflowVisualElement =
  | {
      type: 'DEPARTMENT_GROUP';
      departmentId: string;
      departmentName: string;
      departmentCode: string;
      stages: any[];
    }
  | {
      type: 'PATTERN';
      workflowItemId: string;
      sortOrder: number;
      pattern: any;
    };

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
  const sorted = [...stages].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

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

/**
 * Mixed Workflow Visual Grouping Helper:
 * Groups consecutive STAGES in the same department into DEPARTMENT_GROUP elements,
 * while treating PATTERN as an explicit boundary that interrupts consecutive stage grouping.
 *
 * Example:
 * [Stage(Casting), Stage(Casting), Pattern, Stage(Casting)]
 * Results in:
 * [Group(Casting: 2 stages), Pattern, Group(Casting: 1 stage)]
 */
export function deriveMixedWorkflowGroups(
  workflowItems: Array<{
    id: string;
    itemType: 'STAGE' | 'PATTERN';
    sortOrder: number;
    stage?: any;
    pattern?: any;
  }>
): MixedWorkflowVisualElement[] {
  if (!workflowItems || workflowItems.length === 0) {
    return [];
  }

  const sorted = [...workflowItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const elements: MixedWorkflowVisualElement[] = [];
  let currentGroup: {
    type: 'DEPARTMENT_GROUP';
    departmentId: string;
    departmentName: string;
    departmentCode: string;
    stages: any[];
  } | null = null;

  for (const item of sorted) {
    if (item.itemType === 'STAGE' && item.stage) {
      const stage = { ...item.stage, workflowItemId: item.id, sortOrder: item.sortOrder };
      const deptId = stage.departmentId;
      const deptName = stage.departmentName || stage.department?.name || 'قسم غير محدد';
      const deptCode = stage.departmentCode || stage.department?.code || 'N/A';

      if (!currentGroup || currentGroup.departmentId !== deptId) {
        currentGroup = {
          type: 'DEPARTMENT_GROUP',
          departmentId: deptId,
          departmentName: deptName,
          departmentCode: deptCode,
          stages: [stage],
        };
        elements.push(currentGroup);
      } else {
        currentGroup.stages.push(stage);
      }
    } else if (item.itemType === 'PATTERN') {
      // PATTERN is a boundary: close the current department group!
      currentGroup = null;

      elements.push({
        type: 'PATTERN',
        workflowItemId: item.id,
        sortOrder: item.sortOrder,
        pattern: item.pattern,
      });
    }
  }

  return elements;
}

export const calculateConsecutiveDepartmentGroups = deriveConsecutiveDepartmentGroups;
