import { IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { RoleEntity } from './role.entity.js';
import { PermissionGrantEntity } from '../permission-grant/permission-grant.entity.js';
import { AccessRuleEntity } from '../access-rule/access-rule.entity.js';
import { PermissionService, permissionService } from '../permission/permission.service.js';
import { RoleService, roleService } from './role.service.js';
import { SystemRole } from './constants/system-role.enum.js';
import { AuthPrincipal } from '../auth/auth.types.js';
import { RoleGlobalPermissionsResponse, RolePermissionState } from './role.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class RolePermissionService {
  private readonly roleRepository: Repository<RoleEntity>;
  private readonly grantRepository: Repository<PermissionGrantEntity>;
  private readonly ruleRepository: Repository<AccessRuleEntity>;
  private readonly roleService: RoleService;
  private readonly permissionService: PermissionService;

  constructor(
    roleRepo: Repository<RoleEntity> = AppDataSource.getRepository(RoleEntity),
    grantRepo: Repository<PermissionGrantEntity> = AppDataSource.getRepository(PermissionGrantEntity),
    ruleRepo: Repository<AccessRuleEntity> = AppDataSource.getRepository(AccessRuleEntity),
    rService: RoleService = roleService,
    pService: PermissionService = permissionService
  ) {
    this.roleRepository = roleRepo;
    this.grantRepository = grantRepo;
    this.ruleRepository = ruleRepo;
    this.roleService = rService;
    this.permissionService = pService;
  }

  async getRoleGlobalPermissionStates(roleId: string): Promise<RoleGlobalPermissionsResponse> {
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

    const states: RolePermissionState[] = allPermissions.map((perm) => {
      const matchingGrants = activeValidGrants.filter((g) => g.permissionId === perm.id);

      let hasAllowAll = false;
      let hasDenyAll = false;

      for (const grant of matchingGrants) {
        if (grant.accessRules) {
          for (const rule of grant.accessRules) {
            if (rule.isActive && rule.scopeType === 'ALL') {
              if (rule.effect === 'ALLOW') {
                hasAllowAll = true;
              } else if (rule.effect === 'DENY') {
                hasDenyAll = true;
              }
            }
          }
        }
      }

      return {
        permissionId: perm.id,
        name: perm.name,
        description: perm.description,
        hasAllowAll,
        hasDenyAll,
        effectiveGlobalAccess: hasAllowAll && !hasDenyAll,
      };
    });

    return {
      role,
      permissions: states,
      isSystemAdmin,
    };
  }

  async setRoleGlobalPermissions(
    roleId: string,
    desiredPermissionIds: string[],
    actor: AuthPrincipal
  ): Promise<{ success: boolean; message: string }> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, deletedAt: IsNull() },
    });

    if (!role) {
      throw new NotFoundError('الدور غير موجود', 'ROLE_NOT_FOUND');
    }

    if (role.code === SystemRole.SYSTEM_ADMIN) {
      throw new BusinessRuleError(
        'صلاحيات مدير النظام الأساسية تُدار تلقائيًا بواسطة النظام',
        'SYSTEM_ADMIN_PERMISSIONS_MANAGED_BY_SYSTEM'
      );
    }

    const allPermissions = await this.permissionService.listActivePermissions();
    const activePermMap = new Map(allPermissions.map((p) => [p.id, p]));

    for (const desiredId of desiredPermissionIds) {
      if (!activePermMap.has(desiredId)) {
        throw new NotFoundError('إحدى الصلاحيات المحددة غير موجودة أو غير نشطة', 'PERMISSION_NOT_FOUND');
      }
    }

    const desiredSet = new Set(desiredPermissionIds);

    await AppDataSource.transaction(async (manager) => {
      const grantRepo = manager.getRepository(PermissionGrantEntity);
      const ruleRepo = manager.getRepository(AccessRuleEntity);

      const existingGrants = await grantRepo.find({
        where: { roleId, userId: IsNull() },
        relations: { accessRules: true },
      });

      for (const perm of allPermissions) {
        const isDesired = desiredSet.has(perm.id);
        const permGrants = existingGrants.filter((g) => g.permissionId === perm.id);

        if (isDesired) {
          // 1. Enable Global ALLOW ALL
          let targetGrant = permGrants.find((g) => g.isActive && (g.expiresAt === null || g.expiresAt > new Date()));

          if (!targetGrant) {
            targetGrant = permGrants.find((g) => !g.isActive || (g.expiresAt !== null && g.expiresAt <= new Date()));
          }

          if (!targetGrant) {
            targetGrant = grantRepo.create({
              roleId,
              permissionId: perm.id,
              userId: null,
              isActive: true,
              expiresAt: null,
              canDelegate: false,
              grantedBy: actor.id,
              grantedAt: new Date(),
              reason: 'إسناد صلاحية شاملة للدور',
            });
            targetGrant = await grantRepo.save(targetGrant);
          } else {
            let grantNeedsUpdate = false;
            if (!targetGrant.isActive) {
              targetGrant.isActive = true;
              grantNeedsUpdate = true;
            }
            if (targetGrant.expiresAt !== null) {
              targetGrant.expiresAt = null;
              grantNeedsUpdate = true;
            }
            if (grantNeedsUpdate) {
              targetGrant = await grantRepo.save(targetGrant);
            }
          }

          // Ensure active ALLOW ALL AccessRule on targetGrant
          const existingRules = targetGrant.accessRules ?? [];
          const allowAllRule = existingRules.find(
            (r) => r.effect === 'ALLOW' && r.scopeType === 'ALL'
          );

          if (allowAllRule) {
            if (!allowAllRule.isActive || allowAllRule.scope !== null) {
              allowAllRule.isActive = true;
              allowAllRule.scope = null;
              await ruleRepo.save(allowAllRule);
            }
          } else {
            const newRule = ruleRepo.create({
              permissionGrantId: targetGrant.id,
              effect: 'ALLOW',
              scopeType: 'ALL',
              scope: null,
              isActive: true,
            });
            await ruleRepo.save(newRule);
          }
        } else {
          // 2. Disable Global ALLOW ALL (on all matching grants)
          for (const grant of permGrants) {
            const rules = grant.accessRules ?? [];
            for (const rule of rules) {
              if (rule.isActive && rule.effect === 'ALLOW' && rule.scopeType === 'ALL') {
                rule.isActive = false;
                await ruleRepo.save(rule);
              }
            }
          }
        }
      }
    });

    return {
      success: true,
      message: 'تم تحديث صلاحيات الدور بنجاح',
    };
  }
}

export const rolePermissionService = new RolePermissionService();
