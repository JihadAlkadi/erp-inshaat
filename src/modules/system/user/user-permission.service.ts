import { IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { UserEntity } from './user.entity.js';
import { PermissionGrantEntity } from '../permission-grant/permission-grant.entity.js';
import { AccessRuleEntity } from '../access-rule/access-rule.entity.js';
import { PermissionService, permissionService } from '../permission/permission.service.js';
import { AuthPrincipal } from '../auth/auth.types.js';
import { UserGlobalPermissionsResponse, UserPermissionState } from './user.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ForbiddenError } from '../../../common/errors/forbidden.error.js';

export class UserPermissionService {
  private readonly userRepository: Repository<UserEntity>;
  private readonly grantRepository: Repository<PermissionGrantEntity>;
  private readonly permissionService: PermissionService;

  constructor(
    userRepo: Repository<UserEntity> = AppDataSource.getRepository(UserEntity),
    grantRepo: Repository<PermissionGrantEntity> = AppDataSource.getRepository(PermissionGrantEntity),
    pService: PermissionService = permissionService
  ) {
    this.userRepository = userRepo;
    this.grantRepository = grantRepo;
    this.permissionService = pService;
  }

  async getUserGlobalPermissionStates(userId: string): Promise<UserGlobalPermissionsResponse> {
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

    const states: UserPermissionState[] = allPermissions.map((perm) => {
      let hasDirectAllowAll = false;
      let hasDirectDenyAll = false;
      let hasRoleAllowAll = false;
      let hasRoleDenyAll = false;

      for (const grant of applicableGrants) {
        if (grant.permissionId !== perm.id) continue;

        const isDirect = grant.userId === user.id && !grant.roleId;
        const isRole = Boolean(user.roleId && grant.roleId === user.roleId && !grant.userId);

        if (grant.accessRules) {
          for (const rule of grant.accessRules) {
            if (rule.isActive && rule.scopeType === 'ALL') {
              if (isDirect) {
                if (rule.effect === 'ALLOW') hasDirectAllowAll = true;
                if (rule.effect === 'DENY') hasDirectDenyAll = true;
              } else if (isRole) {
                if (rule.effect === 'ALLOW') hasRoleAllowAll = true;
                if (rule.effect === 'DENY') hasRoleDenyAll = true;
              }
            }
          }
        }
      }

      const hasAnyAllow = hasDirectAllowAll || hasRoleAllowAll;
      const hasAnyDeny = hasDirectDenyAll || hasRoleDenyAll;
      const effectiveGlobalAccess = hasAnyAllow && !hasAnyDeny;

      return {
        permissionId: perm.id,
        name: perm.name,
        description: perm.description,
        hasDirectAllowAll,
        hasDirectDenyAll,
        hasRoleAllowAll,
        hasRoleDenyAll,
        effectiveGlobalAccess,
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
      permissions: states,
    };
  }

  async setUserGlobalPermissions(
    userId: string,
    desiredPermissionIds: string[],
    actor: AuthPrincipal
  ): Promise<{ success: boolean; message: string }> {
    // 1. Self Protection Check
    if (actor.id === userId) {
      throw new ForbiddenError(
        'لا يمكنك تعديل صلاحيات حسابك المباشرة بنفسك',
        'CANNOT_MANAGE_OWN_PERMISSIONS'
      );
    }

    return await AppDataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const grantRepo = manager.getRepository(PermissionGrantEntity);
      const ruleRepo = manager.getRepository(AccessRuleEntity);

      // 2. Lock Target User row with pessimistic_write
      const targetUser = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .andWhere('user.deletedAt IS NULL')
        .getOne();

      if (!targetUser) {
        throw new NotFoundError('المستخدم غير موجود', 'USER_NOT_FOUND');
      }

      // 3. Validate desired permissions exist and are active
      const allPermissions = await this.permissionService.listActivePermissions(manager);
      const activePermMap = new Map(allPermissions.map((p) => [p.id, p]));

      for (const desiredId of desiredPermissionIds) {
        if (!activePermMap.has(desiredId)) {
          throw new NotFoundError('إحدى الصلاحيات المحددة غير موجودة أو غير نشطة', 'PERMISSION_NOT_FOUND');
        }
      }

      const desiredSet = new Set(desiredPermissionIds);
      const now = new Date();

      // 4. Load all Direct Grants for this user
      const existingGrants = await grantRepo.find({
        where: { userId: targetUser.id, roleId: IsNull() },
        relations: { accessRules: true },
      });

      for (const perm of allPermissions) {
        const isDesired = desiredSet.has(perm.id);
        const permGrants = existingGrants.filter((g) => g.permissionId === perm.id);

        if (isDesired) {
          // Enable Direct ALLOW ALL
          let targetGrant = permGrants.find(
            (g) => g.isActive && (g.expiresAt === null || g.expiresAt > now)
          );

          if (!targetGrant) {
            targetGrant = permGrants.find(
              (g) => !g.isActive || (g.expiresAt !== null && g.expiresAt <= now)
            );
          }

          if (!targetGrant) {
            targetGrant = grantRepo.create({
              userId: targetUser.id,
              roleId: null,
              permissionId: perm.id,
              isActive: true,
              expiresAt: null,
              canDelegate: false,
              grantedBy: actor.id,
              grantedAt: now,
              reason: 'إسناد صلاحية مباشرة شاملة للمستخدم',
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
          // Disable Direct ALLOW ALL on ALL matching direct grants for this user & permission
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

      return {
        success: true,
        message: 'تم حفظ الصلاحيات المباشرة للمستخدم بنجاح',
      };
    });
  }
}

export const userPermissionService = new UserPermissionService();
