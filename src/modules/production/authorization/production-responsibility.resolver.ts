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
   * Resolves the current production responsibilities of the authenticated principal directly from the database.
   * Runs exactly 2 targeted queries (Head query + Engineer joined query) without N+1.
   * Fails closed on any corrupted department/yard mappings or soft-deleted relationships.
   */
  async resolve(principal: AuthPrincipal): Promise<ProductionResponsibility> {
    if (!principal || !principal.id) {
      return {
        headDepartmentId: null,
        engineerDepartmentId: null,
        engineerYardIds: [],
        isConsistent: true,
      };
    }

    // 1. Resolve Department Head responsibility (non-deleted department where head_user_id = principal.id)
    const headDept = await this.departmentRepository.findOne({
      where: { headUserId: principal.id, deletedAt: IsNull() },
      select: { id: true },
    });

    const headDepartmentId = headDept ? headDept.id : null;

    // 2. Resolve Active Engineer assignment and joined department and yard mappings in a single query
    const engineerAssignment = await this.engineerRepository
      .createQueryBuilder('eng')
      .leftJoinAndSelect('eng.department', 'department')
      .leftJoinAndSelect('eng.yardMappings', 'yardMapping')
      .leftJoinAndSelect('yardMapping.yard', 'yard')
      .where('eng.userId = :userId', { userId: principal.id })
      .andWhere('eng.isActive = :isActive', { isActive: true })
      .getOne();

    let engineerDepartmentId: string | null = null;
    let engineerYardIds: string[] = [];
    let isConsistent = true;

    if (engineerAssignment) {
      engineerDepartmentId = engineerAssignment.departmentId;

      let hasMappingCorruption = false;

      // Invariant: Engineer department must exist and not be soft-deleted
      if (!engineerAssignment.department || engineerAssignment.department.deletedAt !== null) {
        hasMappingCorruption = true;
      }

      // Invariant: Every yard mapping must exist, be non-deleted, and belong to the engineer's department
      if (!hasMappingCorruption && engineerAssignment.yardMappings) {
        for (const ym of engineerAssignment.yardMappings) {
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
      } else if (engineerAssignment.yardMappings) {
        engineerYardIds = Array.from(
          new Set(engineerAssignment.yardMappings.map((m) => m.yard.id))
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
}

export const productionResponsibilityResolver = new ProductionResponsibilityResolver();
