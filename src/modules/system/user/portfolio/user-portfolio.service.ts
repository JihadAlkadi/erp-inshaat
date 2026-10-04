import { UserService, userService } from '../user.service.js';
import { UserPermissionService, userPermissionService } from '../user-permission.service.js';
import {
  AuthorizationService,
  authorizationService,
} from '../../authorization/authorization.service.js';
import {
  ProductionUserResponsibilityReadService,
  productionUserResponsibilityReadService,
} from '../../../production/team/production-user-responsibility-read.service.js';
import { ResolvedProductionAccessPolicy } from '../../../production/authorization/production-access-policy.types.js';
import { AuthPrincipal } from '../../auth/auth.types.js';
import { SystemPermission } from '../../permission/constants/system-permission.enum.js';
import {
  UserPortfolioBaseViewModel,
  UserPortfolioOverviewViewModel,
  UserPortfolioAccountViewModel,
  UserPortfolioProductionViewModel,
  UserPortfolioWarning,
  UserPortfolioTab,
} from './user-portfolio.types.js';

export class UserPortfolioService {
  private readonly userService: UserService;
  private readonly userPermissionService: UserPermissionService;
  private readonly authorizationService: AuthorizationService;
  private readonly productionResponsibilityReadService: ProductionUserResponsibilityReadService;

  constructor(
    uService: UserService = userService,
    upService: UserPermissionService = userPermissionService,
    authzService: AuthorizationService = authorizationService,
    prodReadService: ProductionUserResponsibilityReadService = productionUserResponsibilityReadService
  ) {
    this.userService = uService;
    this.userPermissionService = upService;
    this.authorizationService = authzService;
    this.productionResponsibilityReadService = prodReadService;
  }

  /**
   * Helper to build base view model with permissions and user identity.
   */
  async getBaseViewModel(
    userId: string,
    actor: AuthPrincipal,
    activeTab: UserPortfolioTab,
    viewPolicy?: ResolvedProductionAccessPolicy
  ): Promise<UserPortfolioBaseViewModel> {
    const targetUser = await this.userService.getUserById(userId);
    const effectivePerms = await this.authorizationService.getEffectivePermissions(actor);

    const isSelf = actor.id === targetUser.id;
    const canUpdate = effectivePerms.includes(SystemPermission.USER_UPDATE);
    const canDelete = !isSelf && effectivePerms.includes(SystemPermission.USER_DELETE);
    const canManagePermissions =
      !isSelf && effectivePerms.includes(SystemPermission.USER_PERMISSION_MANAGE);
    const canViewProduction = Boolean(viewPolicy?.hasAnyAccess);

    return {
      targetUser,
      isSelf,
      canUpdate,
      canDelete,
      canManagePermissions,
      canViewProduction,
      activePortfolioTab: activeTab,
    };
  }

  /**
   * Assembles the User Portfolio Overview view model with aggregated summaries and security warnings.
   */
  async getOverview(
    userId: string,
    actor: AuthPrincipal,
    viewPolicy: ResolvedProductionAccessPolicy,
    managePolicy: ResolvedProductionAccessPolicy
  ): Promise<UserPortfolioOverviewViewModel> {
    const base = await this.getBaseViewModel(userId, actor, 'overview', viewPolicy);
    const warnings: UserPortfolioWarning[] = [];

    // 1. Account status warning
    if (!base.targetUser.isActive) {
      warnings.push({
        code: 'ACCOUNT_INACTIVE',
        severity: 'INFO',
        title: 'الحساب معطل',
        message: 'تم تعطيل هذا الحساب ولن يتمكن المستخدم من تسجيل الدخول أو أداء العمليات.',
      });
    }

    // 2. Permissions inspection & warnings aggregation
    const permStates = await this.userPermissionService.getUserPermissionsState(
      userId,
      actor.id
    );

    let inheritedCount = 0;
    let directCount = 0;
    let directWithoutAllowCount = 0;
    let roleWithoutAllowCount = 0;
    let invalidAllowCount = 0;
    let hasInvalidDeny = false;

    for (const p of permStates.permissions) {
      if (p.role.enabled) {
        inheritedCount++;
        const validAllows = p.role.rules.filter((r) => r.effect === 'ALLOW' && r.isValid && r.isActive);
        if (validAllows.length === 0) {
          roleWithoutAllowCount++;
        }
      }

      if (p.direct.enabled) {
        directCount++;
        const validAllows = p.direct.rules.filter((r) => r.effect === 'ALLOW' && r.isValid && r.isActive);
        if (validAllows.length === 0) {
          directWithoutAllowCount++;
        }
      }

      // Check for invalid rules across role and direct
      const allRules = [...p.role.rules, ...p.direct.rules];
      for (const r of allRules) {
        if (!r.isValid && r.isActive) {
          if (r.effect === 'DENY') {
            hasInvalidDeny = true;
          } else if (r.effect === 'ALLOW') {
            invalidAllowCount++;
          }
        }
      }
    }

    if (hasInvalidDeny) {
      warnings.push({
        code: 'INVALID_DENY_RULE',
        severity: 'CRITICAL',
        title: 'قاعدة حظر غير صالحة',
        message: 'توجد قاعدة حظر تالفة أو غير صالحة تؤدي لانغلاق الأمان ورفض الوصول التام.',
        href: `/system/users/${userId}/permissions`,
      });
    }

    if (directWithoutAllowCount > 0) {
      warnings.push({
        code: 'DIRECT_PERMISSION_WITHOUT_ALLOW',
        severity: 'WARNING',
        title: 'صلاحيات مباشرة بدون منح',
        message: `توجد ${directWithoutAllowCount} صلاحية مباشرة مفعلة بدون أي قاعدة منح فعالة.`,
        href: `/system/users/${userId}/permissions`,
      });
    }

    if (roleWithoutAllowCount > 0) {
      warnings.push({
        code: 'ROLE_PERMISSION_WITHOUT_ALLOW',
        severity: 'WARNING',
        title: 'صلاحيات دور بدون منح',
        message: `توجد ${roleWithoutAllowCount} صلاحية موروثة من الدور مفعلة بدون أي قاعدة منح فعالة.`,
        href: `/system/users/${userId}/permissions`,
      });
    }

    if (invalidAllowCount > 0) {
      warnings.push({
        code: 'INVALID_ALLOW_RULE',
        severity: 'WARNING',
        title: 'قواعد منح غير صالحة',
        message: `توجد ${invalidAllowCount} قاعدة منح غير صالحة أو تالفة ولا تمنح أي وصول.`,
        href: `/system/users/${userId}/permissions`,
      });
    }

    // 3. Production responsibility resolution if authorized
    let productionResponsibility;
    if (viewPolicy.hasAnyAccess) {
      productionResponsibility =
        await this.productionResponsibilityReadService.getUserResponsibility(
          userId,
          viewPolicy,
          managePolicy
        );

      if (productionResponsibility.state === 'INCONSISTENT') {
        warnings.push({
          code: 'PRODUCTION_RESPONSIBILITY_INCONSISTENT',
          severity: 'WARNING',
          title: 'حالة تشغيلية غير متسقة',
          message: 'الحالة التشغيلية لهذا المستخدم في تطبيق الإنتاج غير متسقة وتحتاج معالجة إدارية.',
          href: `/system/users/${userId}/production`,
        });
      }
    }

    return {
      ...base,
      permissionSummary: {
        inheritedCount,
        directCount,
        warningCount: warnings.length,
      },
      warnings,
      productionResponsibility,
    };
  }

  /**
   * Assembles the User Portfolio Account view model with read-only details.
   */
  async getAccount(
    userId: string,
    actor: AuthPrincipal,
    viewPolicy?: ResolvedProductionAccessPolicy
  ): Promise<UserPortfolioAccountViewModel> {
    const base = await this.getBaseViewModel(userId, actor, 'account', viewPolicy);

    return {
      ...base,
      accountDetails: {
        id: base.targetUser.id,
        fullName: base.targetUser.fullName,
        phone: base.targetUser.phone,
        roleName: base.targetUser.roleName || 'بدون دور',
        roleId: base.targetUser.roleId || '',
        isActive: base.targetUser.isActive,
        createdAt: base.targetUser.createdAt,
        updatedAt: base.targetUser.updatedAt,
      },
    };
  }

  /**
   * Assembles the User Portfolio Production view model with authorization-aware responsibility data.
   */
  async getProduction(
    userId: string,
    actor: AuthPrincipal,
    viewPolicy: ResolvedProductionAccessPolicy,
    managePolicy: ResolvedProductionAccessPolicy
  ): Promise<UserPortfolioProductionViewModel> {
    const base = await this.getBaseViewModel(userId, actor, 'production', viewPolicy);
    const productionResponsibility =
      await this.productionResponsibilityReadService.getUserResponsibility(
        userId,
        viewPolicy,
        managePolicy
      );

    return {
      ...base,
      productionResponsibility,
    };
  }
}

export const userPortfolioService = new UserPortfolioService();
