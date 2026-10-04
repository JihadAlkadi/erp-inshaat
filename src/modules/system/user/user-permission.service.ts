import { IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { UserEntity } from './user.entity.js';
import { PermissionGrantEntity } from '../permission-grant/permission-grant.entity.js';
import { AccessRuleEntity } from '../access-rule/access-rule.entity.js';
import { PermissionEntity } from '../permission/permission.entity.js';
import { PermissionService, permissionService } from '../permission/permission.service.js';
import { AuthPrincipal } from '../auth/auth.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ForbiddenError } from '../../../common/errors/forbidden.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { CreateAccessRuleDto } from '../access-rule/dto/create-access-rule.dto.js';
import { UpdateAccessRuleDto } from '../access-rule/dto/update-access-rule.dto.js';
import {
  AccessRuleAdministrationService,
  accessRuleAdministrationService,
} from '../authorization/access-administration/access-rule-administration.service.js';
import {
  AccessScopeCapabilityRegistry,
} from '../authorization/access-administration/access-scope-capability.registry.js';
import {
  AccessRuleSummary,
  UserPermissionAdminItem,
  UserPermissionsAdminResponse,
} from '../authorization/access-administration/access-rule-administration.types.js';

export class UserPermissionService {
  private readonly userRepository: Repository<UserEntity>;
  private readonly grantRepository: Repository<PermissionGrantEntity>;
  private readonly accessRuleRepository: Repository<AccessRuleEntity>;
  private readonly permissionService: PermissionService;
  private readonly ruleAdminService: AccessRuleAdministrationService;

  constructor(
    userRepo: Repository<UserEntity> = AppDataSource.getRepository(UserEntity),
    grantRepo: Repository<PermissionGrantEntity> = AppDataSource.getRepository(PermissionGrantEntity),
    ruleRepo: Repository<AccessRuleEntity> = AppDataSource.getRepository(AccessRuleEntity),
    pService: PermissionService = permissionService,
    raService: AccessRuleAdministrationService = accessRuleAdministrationService
  ) {
    this.userRepository = userRepo;
    this.grantRepository = grantRepo;
    this.accessRuleRepository = ruleRepo;
    this.permissionService = pService;
    this.ruleAdminService = raService;
  }

  /**
   * Retrieves full permission administration read model for a user (role inherited + direct grants).
   */
  async getUserPermissionsState(
    userId: string,
    actorId?: string
  ): Promise<UserPermissionsAdminResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
      relations: { role: true },
    });

    if (!user) {
      throw new NotFoundError('المستخدم غير موجود', 'USER_NOT_FOUND');
    }

    const allPermissions = await this.permissionService.listActivePermissions();
    const now = new Date();

    const grantsQuery = this.grantRepository
      .createQueryBuilder('grant')
      .leftJoinAndSelect('grant.accessRules', 'rule')
      .where('grant.isActive = :isActive', { isActive: true })
      .andWhere('(grant.expiresAt IS NULL OR grant.expiresAt > :now)', { now });

    if (user.roleId) {
      grantsQuery.andWhere(
        '((grant.userId = :userId AND grant.roleId IS NULL) OR (grant.roleId = :roleId AND grant.userId IS NULL))',
        { userId: user.id, roleId: user.roleId }
      );
    } else {
      grantsQuery.andWhere('grant.userId = :userId AND grant.roleId IS NULL', { userId: user.id });
    }

    const applicableGrants = await grantsQuery.getMany();

    // Extract all rules for target labels batch resolution
    const allRules: AccessRuleEntity[] = [];
    for (const grant of applicableGrants) {
      if (grant.accessRules) {
        for (const rule of grant.accessRules) {
          allRules.push(rule);
        }
      }
    }

    const resolvedRulesMap = await this.ruleAdminService.batchResolveTargetLabels(allRules);

    const items: UserPermissionAdminItem[] = allPermissions.map((perm) => {
      const permGrants = applicableGrants.filter((g) => g.permissionId === perm.id);

      const directGrants = permGrants.filter((g) => g.userId === user.id && !g.roleId);
      const roleGrants = permGrants.filter(
        (g) => Boolean(user.roleId && g.roleId === user.roleId && !g.userId)
      );

      const directRules: AccessRuleSummary[] = [];
      let directAllowCount = 0;
      let directDenyCount = 0;
      let directHasAllowAll = false;
      let directHasDenyAll = false;

      for (const grant of directGrants) {
        if (grant.accessRules) {
          for (const rule of grant.accessRules) {
            if (rule.isActive) {
              const summary = resolvedRulesMap.get(rule.id);
              if (summary) directRules.push(summary);
              if (rule.effect === 'ALLOW') {
                directAllowCount++;
                if (rule.scopeType === 'ALL') directHasAllowAll = true;
              } else if (rule.effect === 'DENY') {
                directDenyCount++;
                if (rule.scopeType === 'ALL') directHasDenyAll = true;
              }
            }
          }
        }
      }

      const roleRules: AccessRuleSummary[] = [];
      let roleAllowCount = 0;
      let roleDenyCount = 0;
      let roleHasAllowAll = false;
      let roleHasDenyAll = false;

      for (const grant of roleGrants) {
        if (grant.accessRules) {
          for (const rule of grant.accessRules) {
            if (rule.isActive) {
              const summary = resolvedRulesMap.get(rule.id);
              if (summary) roleRules.push(summary);
              if (rule.effect === 'ALLOW') {
                roleAllowCount++;
                if (rule.scopeType === 'ALL') roleHasAllowAll = true;
              } else if (rule.effect === 'DENY') {
                roleDenyCount++;
                if (rule.scopeType === 'ALL') roleHasDenyAll = true;
              }
            }
          }
        }
      }

      const capabilities = AccessScopeCapabilityRegistry.getCapabilitiesForPermission(perm.name);

      const directSummary = this.ruleAdminService.generateConfigurationSummary(
        directRules.map((r) => ({
          effect: r.effect,
          preset: r.preset,
          targetIdsCount: r.targetIds.length,
          isActive: r.isActive,
        }))
      );

      const roleSummary = this.ruleAdminService.generateConfigurationSummary(
        roleRules.map((r) => ({
          effect: r.effect,
          preset: r.preset,
          targetIdsCount: r.targetIds.length,
          isActive: r.isActive,
        }))
      );

      // Effective merged summary
      const allActiveMergedRules = [...roleRules, ...directRules];
      const hasAnyAllow = roleAllowCount > 0 || directAllowCount > 0;
      const hasAnyDenyAll = roleHasDenyAll || directHasDenyAll;
      const effectiveSummary = this.ruleAdminService.generateConfigurationSummary(
        allActiveMergedRules.map((r) => ({
          effect: r.effect,
          preset: r.preset,
          targetIdsCount: r.targetIds.length,
          isActive: r.isActive,
        }))
      );

      return {
        permissionId: perm.id,
        name: perm.name,
        description: perm.description,
        role: {
          enabled: roleGrants.length > 0,
          allowRuleCount: roleAllowCount,
          denyRuleCount: roleDenyCount,
          hasAllowAll: roleHasAllowAll,
          hasDenyAll: roleHasDenyAll,
          rules: roleRules,
          summary: roleSummary,
        },
        direct: {
          enabled: directGrants.length > 0,
          allowRuleCount: directAllowCount,
          denyRuleCount: directDenyCount,
          hasAllowAll: directHasAllowAll,
          hasDenyAll: directHasDenyAll,
          rules: directRules,
          summary: directSummary,
        },
        effective: {
          hasAnyAllow,
          hasAnyDenyAll,
          summary: effectiveSummary,
        },
        capabilities,
      };
    });

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        roleId: user.roleId,
        roleName: user.role?.name,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      permissions: items,
      isSelf: actorId ? actorId === user.id : false,
    };
  }

  /**
   * Retrieves access rules for a specific direct user permission.
   */
  async getUserPermissionAccessRules(
    userId: string,
    permissionId: string
  ): Promise<{
    user: { id: string; fullName: string; phone: string; roleName?: string };
    permission: { id: string; name: string; description: string | null };
    directEnabled: boolean;
    capabilities: ReturnType<typeof AccessScopeCapabilityRegistry.getCapabilitiesForPermission>;
    directRules: AccessRuleSummary[];
    roleRules: AccessRuleSummary[];
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
      relations: { role: true },
    });

    if (!user) {
      throw new NotFoundError('المستخدم غير موجود', 'USER_NOT_FOUND');
    }

    const permission = await this.permissionService.getPermissionById(permissionId);
    const now = new Date();

    const grantsQuery = this.grantRepository
      .createQueryBuilder('grant')
      .leftJoinAndSelect('grant.accessRules', 'rule')
      .where('grant.permissionId = :permissionId', { permissionId })
      .andWhere('grant.isActive = :isActive', { isActive: true })
      .andWhere('(grant.expiresAt IS NULL OR grant.expiresAt > :now)', { now });

    if (user.roleId) {
      grantsQuery.andWhere(
        '((grant.userId = :userId AND grant.roleId IS NULL) OR (grant.roleId = :roleId AND grant.userId IS NULL))',
        { userId: user.id, roleId: user.roleId }
      );
    } else {
      grantsQuery.andWhere('grant.userId = :userId AND grant.roleId IS NULL', { userId: user.id });
    }

    const grants = await grantsQuery.getMany();

    const directGrants = grants.filter((g) => g.userId === user.id && !g.roleId);
    const roleGrants = grants.filter(
      (g) => Boolean(user.roleId && g.roleId === user.roleId && !g.userId)
    );

    const allRules: AccessRuleEntity[] = [];
    for (const grant of grants) {
      if (grant.accessRules) {
        for (const rule of grant.accessRules) {
          allRules.push(rule);
        }
      }
    }

    const resolvedRulesMap = await this.ruleAdminService.batchResolveTargetLabels(allRules);

    const directRules: AccessRuleSummary[] = [];
    for (const grant of directGrants) {
      if (grant.accessRules) {
        for (const rule of grant.accessRules) {
          const summary = resolvedRulesMap.get(rule.id);
          if (summary) directRules.push(summary);
        }
      }
    }

    const roleRules: AccessRuleSummary[] = [];
    for (const grant of roleGrants) {
      if (grant.accessRules) {
        for (const rule of grant.accessRules) {
          const summary = resolvedRulesMap.get(rule.id);
          if (summary) roleRules.push(summary);
        }
      }
    }

    const capabilities = AccessScopeCapabilityRegistry.getCapabilitiesForPermission(permission.name);

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        roleName: user.role?.name,
      },
      permission: {
        id: permission.id,
        name: permission.name,
        description: permission.description,
      },
      directEnabled: directGrants.length > 0,
      capabilities,
      directRules,
      roleRules,
    };
  }

  /**
   * Toggles direct permission enabled state for a user.
   * Invariant: Self Protection prevents modifying own direct permissions.
   * Checkbox Semantics: ONLY manages PermissionGrant.isActive. Does NOT create ALLOW ALL or any access rules!
   */
  async setUserPermissionState(
    userId: string,
    permissionId: string,
    enabled: boolean,
    actor: AuthPrincipal
  ): Promise<{ success: boolean; enabled: boolean; message: string }> {
    if (actor.id === userId) {
      throw new ForbiddenError(
        'لا يمكنك تعديل صلاحيات حسابك المباشرة بنفسك',
        'CANNOT_MANAGE_OWN_PERMISSIONS'
      );
    }

    return await AppDataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const grantRepo = manager.getRepository(PermissionGrantEntity);
      const permRepo = manager.getRepository(PermissionEntity);

      // 1. Pessimistic lock on Target User row (Serialization Point)
      const targetUser = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .andWhere('user.deletedAt IS NULL')
        .getOne();

      if (!targetUser) {
        throw new NotFoundError('المستخدم غير موجود', 'USER_NOT_FOUND');
      }

      // 2. Validate permission exists and is active
      const permission = await permRepo.findOne({
        where: { id: permissionId, isActive: true },
      });

      if (!permission) {
        throw new NotFoundError('الصلاحية غير موجودة أو غير نشطة', 'PERMISSION_NOT_FOUND');
      }

      const now = new Date();

      if (enabled) {
        // Ensure active valid direct grant exists
        const existingActiveGrant = await grantRepo.findOne({
          where: {
            userId: targetUser.id,
            permissionId,
            roleId: IsNull(),
            isActive: true,
          },
        });

        if (existingActiveGrant && (existingActiveGrant.expiresAt === null || existingActiveGrant.expiresAt > now)) {
          return {
            success: true,
            enabled: true,
            message: 'الصلاحية المباشرة مفعلة بالفعل لهذا المستخدم',
          };
        }

        // Create new active direct grant with zero rules
        const newGrant = grantRepo.create({
          userId: targetUser.id,
          permissionId,
          roleId: null,
          isActive: true,
          expiresAt: null,
          canDelegate: false,
          grantedBy: actor.id,
          grantedAt: now,
          reason: 'تفعيل الصلاحية المباشرة للمستخدم',
        });
        await grantRepo.save(newGrant);

        return {
          success: true,
          enabled: true,
          message: 'تم تفعيل الصلاحية المباشرة للمستخدم بنجاح. تذكر إضافة قواعد وصول لتفعيل المنح.',
        };
      } else {
        // Deactivate all active direct grants for (userId, permissionId)
        const activeGrants = await grantRepo.find({
          where: {
            userId: targetUser.id,
            permissionId,
            roleId: IsNull(),
            isActive: true,
          },
        });

        for (const grant of activeGrants) {
          grant.isActive = false;
          await grantRepo.save(grant);
        }

        return {
          success: true,
          enabled: false,
          message: 'تم تعطيل الصلاحية المباشرة للمستخدم بنجاح',
        };
      }
    });
  }

  /**
   * Adds an access rule to an enabled direct user permission.
   */
  async createUserAccessRule(
    userId: string,
    permissionId: string,
    dto: CreateAccessRuleDto,
    actor: AuthPrincipal
  ): Promise<AccessRuleSummary> {
    if (actor.id === userId) {
      throw new ForbiddenError(
        'لا يمكنك تعديل صلاحيات حسابك المباشرة بنفسك',
        'CANNOT_MANAGE_OWN_PERMISSIONS'
      );
    }

    return await AppDataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const grantRepo = manager.getRepository(PermissionGrantEntity);
      const permRepo = manager.getRepository(PermissionEntity);
      const ruleRepo = manager.getRepository(AccessRuleEntity);

      // 1. Lock Target User row (Serialization Point)
      const targetUser = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .andWhere('user.deletedAt IS NULL')
        .getOne();

      if (!targetUser) {
        throw new NotFoundError('المستخدم غير موجود', 'USER_NOT_FOUND');
      }

      // 2. Validate permission
      const permission = await permRepo.findOne({
        where: { id: permissionId, isActive: true },
      });

      if (!permission) {
        throw new NotFoundError('الصلاحية غير موجودة أو غير نشطة', 'PERMISSION_NOT_FOUND');
      }

      // 3. Validate preset capability for permission
      const isAllowed = AccessScopeCapabilityRegistry.isPresetAllowed(permission.name, dto.preset);
      if (!isAllowed) {
        throw new BusinessRuleError(
          `نطاق الوصول المحدد (${dto.preset}) غير مدعوم لهذه الصلاحية`,
          'PRESET_NOT_SUPPORTED_FOR_PERMISSION'
        );
      }

      // 4. Map preset to persistence shape & validate targets
      const persistenceShape = this.ruleAdminService.mapPresetToPersistenceShape(
        dto.preset,
        dto.targetIds
      );

      await this.ruleAdminService.validateTargetEntitiesExist(
        manager,
        dto.preset,
        persistenceShape.normalizedTargetIds
      );

      // 5. Select writable active direct grant deterministically
      const now = new Date();
      const activeGrants = await grantRepo
        .createQueryBuilder('grant')
        .leftJoinAndSelect('grant.accessRules', 'rule')
        .where('grant.userId = :userId', { userId: targetUser.id })
        .andWhere('grant.permissionId = :permissionId', { permissionId })
        .andWhere('grant.roleId IS NULL')
        .andWhere('grant.isActive = :isActive', { isActive: true })
        .andWhere('(grant.expiresAt IS NULL OR grant.expiresAt > :now)', { now })
        .orderBy('grant.updatedAt', 'DESC')
        .addOrderBy('grant.id', 'ASC')
        .getMany();

      if (activeGrants.length === 0) {
        throw new BusinessRuleError(
          'الصلاحية المباشرة غير مفعلة لهذا المستخدم. يرجى تفعيل الصلاحية أولاً قبل إضافة قواعد الوصول.',
          'PERMISSION_NOT_ENABLED'
        );
      }

      const targetGrant = activeGrants[0];

      // 6. Check duplicate active rule
      const scopeJson = persistenceShape.scope ? JSON.stringify(persistenceShape.scope) : null;
      const existingRules = targetGrant.accessRules ?? [];
      const isDuplicate = existingRules.some((r) => {
        if (!r.isActive) return false;
        if (r.effect !== dto.effect) return false;
        if (r.scopeType !== persistenceShape.scopeType) return false;
        const currentJson = r.scope ? JSON.stringify(r.scope) : null;
        return currentJson === scopeJson;
      });

      if (isDuplicate) {
        throw new ConflictError(
          'توجد قاعدة وصول نشطة مطابقة تماماً لنفس التأثير والنطاق والأهداف',
          'ACCESS_RULE_ALREADY_EXISTS'
        );
      }

      // 7. Save AccessRule
      const newRule = ruleRepo.create({
        permissionGrantId: targetGrant.id,
        effect: dto.effect,
        scopeType: persistenceShape.scopeType,
        scope: persistenceShape.scope,
        description: dto.description?.trim() || null,
        isActive: true,
      });

      const savedRule = await ruleRepo.save(newRule);

      const resolvedMap = await this.ruleAdminService.batchResolveTargetLabels([savedRule], manager);
      return resolvedMap.get(savedRule.id)!;
    });
  }

  /**
   * Updates an existing access rule for a direct user permission.
   */
  async updateUserAccessRule(
    userId: string,
    permissionId: string,
    ruleId: string,
    dto: UpdateAccessRuleDto,
    actor: AuthPrincipal
  ): Promise<AccessRuleSummary> {
    if (actor.id === userId) {
      throw new ForbiddenError(
        'لا يمكنك تعديل صلاحيات حسابك المباشرة بنفسك',
        'CANNOT_MANAGE_OWN_PERMISSIONS'
      );
    }

    return await AppDataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const permRepo = manager.getRepository(PermissionEntity);
      const ruleRepo = manager.getRepository(AccessRuleEntity);

      // 1. Lock Target User row (Serialization Point)
      const targetUser = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .andWhere('user.deletedAt IS NULL')
        .getOne();

      if (!targetUser) {
        throw new NotFoundError('المستخدم غير موجود', 'USER_NOT_FOUND');
      }

      // 2. Validate permission
      const permission = await permRepo.findOne({
        where: { id: permissionId, isActive: true },
      });

      if (!permission) {
        throw new NotFoundError('الصلاحية غير موجودة أو غير نشطة', 'PERMISSION_NOT_FOUND');
      }

      // 3. Load rule and verify strict direct user ownership
      const existingRule = await ruleRepo
        .createQueryBuilder('rule')
        .innerJoinAndSelect('rule.permissionGrant', 'grant')
        .where('rule.id = :ruleId', { ruleId })
        .andWhere('grant.userId = :userId', { userId })
        .andWhere('grant.permissionId = :permissionId', { permissionId })
        .andWhere('grant.roleId IS NULL')
        .getOne();

      if (!existingRule) {
        throw new NotFoundError('قاعدة الوصول غير موجودة', 'ACCESS_RULE_NOT_FOUND');
      }

      // 4. Validate preset capability
      const isAllowed = AccessScopeCapabilityRegistry.isPresetAllowed(permission.name, dto.preset);
      if (!isAllowed) {
        throw new BusinessRuleError(
          `نطاق الوصول المحدد (${dto.preset}) غير مدعوم لهذه الصلاحية`,
          'PRESET_NOT_SUPPORTED_FOR_PERMISSION'
        );
      }

      // 5. Map preset to persistence shape & validate targets
      const persistenceShape = this.ruleAdminService.mapPresetToPersistenceShape(
        dto.preset,
        dto.targetIds
      );

      await this.ruleAdminService.validateTargetEntitiesExist(
        manager,
        dto.preset,
        persistenceShape.normalizedTargetIds
      );

      // 6. Check duplicate active rule (excluding self)
      const scopeJson = persistenceShape.scope ? JSON.stringify(persistenceShape.scope) : null;
      const grantRules = await ruleRepo.find({
        where: {
          permissionGrantId: existingRule.permissionGrantId,
          isActive: true,
        },
      });

      const isDuplicate = grantRules.some((r) => {
        if (r.id === existingRule.id) return false;
        if (r.effect !== dto.effect) return false;
        if (r.scopeType !== persistenceShape.scopeType) return false;
        const currentJson = r.scope ? JSON.stringify(r.scope) : null;
        return currentJson === scopeJson;
      });

      if (isDuplicate) {
        throw new ConflictError(
          'توجد قاعدة وصول نشطة مطابقة تماماً لنفس التأثير والنطاق والأهداف',
          'ACCESS_RULE_ALREADY_EXISTS'
        );
      }

      // 7. Update and Save
      existingRule.effect = dto.effect;
      existingRule.scopeType = persistenceShape.scopeType;
      existingRule.scope = persistenceShape.scope;
      existingRule.description = dto.description?.trim() || null;
      existingRule.isActive = true;

      const savedRule = await ruleRepo.save(existingRule);

      const resolvedMap = await this.ruleAdminService.batchResolveTargetLabels([savedRule], manager);
      return resolvedMap.get(savedRule.id)!;
    });
  }

  /**
   * Soft-disables an access rule for a direct user permission (isActive = false).
   */
  async deleteUserAccessRule(
    userId: string,
    permissionId: string,
    ruleId: string,
    actor: AuthPrincipal
  ): Promise<{ success: boolean; message: string }> {
    if (actor.id === userId) {
      throw new ForbiddenError(
        'لا يمكنك تعديل صلاحيات حسابك المباشرة بنفسك',
        'CANNOT_MANAGE_OWN_PERMISSIONS'
      );
    }

    return await AppDataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const ruleRepo = manager.getRepository(AccessRuleEntity);

      // 1. Lock Target User row (Serialization Point)
      const targetUser = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .andWhere('user.deletedAt IS NULL')
        .getOne();

      if (!targetUser) {
        throw new NotFoundError('المستخدم غير موجود', 'USER_NOT_FOUND');
      }

      // 2. Load rule and verify strict direct user ownership
      const existingRule = await ruleRepo
        .createQueryBuilder('rule')
        .innerJoin('rule.permissionGrant', 'grant')
        .where('rule.id = :ruleId', { ruleId })
        .andWhere('grant.userId = :userId', { userId })
        .andWhere('grant.permissionId = :permissionId', { permissionId })
        .andWhere('grant.roleId IS NULL')
        .getOne();

      if (!existingRule) {
        throw new NotFoundError('قاعدة الوصول غير موجودة', 'ACCESS_RULE_NOT_FOUND');
      }

      existingRule.isActive = false;
      await ruleRepo.save(existingRule);

      return {
        success: true,
        message: 'تم تعطيل قاعدة الوصول بنجاح',
      };
    });
  }
}

export const userPermissionService = new UserPermissionService();
