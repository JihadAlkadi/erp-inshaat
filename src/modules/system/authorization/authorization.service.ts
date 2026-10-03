import { Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { AccessRuleEntity } from '../access-rule/access-rule.entity.js';
import { AuthPrincipal } from '../auth/auth.types.js';

export class AuthorizationService {
  private readonly accessRuleRepository: Repository<AccessRuleEntity>;

  constructor(
    accessRuleRepo: Repository<AccessRuleEntity> = AppDataSource.getRepository(AccessRuleEntity)
  ) {
    this.accessRuleRepository = accessRuleRepo;
  }

  /**
   * Evaluates if the authenticated principal has effective global access (ALLOW ALL) for the given permission.
   * Rules:
   * 1. Merges grants from user's role (roleId) and direct user grants (userId).
   * 2. Ignores inactive or expired grants.
   * 3. Ignores inactive or soft-deleted permissions.
   * 4. Ignores inactive access rules.
   * 5. Only evaluates scopeType = 'ALL' (non-ALL scopes fail closed in this phase).
   * 6. DENY ALL wins over any ALLOW ALL across all sources.
   * 7. Fail closed: requires at least one active ALLOW ALL rule and zero active DENY ALL rules.
   */
  async hasPermission(
    principal: AuthPrincipal,
    permissionName: string
  ): Promise<boolean> {
    if (!principal || !principal.id || !principal.roleId || !permissionName) {
      return false;
    }

    const now = new Date();

    const rules = await this.accessRuleRepository
      .createQueryBuilder('rule')
      .innerJoin('rule.permissionGrant', 'grant')
      .innerJoin('grant.permission', 'permission')
      .where('permission.name = :permissionName', { permissionName })
      .andWhere('permission.isActive = :isActive', { isActive: true })
      .andWhere('permission.deletedAt IS NULL')
      .andWhere('grant.isActive = :isActive', { isActive: true })
      .andWhere('(grant.expiresAt IS NULL OR grant.expiresAt > :now)', { now })
      .andWhere('(grant.userId = :userId OR grant.roleId = :roleId)', {
        userId: principal.id,
        roleId: principal.roleId,
      })
      .andWhere('rule.isActive = :isActive', { isActive: true })
      .andWhere('rule.scopeType = :scopeType', { scopeType: 'ALL' })
      .select(['rule.id', 'rule.effect'])
      .getMany();

    if (rules.length === 0) {
      return false;
    }

    const hasDenyAll = rules.some((rule) => rule.effect === 'DENY');
    if (hasDenyAll) {
      return false;
    }

    const hasAllowAll = rules.some((rule) => rule.effect === 'ALLOW');
    return hasAllowAll;
  }

  /**
   * Retrieves all permission names for which the authenticated principal possesses effective global access (ALLOW ALL).
   * Single aggregated query without N+1.
   */
  async getEffectivePermissions(principal: AuthPrincipal): Promise<string[]> {
    if (!principal || !principal.id || !principal.roleId) {
      return [];
    }

    const now = new Date();

    const rows = await this.accessRuleRepository
      .createQueryBuilder('rule')
      .innerJoin('rule.permissionGrant', 'grant')
      .innerJoin('grant.permission', 'permission')
      .where('permission.isActive = :isActive', { isActive: true })
      .andWhere('permission.deletedAt IS NULL')
      .andWhere('grant.isActive = :isActive', { isActive: true })
      .andWhere('(grant.expiresAt IS NULL OR grant.expiresAt > :now)', { now })
      .andWhere('(grant.userId = :userId OR grant.roleId = :roleId)', {
        userId: principal.id,
        roleId: principal.roleId,
      })
      .andWhere('rule.isActive = :isActive', { isActive: true })
      .andWhere('rule.scopeType = :scopeType', { scopeType: 'ALL' })
      .select('permission.name', 'permissionName')
      .addSelect('rule.effect', 'effect')
      .getRawMany<{ permissionName: string; effect: string }>();

    const permissionMap = new Map<string, { hasAllow: boolean; hasDeny: boolean }>();

    for (const row of rows) {
      const perm = row.permissionName;
      if (!permissionMap.has(perm)) {
        permissionMap.set(perm, { hasAllow: false, hasDeny: false });
      }
      const entry = permissionMap.get(perm)!;
      if (row.effect === 'DENY') {
        entry.hasDeny = true;
      } else if (row.effect === 'ALLOW') {
        entry.hasAllow = true;
      }
    }

    const effectivePermissions: string[] = [];
    for (const [perm, { hasAllow, hasDeny }] of permissionMap.entries()) {
      if (hasAllow && !hasDeny) {
        effectivePermissions.push(perm);
      }
    }

    return effectivePermissions;
  }
}

export const authorizationService = new AuthorizationService();
