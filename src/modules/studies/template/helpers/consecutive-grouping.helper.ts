/**
 * Consecutive Department Grouping Architecture
 *
 * Core Rule (Sections 11-15, 73, 74):
 * - Template stages are globally ordered by sortOrder.
 * - Each stage directly holds its departmentId.
 * - The UI visually groups ONLY consecutive stages that share the same departmentId.
 * - If a different department intervenes, a new group is started.
 * - The same department appearing multiple times in the workflow is EXPECTED and MANDATORY.
 * - Department groups are derived presentation ONLY and are never stored in the database.
 */

export interface ConsecutiveDepartmentGroup<TStage = any> {
  groupId: string;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  stages: TStage[];
}

export function deriveConsecutiveDepartmentGroups<
  TStage extends {
    departmentId: string;
    department?: { name: string; code: string } | null;
    departmentName?: string;
    departmentCode?: string;
    sortOrder: number;
  }
>(stages: TStage[]): ConsecutiveDepartmentGroup<TStage>[] {
  if (!stages || stages.length === 0) {
    return [];
  }

  // Ensure stages are sorted by global sortOrder
  const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups: ConsecutiveDepartmentGroup<TStage>[] = [];

  for (const stage of sorted) {
    const deptName = stage.department?.name || stage.departmentName || 'قسم غير محدد';
    const deptCode = stage.department?.code || stage.departmentCode || '';
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.departmentId === stage.departmentId) {
      lastGroup.stages.push(stage);
    } else {
      groups.push({
        groupId: `dept-group-${groups.length}-${stage.departmentId}`,
        departmentId: stage.departmentId,
        departmentName: deptName,
        departmentCode: deptCode,
        stages: [stage],
      });
    }
  }

  return groups;
}
