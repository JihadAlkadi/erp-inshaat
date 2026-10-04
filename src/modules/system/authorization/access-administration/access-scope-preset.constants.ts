export const AccessScopePreset = {
  ALL: 'ALL',
  CURRENT_PRODUCTION_DEPARTMENT: 'CURRENT_PRODUCTION_DEPARTMENT',
  CURRENT_PRODUCTION_YARDS: 'CURRENT_PRODUCTION_YARDS',
  SPECIFIC_PRODUCTION_DEPARTMENTS: 'SPECIFIC_PRODUCTION_DEPARTMENTS',
  SPECIFIC_PRODUCTION_YARDS: 'SPECIFIC_PRODUCTION_YARDS',
} as const;

export type AccessScopePresetType =
  (typeof AccessScopePreset)[keyof typeof AccessScopePreset];

export interface PresetDefinition {
  preset: AccessScopePresetType;
  label: string;
  scopeType: string;
  requiresTargetIds: boolean;
  targetType?: 'DEPARTMENT' | 'YARD';
  description: string;
}

export const PRESET_DEFINITIONS: Record<AccessScopePresetType, PresetDefinition> = {
  [AccessScopePreset.ALL]: {
    preset: AccessScopePreset.ALL,
    label: 'شامل (ALL)',
    scopeType: 'ALL',
    requiresTargetIds: false,
    description: 'وصول شامل لكافة السجلات دون قيود مكانية أو فرعية',
  },
  [AccessScopePreset.CURRENT_PRODUCTION_DEPARTMENT]: {
    preset: AccessScopePreset.CURRENT_PRODUCTION_DEPARTMENT,
    label: 'القسم التشغيلي الحالي',
    scopeType: 'PRODUCTION_DEPARTMENT',
    requiresTargetIds: false,
    description: 'يقتصر على قسم الإنتاج المسؤول عنه المستخدم تشغيلياً حالياً',
  },
  [AccessScopePreset.CURRENT_PRODUCTION_YARDS]: {
    preset: AccessScopePreset.CURRENT_PRODUCTION_YARDS,
    label: 'الساحات المسندة الحالية',
    scopeType: 'PRODUCTION_YARD',
    requiresTargetIds: false,
    description: 'يقتصر على ساحات الإنتاج المسندة للمهندس حالياً',
  },
  [AccessScopePreset.SPECIFIC_PRODUCTION_DEPARTMENTS]: {
    preset: AccessScopePreset.SPECIFIC_PRODUCTION_DEPARTMENTS,
    label: 'أقسام إنتاج محددة',
    scopeType: 'PRODUCTION_DEPARTMENT',
    requiresTargetIds: true,
    targetType: 'DEPARTMENT',
    description: 'تحديد قسم إنتاج واحد أو أكثر بالاسم',
  },
  [AccessScopePreset.SPECIFIC_PRODUCTION_YARDS]: {
    preset: AccessScopePreset.SPECIFIC_PRODUCTION_YARDS,
    label: 'ساحات إنتاج محددة',
    scopeType: 'PRODUCTION_YARD',
    requiresTargetIds: true,
    targetType: 'YARD',
    description: 'تحديد ساحة إنتاج واحدة أو أكثر بالاسم',
  },
};
