import { Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { AuthPrincipal } from '../../system/auth/auth.types.js';
import { ProductionDepartmentEntity } from '../department/production-department.entity.js';
import { ProductionDepartmentEngineerEntity } from '../team/entities/production-department-engineer.entity.js';
import { ProductionYardEngineerEntity } from '../team/entities/production-yard-engineer.entity.js';
import { ProductionResponsibility } from './production-access-policy.types.js';

export class ProductionResponsibilityResolver {
  private readonly departmentRepository: Repository<ProductionDepartmentEntity>;
  private readonly engineerRepository: Repository<ProductionDepartmentEngineerEntity>;
  private readonly yardEngineerRepository: Repository<ProductionYardEngineerEntity>;

  constructor(
    deptRepo: Repository<ProductionDepartmentEntity> = AppDataSource.getRepository(ProductionDepartmentEntity),
    engRepo: Repository<ProductionDepartmentEngineerEntity> = AppDataSource.getRepository(ProductionDepartmentEngineerEntity),
    yardEngRepo: Repository<ProductionYardEngineerEntity> = AppDataSource.getRepository(ProductionYardEngineerEntity)
  ) {
    this.departmentRepository = deptRepo;
    this.engineerRepository = engRepo;
    this.yardEngineerRepository = yardEngRepo;
  }

  /**
   * Resolves the current production responsibilities of the authenticated principal directly from the database.
   * Runs exactly 2 targeted queries (Head query + Engineer/Yards query) without N+1.
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

    // 2. Resolve Active Engineer assignment and assigned non-deleted yards
    const engineerAssignment = await this.engineerRepository.findOne({
      where: { userId: principal.id, isActive: true },
      select: { id: true, departmentId: true },
    });

    let engineerDepartmentId: string | null = null;
    let engineerYardIds: string[] = [];

    if (engineerAssignment) {
      engineerDepartmentId = engineerAssignment.departmentId;

      const yardMappings = await this.yardEngineerRepository
        .createQueryBuilder('ye')
        .innerJoin('ye.yard', 'yard')
        .where('ye.departmentEngineerId = :assignmentId', { assignmentId: engineerAssignment.id })
        .andWhere('yard.deletedAt IS NULL')
        .select('ye.yardId', 'yardId')
        .getRawMany<{ yardId: string }>();

      engineerYardIds = Array.from(new Set(yardMappings.map((m) => m.yardId))).sort();
    }

    // 3. Mutual exclusivity invariant validation (Fail-closed on corrupted data)
    const isConsistent = !(headDepartmentId !== null && engineerDepartmentId !== null);

    return {
      headDepartmentId,
      engineerDepartmentId,
      engineerYardIds,
      isConsistent,
    };
  }
}

export const productionResponsibilityResolver = new ProductionResponsibilityResolver();
