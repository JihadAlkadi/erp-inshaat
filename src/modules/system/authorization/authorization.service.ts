import { Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { AccessRuleEntity } from '../access-rule/access-rule.entity.js';
import { AuthPrincipal } from '../auth/auth.types.js';
import { ApplicableAccessRule } from './authorization.types.js';
import { isValidAllScope } from './access-rule-scope.util.js';

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
   * 5. Only evaluates scopeType = 'ALL'.
   * 6. Valid ALL requires scope === null. Malformed ALLOW ALL (scope !== null) grants nothing.
   * 7. Valid and Malformed DENY ALL fail closed and deny access across all sources.
   * 8. Fail closed: requires at least one valid ALLOW ALL rule and zero active DENY ALL rules.
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
      .select(['rule.id', 'rule.effect', 'rule.scope'])
      .getMany();

    if (rules.length === 0) {
      return false;
    }

    let hasValidAllowAll = false;
    let hasEffectiveDenyAll = false;

    for (const rule of rules) {
      const isValidAll = isValidAllScope(rule.scope);
      if (rule.effect === 'DENY') {
        hasEffectiveDenyAll = true;
      } else if (rule.effect === 'ALLOW' && isValidAll) {
        hasValidAllowAll = true;
      }
    }

    return hasValidAllowAll && !hasEffectiveDenyAll;
  }

  /**
   * Retrieves all applicable active access rules for the given permission and principal (both role grants and direct grants).
   * Does NOT filter by scopeType, enabling higher layers to evaluate ALL, scoped, or dynamic access rules.
   */
  async getApplicableAccessRules(
    principal: AuthPrincipal,
    permissionName: string
  ): Promise<ApplicableAccessRule[]> {
    if (!principal || !principal.id || !principal.roleId || !permissionName) {
      return [];
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
      .select([
        'rule.id',
        'rule.permissionGrantId',
        'rule.effect',
        'rule.scopeType',
        'rule.scope',
      ])
      .getMany();

    return rules.map((r) => ({
      ruleId: r.id,
      grantId: r.permissionGrantId,
      effect: r.effect,
      scopeType: r.scopeType,
      scope: r.scope,
      permissionName,
    }));
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
      .addSelect('rule.scope', 'scope')
      .getRawMany<{ permissionName: string; effect: string; scope: unknown }>();

    const permissionMap = new Map<string, { hasAllow: boolean; hasDeny: boolean }>();

    for (const row of rows) {
      const perm = row.permissionName;
      if (!permissionMap.has(perm)) {
        permissionMap.set(perm, { hasAllow: false, hasDeny: false });
      }
      const entry = permissionMap.get(perm)!;
      const isValidAll = isValidAllScope(row.scope);
      if (row.effect === 'DENY') {
        entry.hasDeny = true;
      } else if (row.effect === 'ALLOW' && isValidAll) {
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

