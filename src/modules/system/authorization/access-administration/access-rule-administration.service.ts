import { EntityManager, In } from 'typeorm';
import { AccessRuleEntity } from '../../access-rule/access-rule.entity.js';
import { ProductionDepartmentEntity } from '../../../production/department/production-department.entity.js';
import { ProductionYardEntity } from '../../../production/yard/production-yard.entity.js';
import {
  AccessScopePreset,
  AccessScopePresetType,
  PRESET_DEFINITIONS,
} from './access-scope-preset.constants.js';
import {
  AccessRuleSummary,
  AccessRuleTargetSummary,
} from './access-rule-administration.types.js';
import {
  isCurrentProductionResponsibilityScope,
  isSpecificDepartmentScope,
  isSpecificYardScope,
} from '../../../production/authorization/production-access-policy.types.js';
import { BusinessRuleError } from '../../../../common/errors/business-rule.error.js';
import { NotFoundError } from '../../../../common/errors/not-found.error.js';
import { AppDataSource } from '../../../../database/data-source.js';

export interface PersistenceShapeResult {
  scopeType: string;
  scope: Record<string, unknown> | null;
  normalizedTargetIds: string[];
}

export class AccessRuleAdministrationService {
  /**
   * Maps an AccessRuleEntity into a preset and target IDs.
   */
  mapRuleToPresetAndTargets(rule: AccessRuleEntity): {
    preset: AccessScopePresetType;
    presetLabel: string;
    targetIds: string[];
  } {
    if (rule.scopeType === 'ALL') {
      return {
        preset: AccessScopePreset.ALL,
        presetLabel: PRESET_DEFINITIONS[AccessScopePreset.ALL].label,
        targetIds: [],
      };
    }

    if (rule.scopeType === 'PRODUCTION_DEPARTMENT') {
      if (isCurrentProductionResponsibilityScope(rule.scope)) {
        return {
          preset: AccessScopePreset.CURRENT_PRODUCTION_DEPARTMENT,
          presetLabel: PRESET_DEFINITIONS[AccessScopePreset.CURRENT_PRODUCTION_DEPARTMENT].label,
          targetIds: [],
        };
      }
      if (isSpecificDepartmentScope(rule.scope)) {
        return {
          preset: AccessScopePreset.SPECIFIC_PRODUCTION_DEPARTMENTS,
          presetLabel: PRESET_DEFINITIONS[AccessScopePreset.SPECIFIC_PRODUCTION_DEPARTMENTS].label,
          targetIds: [...rule.scope.departmentIds],
        };
      }
    }

    if (rule.scopeType === 'PRODUCTION_YARD') {
      if (isCurrentProductionResponsibilityScope(rule.scope)) {
        return {
          preset: AccessScopePreset.CURRENT_PRODUCTION_YARDS,
          presetLabel: PRESET_DEFINITIONS[AccessScopePreset.CURRENT_PRODUCTION_YARDS].label,
          targetIds: [],
        };
      }
      if (isSpecificYardScope(rule.scope)) {
        return {
          preset: AccessScopePreset.SPECIFIC_PRODUCTION_YARDS,
          presetLabel: PRESET_DEFINITIONS[AccessScopePreset.SPECIFIC_PRODUCTION_YARDS].label,
          targetIds: [...rule.scope.yardIds],
        };
      }
    }

    // Fallback for unknown / legacy scopes
    return {
      preset: AccessScopePreset.ALL,
      presetLabel: rule.scopeType,
      targetIds: [],
    };
  }

  /**
   * Maps client preset and targetIds into exact-shape persistence payload.
   */
  mapPresetToPersistenceShape(
    preset: AccessScopePresetType,
    targetIds?: string[]
  ): PersistenceShapeResult {
    switch (preset) {
      case AccessScopePreset.ALL: {
        if (targetIds && targetIds.length > 0) {
          throw new BusinessRuleError(
            'لا يمكن تحديد أهداف محددة لنطاق الوصول الشامل (ALL)',
            'TARGET_IDS_NOT_ALLOWED'
          );
        }
        return {
          scopeType: 'ALL',
          scope: null,
          normalizedTargetIds: [],
        };
      }

      case AccessScopePreset.CURRENT_PRODUCTION_DEPARTMENT: {
        if (targetIds && targetIds.length > 0) {
          throw new BusinessRuleError(
            'لا يمكن تحديد أهداف محددة لنطاق القسم التشغيلي الحالي',
            'TARGET_IDS_NOT_ALLOWED'
          );
        }
        return {
          scopeType: 'PRODUCTION_DEPARTMENT',
          scope: {
            source: 'CURRENT_PRODUCTION_RESPONSIBILITY',
          },
          normalizedTargetIds: [],
        };
      }

      case AccessScopePreset.CURRENT_PRODUCTION_YARDS: {
        if (targetIds && targetIds.length > 0) {
          throw new BusinessRuleError(
            'لا يمكن تحديد أهداف محددة لنطاق الساحات المسندة الحالية',
            'TARGET_IDS_NOT_ALLOWED'
          );
        }
        return {
          scopeType: 'PRODUCTION_YARD',
          scope: {
            source: 'CURRENT_PRODUCTION_RESPONSIBILITY',
          },
          normalizedTargetIds: [],
        };
      }

      case AccessScopePreset.SPECIFIC_PRODUCTION_DEPARTMENTS: {
        if (!targetIds || targetIds.length === 0) {
          throw new BusinessRuleError(
            'يجب تحديد قسم إنتاج واحد على الأقل',
            'TARGET_IDS_REQUIRED'
          );
        }
        const normalized = Array.from(new Set(targetIds.map((id) => id.trim()))).sort();
        if (normalized.length === 0 || normalized.length > 200) {
          throw new BusinessRuleError(
            'عدد الأقسام المحددة يجب أن يكون بين 1 و 200',
            'INVALID_TARGET_COUNT'
          );
        }
        return {
          scopeType: 'PRODUCTION_DEPARTMENT',
          scope: {
            source: 'SPECIFIC_IDS',
            departmentIds: normalized,
          },
          normalizedTargetIds: normalized,
        };
      }

      case AccessScopePreset.SPECIFIC_PRODUCTION_YARDS: {
        if (!targetIds || targetIds.length === 0) {
          throw new BusinessRuleError(
            'يجب تحديد ساحة إنتاج واحدة على الأقل',
            'TARGET_IDS_REQUIRED'
          );
        }
        const normalized = Array.from(new Set(targetIds.map((id) => id.trim()))).sort();
        if (normalized.length === 0 || normalized.length > 200) {
          throw new BusinessRuleError(
            'عدد الساحات المحددة يجب أن يكون بين 1 و 200',
            'INVALID_TARGET_COUNT'
          );
        }
        return {
          scopeType: 'PRODUCTION_YARD',
          scope: {
            source: 'SPECIFIC_IDS',
            yardIds: normalized,
          },
          normalizedTargetIds: normalized,
        };
      }

      default:
        throw new BusinessRuleError('نوع نطاق الوصول غير مدعوم', 'UNSUPPORTED_PRESET');
    }
  }

  /**
   * Validates that specific target entities exist and are non-deleted in database.
   */
  async validateTargetEntitiesExist(
    manager: EntityManager,
    preset: AccessScopePresetType,
    normalizedTargetIds: string[]
  ): Promise<void> {
    if (normalizedTargetIds.length === 0) {
      return;
    }

    if (preset === AccessScopePreset.SPECIFIC_PRODUCTION_DEPARTMENTS) {
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);
      const existing = await deptRepo.find({
        where: {
          id: In(normalizedTargetIds),
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

      const validCount = existing.filter((d) => d.deletedAt === null).length;
      if (validCount !== normalizedTargetIds.length) {
        throw new NotFoundError(
          'أحد أقسام الإنتاج المحددة غير موجود أو تمت أرشفته',
          'DEPARTMENT_NOT_FOUND'
        );
      }
    } else if (preset === AccessScopePreset.SPECIFIC_PRODUCTION_YARDS) {
      const yardRepo = manager.getRepository(ProductionYardEntity);
      const existing = await yardRepo.find({
        where: {
          id: In(normalizedTargetIds),
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

      const validCount = existing.filter((y) => y.deletedAt === null).length;
      if (validCount !== normalizedTargetIds.length) {
        throw new NotFoundError(
          'إحدى ساحات الإنتاج المحددة غير موجودة أو تمت أرشفتها',
          'YARD_NOT_FOUND'
        );
      }
    }
  }

  /**
   * Batch resolves target labels (departments & yards) for a collection of rules without N+1.
   */
  async batchResolveTargetLabels(
    rules: AccessRuleEntity[],
    manager?: EntityManager
  ): Promise<Map<string, AccessRuleSummary>> {
    const ds = manager ?? AppDataSource.manager;
    const deptRepo = ds.getRepository(ProductionDepartmentEntity);
    const yardRepo = ds.getRepository(ProductionYardEntity);

    const allDeptIds = new Set<string>();
    const allYardIds = new Set<string>();

    const ruleParsed = rules.map((r) => {
      const { preset, presetLabel, targetIds } = this.mapRuleToPresetAndTargets(r);
      if (preset === AccessScopePreset.SPECIFIC_PRODUCTION_DEPARTMENTS) {
        for (const id of targetIds) allDeptIds.add(id);
      } else if (preset === AccessScopePreset.SPECIFIC_PRODUCTION_YARDS) {
        for (const id of targetIds) allYardIds.add(id);
      }
      return { rule: r, preset, presetLabel, targetIds };
    });

    const deptMap = new Map<string, { name: string; code: string; isActive: boolean; isAvailable: boolean }>();
    if (allDeptIds.size > 0) {
      const depts = await deptRepo.find({
        where: { id: In(Array.from(allDeptIds)) },
        withDeleted: true,
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          deletedAt: true,
        },
      });
      for (const d of depts) {
        deptMap.set(d.id, {
          name: d.deletedAt ? `${d.name} (مؤرشف)` : d.name,
          code: d.code,
          isActive: d.isActive,
          isAvailable: d.deletedAt === null,
        });
      }
    }

    const yardMap = new Map<string, { name: string; code: string; isActive: boolean; isAvailable: boolean; departmentName?: string }>();
    if (allYardIds.size > 0) {
      const yards = await yardRepo.find({
        where: { id: In(Array.from(allYardIds)) },
        relations: { department: true },
        withDeleted: true,
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          deletedAt: true,
          department: { id: true, name: true },
        },
      });
      for (const y of yards) {
        yardMap.set(y.id, {
          name: y.deletedAt ? `${y.name} (مؤرشف)` : y.name,
          code: y.code,
          isActive: y.isActive,
          isAvailable: y.deletedAt === null,
          departmentName: y.department?.name,
        });
      }
    }

    const resultMap = new Map<string, AccessRuleSummary>();

    for (const item of ruleParsed) {
      const targets: AccessRuleTargetSummary[] = item.targetIds.map((id) => {
        if (item.preset === AccessScopePreset.SPECIFIC_PRODUCTION_DEPARTMENTS) {
          const dept = deptMap.get(id);
          if (dept) {
            return {
              id,
              name: dept.name,
              code: dept.code,
              isActive: dept.isActive,
              isAvailable: dept.isAvailable,
            };
          }
        } else if (item.preset === AccessScopePreset.SPECIFIC_PRODUCTION_YARDS) {
          const yard = yardMap.get(id);
          if (yard) {
            return {
              id,
              name: yard.name,
              code: yard.code,
              isActive: yard.isActive,
              isAvailable: yard.isAvailable,
              departmentName: yard.departmentName,
            };
          }
        }

        return {
          id,
          name: 'هدف غير متاح (محذوف)',
          isAvailable: false,
        };
      });

      resultMap.set(item.rule.id, {
        id: item.rule.id,
        permissionGrantId: item.rule.permissionGrantId,
        effect: item.rule.effect,
        scopeType: item.rule.scopeType,
        preset: item.preset,
        presetLabel: item.presetLabel,
        targetIds: item.targetIds,
        targets,
        description: item.rule.description,
        isActive: item.rule.isActive,
        createdAt: item.rule.createdAt,
        updatedAt: item.rule.updatedAt,
      });
    }

    return resultMap;
  }

  /**
   * Generates a concise human-readable summary of effective access configuration for a permission.
   */
  generateConfigurationSummary(
    rules: { effect: 'ALLOW' | 'DENY'; preset: AccessScopePresetType; targetIdsCount: number; isActive: boolean }[]
  ): string {
    const activeRules = rules.filter((r) => r.isActive);
    if (activeRules.length === 0) {
      return 'لا توجد قواعد وصول فعالة';
    }

    const hasDenyAll = activeRules.some((r) => r.effect === 'DENY' && r.preset === AccessScopePreset.ALL);
    if (hasDenyAll) {
      return 'محظور كلياً بقاعدة حظر شاملة (DENY ALL)';
    }

    const allows = activeRules.filter((r) => r.effect === 'ALLOW');
    const denys = activeRules.filter((r) => r.effect === 'DENY');

    if (allows.length === 0) {
      return 'لا توجد قواعد منح (ALLOW) فعالة';
    }

    const allowLabels = allows.map((a) => {
      switch (a.preset) {
        case AccessScopePreset.ALL:
          return 'شامل';
        case AccessScopePreset.CURRENT_PRODUCTION_DEPARTMENT:
          return 'القسم التشغيلي الحالي';
        case AccessScopePreset.CURRENT_PRODUCTION_YARDS:
          return 'الساحات المسندة الحالية';
        case AccessScopePreset.SPECIFIC_PRODUCTION_DEPARTMENTS:
          return `${a.targetIdsCount} أقسام محددة`;
        case AccessScopePreset.SPECIFIC_PRODUCTION_YARDS:
          return `${a.targetIdsCount} ساحات محددة`;
        default:
          return a.preset;
      }
    });

    let summary = `منح: ${allowLabels.join(' + ')}`;

    if (denys.length > 0) {
      const denyLabels = denys.map((d) => {
        switch (d.preset) {
          case AccessScopePreset.SPECIFIC_PRODUCTION_DEPARTMENTS:
            return `${d.targetIdsCount} أقسام مستثناة`;
          case AccessScopePreset.SPECIFIC_PRODUCTION_YARDS:
            return `${d.targetIdsCount} ساحات مستثناة`;
          case AccessScopePreset.CURRENT_PRODUCTION_DEPARTMENT:
            return 'استثناء القسم الحالي';
          case AccessScopePreset.CURRENT_PRODUCTION_YARDS:
            return 'استثناء الساحات الحالية';
          default:
            return d.preset;
        }
      });
      summary += ` (مع استثناء: ${denyLabels.join(' + ')})`;
    }

    return summary;
  }
}

export const accessRuleAdministrationService = new AccessRuleAdministrationService();
