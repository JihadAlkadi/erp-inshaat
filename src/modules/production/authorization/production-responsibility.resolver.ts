import { Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { AuthPrincipal } from '../../system/auth/auth.types.js';
import { ProductionDepartmentEntity } from '../department/production-department.entity.js';
import { ProductionDepartmentEngineerEntity } from '../team/entities/production-department-engineer.entity.js';
import { ProductionResponsibility } from './production-access-policy.types.js';

export class ProductionResponsibilityResolver {
  private readonly departmentRepository: Repository<ProductionDepartmentEntity>;
  private readonly engineerRepository: Repository<ProductionDepartmentEngineerEntity>;

  constructor(
    deptRepo: Repository<ProductionDepartmentEntity> = AppDataSource.getRepository(ProductionDepartmentEntity),
    engRepo: Repository<ProductionDepartmentEngineerEntity> = AppDataSource.getRepository(ProductionDepartmentEngineerEntity)
  ) {
    this.departmentRepository = deptRepo;
    this.engineerRepository = engRepo;
  }

  /**
   * Resolves the current production responsibilities of a user by their user ID directly from the database.
   * Runs exactly 2 targeted queries (Head query + Engineer joined query) without N+1.
   * Fails closed on any corrupted department/yard mappings or soft-deleted relationships.
   */
  async resolveByUserId(userId: string): Promise<ProductionResponsibility> {
    if (!userId) {
      return {
        headDepartmentId: null,
        engineerDepartmentId: null,
        engineerYardIds: [],
        isConsistent: true,
      };
    }

    // 1. Resolve Department Head responsibility (non-deleted department where head_user_id = userId)
    const headDept = await this.departmentRepository.findOne({
      where: { headUserId: userId, deletedAt: IsNull() },
      select: { id: true },
    });

    const headDepartmentId = headDept ? headDept.id : null;

    // 2. Resolve Active Engineer assignment and joined department and yard mappings in a single query
    const engineerAssignment = await this.engineerRepository
      .createQueryBuilder('eng')
      .leftJoinAndSelect('eng.department', 'department')
      .leftJoinAndSelect('eng.yardMappings', 'yardMapping')
      .leftJoinAndSelect('yardMapping.yard', 'yard')
      .where('eng.userId = :userId', { userId })
      .andWhere('eng.isActive = :isActive', { isActive: true })
      .getOne();

    let engineerDepartmentId: string | null = null;
    let engineerYardIds: string[] = [];
    let isConsistent = true;

    if (engineerAssignment) {
      engineerDepartmentId = engineerAssignment.departmentId;
      const yardMappings = engineerAssignment.yardMappings ?? [];

      let hasMappingCorruption = false;

      // Invariant A: Engineer department relation must exist
      if (!engineerAssignment.department) {
        hasMappingCorruption = true;
      }

      // Invariant B: Engineer department must not be soft-deleted
      if (!hasMappingCorruption && engineerAssignment.department.deletedAt !== null) {
        hasMappingCorruption = true;
      }

      // Invariant C: Must have at least one yard mapping (Active engineer with zero yard mappings = corrupted state)
      if (!hasMappingCorruption && yardMappings.length === 0) {
        hasMappingCorruption = true;
      }

      // Invariant D, E, F: Every yard mapping must contain a non-deleted yard belonging to the engineer's department
      if (!hasMappingCorruption) {
        for (const ym of yardMappings) {
          if (
            !ym.yard ||
            ym.yard.deletedAt !== null ||
            ym.yard.departmentId !== engineerAssignment.departmentId
          ) {
            hasMappingCorruption = true;
            break;
          }
        }
      }

      if (hasMappingCorruption) {
        isConsistent = false;
        engineerYardIds = [];
      } else {
        engineerYardIds = Array.from(
          new Set(yardMappings.map((m) => m.yard.id))
        ).sort();
      }
    }

    // 3. Mutual exclusivity invariant validation (Fail-closed on corrupted data)
    if (headDepartmentId !== null && engineerDepartmentId !== null) {
      isConsistent = false;
    }

    return {
      headDepartmentId,
      engineerDepartmentId,
      engineerYardIds,
      isConsistent,
    };
  }

  /**
   * Resolves the current production responsibilities of the authenticated principal directly from the database.
   */
  async resolve(principal: AuthPrincipal): Promise<ProductionResponsibility> {
    return this.resolveByUserId(principal?.id);
  }
}

export const productionResponsibilityResolver = new ProductionResponsibilityResolver();
