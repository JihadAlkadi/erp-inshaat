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
   * Protects against data leakage when target user's department is outside the actor's scope.
   */
  async getUserResponsibility(
    targetUserId: string,
    viewPolicy: ResolvedProductionAccessPolicy,
    managePolicy: ResolvedProductionAccessPolicy
  ): Promise<UserProductionResponsibilityOutput> {
    // 1. If actor has no production assignment view access at all, return NOT_VISIBLE immediately
    if (!viewPolicy.hasAnyAccess) {
      return {
        state: 'NOT_VISIBLE',
        isConsistent: true,
        canManageTeam: false,
      };
    }

    // 2. Resolve target user's raw operational responsibility
    const responsibility = await this.responsibilityResolver.resolveByUserId(targetUserId);

    // 3. Handle inconsistent operational state
    if (!responsibility.isConsistent) {
      const deptId = responsibility.headDepartmentId || responsibility.engineerDepartmentId;
      const isActorAuthorized =
        viewPolicy.allowAll ||
        (deptId !== null && canAccessDepartment(viewPolicy, deptId));

      if (isActorAuthorized) {
        return {
          state: 'INCONSISTENT',
          isConsistent: false,
          canManageTeam: false,
        };
      } else {
        return {
          state: 'NOT_VISIBLE',
          isConsistent: false,
          canManageTeam: false,
        };
      }
    }

    // 4. Handle Case: No responsibility assigned
    if (!responsibility.headDepartmentId && !responsibility.engineerDepartmentId) {
      if (viewPolicy.allowAll) {
        return {
          state: 'NONE',
          isConsistent: true,
          canManageTeam: false,
        };
      } else {
        // Scoped viewer: do not reveal distinction between 'none' and 'out of scope'
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

      const dept = await this.departmentRepository.findOne({
        where: { id: targetDeptId, deletedAt: IsNull() },
        select: { id: true, name: true, code: true, isActive: true },
      });

      if (!dept) {
        return {
          state: 'NOT_VISIBLE',
          isConsistent: true,
          canManageTeam: false,
        };
      }

      const canManageTeam =
        managePolicy.hasAnyAccess && canAccessDepartment(managePolicy, dept.id);

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

      const engAssignment = await this.engineerRepository
        .createQueryBuilder('eng')
        .leftJoinAndSelect('eng.department', 'dept')
        .leftJoinAndSelect('eng.yardMappings', 'ym')
        .leftJoinAndSelect('ym.yard', 'yard')
        .where('eng.userId = :userId', { userId: targetUserId })
        .andWhere('eng.isActive = :isActive', { isActive: true })
        .getOne();

      if (!engAssignment || !engAssignment.department || engAssignment.department.deletedAt !== null) {
        return {
          state: 'NOT_VISIBLE',
          isConsistent: true,
          canManageTeam: false,
        };
      }

      const yards = (engAssignment.yardMappings || [])
        .filter((ym) => ym.yard && ym.yard.deletedAt === null)
        .map((ym) => ({
          id: ym.yard.id,
          name: ym.yard.name,
          code: ym.yard.code,
          isActive: ym.yard.isActive,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

      const canManageTeam =
        managePolicy.hasAnyAccess && canAccessDepartment(managePolicy, engAssignment.department.id);

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
