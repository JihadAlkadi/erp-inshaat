import { IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { RoleEntity } from './role.entity.js';
import { PermissionGrantEntity } from '../permission-grant/permission-grant.entity.js';
import { AccessRuleEntity } from '../access-rule/access-rule.entity.js';
import { PermissionEntity } from '../permission/permission.entity.js';
import { PermissionService, permissionService } from '../permission/permission.service.js';
import { RoleService, roleService } from './role.service.js';
import { SystemRole } from './constants/system-role.enum.js';
import { AuthPrincipal } from '../auth/auth.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
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
  RolePermissionAdminItem,
  RolePermissionsAdminResponse,
} from '../authorization/access-administration/access-rule-administration.types.js';

export class RolePermissionService {
  private readonly roleRepository: Repository<RoleEntity>;
  private readonly grantRepository: Repository<PermissionGrantEntity>;
  private readonly accessRuleRepository: Repository<AccessRuleEntity>;
  private readonly roleService: RoleService;
  private readonly permissionService: PermissionService;
  private readonly ruleAdminService: AccessRuleAdministrationService;

  constructor(
    roleRepo: Repository<RoleEntity> = AppDataSource.getRepository(RoleEntity),
    grantRepo: Repository<PermissionGrantEntity> = AppDataSource.getRepository(PermissionGrantEntity),
    ruleRepo: Repository<AccessRuleEntity> = AppDataSource.getRepository(AccessRuleEntity),
    rService: RoleService = roleService,
    pService: PermissionService = permissionService,
    raService: AccessRuleAdministrationService = accessRuleAdministrationService
  ) {
    this.roleRepository = roleRepo;
    this.grantRepository = grantRepo;
    this.accessRuleRepository = ruleRepo;
    this.roleService = rService;
    this.permissionService = pService;
    this.ruleAdminService = raService;
  }

  /**
   * Retrieves full permission administration read model for a role.
   * Single aggregated query set without N+1.
   */
  async getRolePermissionsState(roleId: string): Promise<RolePermissionsAdminResponse> {
    const role = await this.roleService.getRoleById(roleId);
    const isSystemAdmin = role.code === SystemRole.SYSTEM_ADMIN;

    const allPermissions = await this.permissionService.listActivePermissions();
    const now = new Date();

    const activeValidGrants = await this.grantRepository
      .createQueryBuilder('grant')
      .leftJoinAndSelect('grant.accessRules', 'rule')
      .where('grant.roleId = :roleId', { roleId })
      .andWhere('grant.userId IS NULL')
      .andWhere('grant.isActive = :isActive', { isActive: true })
      .andWhere('(grant.expiresAt IS NULL OR grant.expiresAt > :now)', { now })
      .getMany();

    // Extract all rules for target labels batch resolution
    const allRules: AccessRuleEntity[] = [];
    for (const grant of activeValidGrants) {
      if (grant.accessRules) {
        for (const rule of grant.accessRules) {
          allRules.push(rule);
        }
      }
    }

    const resolvedRulesMap = await this.ruleAdminService.batchResolveTargetLabels(allRules);

    const items: RolePermissionAdminItem[] = allPermissions.map((perm) => {
      const matchingGrants = activeValidGrants.filter((g) => g.permissionId === perm.id);
      const enabled = matchingGrants.length > 0;

      const ruleSummaries: AccessRuleSummary[] = [];
      let allowRuleCount = 0;
      let denyRuleCount = 0;
      let hasAllowAll = false;
      let hasDenyAll = false;

      for (const grant of matchingGrants) {
        if (grant.accessRules) {
          for (const rule of grant.accessRules) {
            if (rule.isActive) {
              const summary = resolvedRulesMap.get(rule.id);
              if (summary) {
                ruleSummaries.push(summary);
              }
              if (rule.effect === 'ALLOW') {
                allowRuleCount++;
                if (rule.scopeType === 'ALL') {
                  hasAllowAll = true;
                }
              } else if (rule.effect === 'DENY') {
                denyRuleCount++;
                if (rule.scopeType === 'ALL') {
                  hasDenyAll = true;
                }
              }
            }
          }
        }
      }

      const activeRuleCount = allowRuleCount + denyRuleCount;
      const hasAnyAllow = allowRuleCount > 0;
      const hasAnyDeny = denyRuleCount > 0;
      const capabilities = AccessScopeCapabilityRegistry.getCapabilitiesForPermission(perm.name);
      const summaryText = this.ruleAdminService.generateConfigurationSummary(
        ruleSummaries.map((r) => ({
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
        enabled,
        activeGrantCount: matchingGrants.length,
        allowRuleCount,
        denyRuleCount,
        activeRuleCount,
        hasAnyAllow,
        hasAnyDeny,
        hasAllowAll,
        hasDenyAll,
        capabilities,
        rules: ruleSummaries,
        summary: summaryText,
      };
    });

    return {
      role,
      permissions: items,
      isSystemAdmin,
    };
  }

  /**
   * Retrieves access rules for a specific role permission.
   */
  async getRolePermissionAccessRules(
    roleId: string,
    permissionId: string
  ): Promise<{
    role: { id: string; name: string; code: string };
    permission: { id: string; name: string; description: string | null };
    enabled: boolean;
    capabilities: ReturnType<typeof AccessScopeCapabilityRegistry.getCapabilitiesForPermission>;
    rules: AccessRuleSummary[];
  }> {
    const role = await this.roleService.getRoleById(roleId);
    const permission = await this.permissionService.getPermissionById(permissionId);
    const now = new Date();

    const grants = await this.grantRepository
      .createQueryBuilder('grant')
      .leftJoinAndSelect('grant.accessRules', 'rule')
      .where('grant.roleId = :roleId', { roleId })
      .andWhere('grant.permissionId = :permissionId', { permissionId })
      .andWhere('grant.userId IS NULL')
      .andWhere('grant.isActive = :isActive', { isActive: true })
      .andWhere('(grant.expiresAt IS NULL OR grant.expiresAt > :now)', { now })
      .getMany();

    const enabled = grants.length > 0;
    const allRules: AccessRuleEntity[] = [];
    for (const grant of grants) {
      if (grant.accessRules) {
        for (const rule of grant.accessRules) {
          allRules.push(rule);
        }
      }
    }

    const resolvedRulesMap = await this.ruleAdminService.batchResolveTargetLabels(allRules);
    const rulesList: AccessRuleSummary[] = [];
    for (const rule of allRules) {
      const summary = resolvedRulesMap.get(rule.id);
      if (summary) {
        rulesList.push(summary);
      }
    }

    const capabilities = AccessScopeCapabilityRegistry.getCapabilitiesForPermission(permission.name);

    return {
      role: { id: role.id, name: role.name, code: role.code },
      permission: {
        id: permission.id,
        name: permission.name,
        description: permission.description,
      },
      enabled,
      capabilities,
      rules: rulesList,
    };
  }

  /**
   * Toggles permission enabled state for a role.
   * Checkbox Semantics: ONLY manages PermissionGrant.isActive. Does NOT create ALLOW ALL or any access rules!
   */
  async setRolePermissionState(
    roleId: string,
    permissionId: string,
    enabled: boolean,
    actor: AuthPrincipal
  ): Promise<{ success: boolean; enabled: boolean; message: string }> {
    return await AppDataSource.transaction(async (manager) => {
      const roleRepo = manager.getRepository(RoleEntity);
      const grantRepo = manager.getRepository(PermissionGrantEntity);
      const permRepo = manager.getRepository(PermissionEntity);

      // 1. Pessimistic lock on Target Role row (Serialization Point)
      const role = await roleRepo
        .createQueryBuilder('role')
        .setLock('pessimistic_write')
        .where('role.id = :roleId', { roleId })
        .andWhere('role.deletedAt IS NULL')
        .getOne();

      if (!role) {
        throw new NotFoundError('الدور غير موجود', 'ROLE_NOT_FOUND');
      }

      if (role.code === SystemRole.SYSTEM_ADMIN) {
        throw new BusinessRuleError(
          'صلاحيات مدير النظام الأساسية تُدار تلقائيًا بواسطة النظام',
          'SYSTEM_ADMIN_PERMISSIONS_MANAGED_BY_SYSTEM'
        );
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
        // Ensure active valid grant exists
        const existingActiveGrant = await grantRepo.findOne({
          where: {
            roleId,
            permissionId,
            userId: IsNull(),
            isActive: true,
          },
        });

        if (existingActiveGrant && (existingActiveGrant.expiresAt === null || existingActiveGrant.expiresAt > now)) {
          return {
            success: true,
            enabled: true,
            message: 'الصلاحية مفعلة بالفعل لهذا الدور',
          };
        }

        // Create new active grant with zero rules
        const newGrant = grantRepo.create({
          roleId,
          permissionId,
          userId: null,
          isActive: true,
          expiresAt: null,
          canDelegate: false,
          grantedBy: actor.id,
          grantedAt: now,
          reason: 'تفعيل الصلاحية للدور',
        });
        await grantRepo.save(newGrant);

        return {
          success: true,
          enabled: true,
          message: 'تم تفعيل الصلاحية للدور بنجاح. تذكر إضافة قواعد وصول لتفعيل المنح.',
        };
      } else {
        // Deactivate all active grants for (roleId, permissionId)
        const activeGrants = await grantRepo.find({
          where: {
            roleId,
            permissionId,
            userId: IsNull(),
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
          message: 'تم تعطيل الصلاحية للدور بنجاح',
        };
      }
    });
  }

  /**
   * Adds an access rule to an enabled role permission.
   */
  async createRoleAccessRule(
    roleId: string,
    permissionId: string,
    dto: CreateAccessRuleDto,
    actor: AuthPrincipal
  ): Promise<AccessRuleSummary> {
    return await AppDataSource.transaction(async (manager) => {
      const roleRepo = manager.getRepository(RoleEntity);
      const grantRepo = manager.getRepository(PermissionGrantEntity);
      const permRepo = manager.getRepository(PermissionEntity);
      const ruleRepo = manager.getRepository(AccessRuleEntity);

      // 1. Lock Role row (Serialization Point)
      const role = await roleRepo
        .createQueryBuilder('role')
        .setLock('pessimistic_write')
        .where('role.id = :roleId', { roleId })
        .andWhere('role.deletedAt IS NULL')
        .getOne();

      if (!role) {
        throw new NotFoundError('الدور غير موجود', 'ROLE_NOT_FOUND');
      }

      if (role.code === SystemRole.SYSTEM_ADMIN) {
        throw new BusinessRuleError(
          'صلاحيات مدير النظام الأساسية تُدار تلقائيًا بواسطة النظام',
          'SYSTEM_ADMIN_PERMISSIONS_MANAGED_BY_SYSTEM'
        );
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

      // 5. Select writable active grant deterministically
      const now = new Date();
      const activeGrants = await grantRepo
        .createQueryBuilder('grant')
        .leftJoinAndSelect('grant.accessRules', 'rule')
        .where('grant.roleId = :roleId', { roleId })
        .andWhere('grant.permissionId = :permissionId', { permissionId })
        .andWhere('grant.userId IS NULL')
        .andWhere('grant.isActive = :isActive', { isActive: true })
        .andWhere('(grant.expiresAt IS NULL OR grant.expiresAt > :now)', { now })
        .orderBy('grant.updatedAt', 'DESC')
        .addOrderBy('grant.id', 'ASC')
        .getMany();

      if (activeGrants.length === 0) {
        throw new BusinessRuleError(
          'الصلاحية غير مفعلة لهذا الدور. يرجى تفعيل الصلاحية أولاً قبل إضافة قواعد الوصول.',
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
   * Updates an existing access rule for a role permission.
   */
  async updateRoleAccessRule(
    roleId: string,
    permissionId: string,
    ruleId: string,
    dto: UpdateAccessRuleDto,
    actor: AuthPrincipal
  ): Promise<AccessRuleSummary> {
    return await AppDataSource.transaction(async (manager) => {
      const roleRepo = manager.getRepository(RoleEntity);
      const permRepo = manager.getRepository(PermissionEntity);
      const ruleRepo = manager.getRepository(AccessRuleEntity);

      // 1. Lock Role row (Serialization Point)
      const role = await roleRepo
        .createQueryBuilder('role')
        .setLock('pessimistic_write')
        .where('role.id = :roleId', { roleId })
        .andWhere('role.deletedAt IS NULL')
        .getOne();

      if (!role) {
        throw new NotFoundError('الدور غير موجود', 'ROLE_NOT_FOUND');
      }

      if (role.code === SystemRole.SYSTEM_ADMIN) {
        throw new BusinessRuleError(
          'صلاحيات مدير النظام الأساسية تُدار تلقائيًا بواسطة النظام',
          'SYSTEM_ADMIN_PERMISSIONS_MANAGED_BY_SYSTEM'
        );
      }

      // 2. Validate permission
      const permission = await permRepo.findOne({
        where: { id: permissionId, isActive: true },
      });

      if (!permission) {
        throw new NotFoundError('الصلاحية غير موجودة أو غير نشطة', 'PERMISSION_NOT_FOUND');
      }

      // 3. Load rule and verify strict ownership
      const existingRule = await ruleRepo
        .createQueryBuilder('rule')
        .innerJoinAndSelect('rule.permissionGrant', 'grant')
        .where('rule.id = :ruleId', { ruleId })
        .andWhere('grant.roleId = :roleId', { roleId })
        .andWhere('grant.permissionId = :permissionId', { permissionId })
        .andWhere('grant.userId IS NULL')
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
   * Soft-disables an access rule for a role permission (isActive = false).
   * Invariant: No hard-delete of rule history.
   */
  async deleteRoleAccessRule(
    roleId: string,
    permissionId: string,
    ruleId: string,
    actor: AuthPrincipal
  ): Promise<{ success: boolean; message: string }> {
    return await AppDataSource.transaction(async (manager) => {
      const roleRepo = manager.getRepository(RoleEntity);
      const ruleRepo = manager.getRepository(AccessRuleEntity);

      // 1. Lock Role row (Serialization Point)
      const role = await roleRepo
        .createQueryBuilder('role')
        .setLock('pessimistic_write')
        .where('role.id = :roleId', { roleId })
        .andWhere('role.deletedAt IS NULL')
        .getOne();

      if (!role) {
        throw new NotFoundError('الدور غير موجود', 'ROLE_NOT_FOUND');
      }

      if (role.code === SystemRole.SYSTEM_ADMIN) {
        throw new BusinessRuleError(
          'صلاحيات مدير النظام الأساسية تُدار تلقائيًا بواسطة النظام',
          'SYSTEM_ADMIN_PERMISSIONS_MANAGED_BY_SYSTEM'
        );
      }

      // 2. Load rule and verify strict ownership
      const existingRule = await ruleRepo
        .createQueryBuilder('rule')
        .innerJoin('rule.permissionGrant', 'grant')
        .where('rule.id = :ruleId', { ruleId })
        .andWhere('grant.roleId = :roleId', { roleId })
        .andWhere('grant.permissionId = :permissionId', { permissionId })
        .andWhere('grant.userId IS NULL')
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

export const rolePermissionService = new RolePermissionService();
