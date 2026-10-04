import { Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionDepartmentEntity } from '../department/production-department.entity.js';
import { ProductionDepartmentEngineerEntity } from './entities/production-department-engineer.entity.js';
import {
  ProductionResponsibilityResolver,
  productionResponsibilityResolver,
} from '../authorization/production-responsibility.resolver.js';
import { ResolvedProductionAccessPolicy } from '../authorization/production-access-policy.types.js';
import { canAccessDepartment } from '../authorization/production-access-query.helper.js';

export type UserProductionResponsibilityState =
  | 'VISIBLE'
  | 'NONE'
  | 'NOT_VISIBLE'
  | 'INCONSISTENT';

export type UserProductionResponsibilityKind = 'HEAD' | 'ENGINEER';

export interface UserProductionResponsibilityOutput {
  state: UserProductionResponsibilityState;
  kind?: UserProductionResponsibilityKind;
  department?: {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
  };
  assignmentId?: string;
  yards?: Array<{
    id: string;
    name: string;
    code: string;
    isActive: boolean;
  }>;
  isConsistent: boolean;
  canManageTeam: boolean;
}

/**
 * Pure evaluation helper: checks if the policy grants unrestricted, global department visibility.
 * Returns true only when allowAll is true and there are zero specific DENY department rules.
 */
export function hasUnrestrictedDepartmentVisibility(
  policy: ResolvedProductionAccessPolicy
): boolean {
  return !policy.denyAll && policy.allowAll && policy.denyDepartmentIds.length === 0;
}

/**
 * Pure evaluation helper: checks if all provided department IDs are accessible by the actor's policy.
 */
export function allDepartmentsAccessible(
  policy: ResolvedProductionAccessPolicy,
  departmentIds: string[]
): boolean {
  return departmentIds.every((id) => canAccessDepartment(policy, id));
}

export class ProductionUserResponsibilityReadService {
  private readonly departmentRepository: Repository<ProductionDepartmentEntity>;
  private readonly engineerRepository: Repository<ProductionDepartmentEngineerEntity>;
  private readonly responsibilityResolver: ProductionResponsibilityResolver;

  constructor(
    deptRepo: Repository<ProductionDepartmentEntity> = AppDataSource.getRepository(ProductionDepartmentEntity),
    engRepo: Repository<ProductionDepartmentEngineerEntity> = AppDataSource.getRepository(ProductionDepartmentEngineerEntity),
    resolver: ProductionResponsibilityResolver = productionResponsibilityResolver
  ) {
    this.departmentRepository = deptRepo;
    this.engineerRepository = engRepo;
    this.responsibilityResolver = resolver;
  }

  /**
   * Retrieves the current production responsibility for a target user in a secure, authorization-aware manner.
   * Protects against data leakage, enforces TOCTOU revalidation, respects DENY rules, and fails closed on corrupted states.
   */
  async getUserResponsibility(
    targetUserId: string,
    viewPolicy: ResolvedProductionAccessPolicy,
    managePolicy: ResolvedProductionAccessPolicy
  ): Promise<UserProductionResponsibilityOutput> {
    // 1. If actor has no production assignment view access at all, return NOT_VISIBLE immediately
    if (!viewPolicy.hasAnyAccess || viewPolicy.denyAll) {
      return {
        state: 'NOT_VISIBLE',
        isConsistent: true,
        canManageTeam: false,
      };
    }

    // 2. Resolve target user's initial operational responsibility
    const responsibility = await this.responsibilityResolver.resolveByUserId(targetUserId);

    // 3. Handle inconsistent operational state from resolver
    if (!responsibility.isConsistent) {
      const knownDeptIds = Array.from(
        new Set(
          [responsibility.headDepartmentId, responsibility.engineerDepartmentId].filter(
            (id): id is string => Boolean(id)
          )
        )
      );

      if (knownDeptIds.length === 0) {
        // Zero known departments: only expose INCONSISTENT if actor has unrestricted visibility
        if (hasUnrestrictedDepartmentVisibility(viewPolicy)) {
          return {
            state: 'INCONSISTENT',
            isConsistent: false,
            canManageTeam: false,
          };
        }
        return {
          state: 'NOT_VISIBLE',
          isConsistent: false,
          canManageTeam: false,
        };
      }

      // If multiple or single departments are known, ALL must be within actor's view scope
      if (allDepartmentsAccessible(viewPolicy, knownDeptIds)) {
        return {
          state: 'INCONSISTENT',
          isConsistent: false,
          canManageTeam: false,
        };
      }

      // At least one involved department is out of scope -> Fail Closed (prevent partial diagnostic leak)
      return {
        state: 'NOT_VISIBLE',
        isConsistent: false,
        canManageTeam: false,
      };
    }

    // 4. Handle Case: No responsibility assigned
    if (!responsibility.headDepartmentId && !responsibility.engineerDepartmentId) {
      if (hasUnrestrictedDepartmentVisibility(viewPolicy)) {
        return {
          state: 'NONE',
          isConsistent: true,
          canManageTeam: false,
        };
      } else {
        // Scoped viewer or viewer with DENY: do not reveal distinction between 'none' and 'out of scope'
        return {
          state: 'NOT_VISIBLE',
          isConsistent: true,
          canManageTeam: false,
        };
      }
    }

    // 5. Handle Case: Department Head
    if (responsibility.headDepartmentId) {
      const targetDeptId = responsibility.headDepartmentId;
      if (!canAccessDepartment(viewPolicy, targetDeptId)) {
        return {
          state: 'NOT_VISIBLE',
          isConsistent: true,
          canManageTeam: false,
        };
      }

      // TOCTOU Revalidation: Department must exist, not deleted, and headUserId must still be targetUserId
      const dept = await this.departmentRepository.findOne({
        where: { id: targetDeptId, headUserId: targetUserId, deletedAt: IsNull() },
        select: { id: true, name: true, code: true, isActive: true },
      });

      if (!dept || !canAccessDepartment(viewPolicy, dept.id)) {
        return {
          state: 'NOT_VISIBLE',
          isConsistent: true,
          canManageTeam: false,
        };
      }

      const canManageTeam =
        Boolean(managePolicy.hasAnyAccess) && canAccessDepartment(managePolicy, dept.id);

      return {
        state: 'VISIBLE',
        kind: 'HEAD',
        department: {
          id: dept.id,
          name: dept.name,
          code: dept.code,
          isActive: dept.isActive,
        },
        isConsistent: true,
        canManageTeam,
      };
    }

    // 6. Handle Case: Engineer
    if (responsibility.engineerDepartmentId) {
      const targetDeptId = responsibility.engineerDepartmentId;
      if (!canAccessDepartment(viewPolicy, targetDeptId)) {
        return {
          state: 'NOT_VISIBLE',
          isConsistent: true,
          canManageTeam: false,
        };
      }

      // TOCTOU Revalidation: Bound second query to targetUserId, isActive=true, and departmentId=targetDeptId
      const engAssignment = await this.engineerRepository
        .createQueryBuilder('eng')
        .leftJoinAndSelect('eng.department', 'dept')
        .leftJoinAndSelect('eng.yardMappings', 'ym')
        .leftJoinAndSelect('ym.yard', 'yard')
        .where('eng.userId = :userId', { userId: targetUserId })
        .andWhere('eng.isActive = :isActive', { isActive: true })
        .andWhere('eng.departmentId = :departmentId', { departmentId: targetDeptId })
        .getOne();

      if (
        !engAssignment ||
        !engAssignment.department ||
        engAssignment.department.id !== targetDeptId ||
        engAssignment.department.deletedAt !== null
      ) {
        return {
          state: 'NOT_VISIBLE',
          isConsistent: true,
          canManageTeam: false,
        };
      }

      // Re-verify department authorization on locked assignment
      if (!canAccessDepartment(viewPolicy, engAssignment.department.id)) {
        return {
          state: 'NOT_VISIBLE',
          isConsistent: true,
          canManageTeam: false,
        };
      }

      const yardMappings = engAssignment.yardMappings ?? [];

      // Invariant: Active engineer must have at least 1 valid yard mapping
      if (yardMappings.length === 0) {
        return {
          state: 'INCONSISTENT',
          isConsistent: false,
          canManageTeam: false,
        };
      }

      // Invariant: Revalidate all yard mappings without silent filtering
      let hasCorruptedMapping = false;
      let hasCrossDeptMapping = false;
      const crossDeptIds: string[] = [];

      for (const ym of yardMappings) {
        if (!ym.yard || ym.yard.deletedAt !== null) {
          hasCorruptedMapping = true;
          break;
        }

        if (ym.yard.departmentId !== targetDeptId) {
          hasCorruptedMapping = true;
          hasCrossDeptMapping = true;
          crossDeptIds.push(ym.yard.departmentId);
        }
      }

      if (hasCrossDeptMapping) {
        // Multi-department corruption: only expose INCONSISTENT if actor can access all involved departments
        const allInvolved = Array.from(new Set([targetDeptId, ...crossDeptIds]));
        if (allDepartmentsAccessible(viewPolicy, allInvolved)) {
          return {
            state: 'INCONSISTENT',
            isConsistent: false,
            canManageTeam: false,
          };
        }
        return {
          state: 'NOT_VISIBLE',
          isConsistent: false,
          canManageTeam: false,
        };
      }

      if (hasCorruptedMapping) {
        // Missing or soft-deleted yard within target department
        return {
          state: 'INCONSISTENT',
          isConsistent: false,
          canManageTeam: false,
        };
      }

      // All mappings are valid: deduplicate by Yard ID and sort by name
      const uniqueYardsMap = new Map<
        string,
        { id: string; name: string; code: string; isActive: boolean }
      >();

      for (const ym of yardMappings) {
        if (!uniqueYardsMap.has(ym.yard.id)) {
          uniqueYardsMap.set(ym.yard.id, {
            id: ym.yard.id,
            name: ym.yard.name,
            code: ym.yard.code,
            isActive: ym.yard.isActive,
          });
        }
      }

      const yards = Array.from(uniqueYardsMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name, 'ar')
      );

      const canManageTeam =
        Boolean(managePolicy.hasAnyAccess) &&
        canAccessDepartment(managePolicy, engAssignment.department.id);

      return {
        state: 'VISIBLE',
        kind: 'ENGINEER',
        department: {
          id: engAssignment.department.id,
          name: engAssignment.department.name,
          code: engAssignment.department.code,
          isActive: engAssignment.department.isActive,
        },
        assignmentId: engAssignment.id,
        yards,
        isConsistent: true,
        canManageTeam,
      };
    }

    return {
      state: 'NOT_VISIBLE',
      isConsistent: true,
      canManageTeam: false,
    };
  }
}

export const productionUserResponsibilityReadService =
  new ProductionUserResponsibilityReadService();
