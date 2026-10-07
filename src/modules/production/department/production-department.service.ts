import { EntityManager, IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionDepartmentEntity } from './production-department.entity.js';
import { ProductionYardEntity } from '../yard/production-yard.entity.js';
import { ProductionDepartmentEngineerEntity } from '../team/entities/production-department-engineer.entity.js';
import { CreateProductionDepartmentDto } from './dto/create-production-department.dto.js';
import { UpdateProductionDepartmentDto } from './dto/update-production-department.dto.js';
import { ListProductionDepartmentsQueryDto } from './dto/list-production-departments-query.dto.js';
import {
  PaginatedProductionDepartmentsResult,
  SafeProductionDepartmentOutput,
} from './production-department.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';
import { assertUserAvailableAsDepartmentHead } from '../team/production-team.service.js';
import { ResolvedProductionAccessPolicy } from '../authorization/production-access-policy.types.js';
import {
  applyDepartmentAccessScope,
  canAccessDepartment,
} from '../authorization/production-access-query.helper.js';

export class ProductionDepartmentService {
  private readonly departmentRepository: Repository<ProductionDepartmentEntity>;
  private readonly yardRepository: Repository<ProductionYardEntity>;

  constructor(
    deptRepo: Repository<ProductionDepartmentEntity> = AppDataSource.getRepository(ProductionDepartmentEntity),
    yardRepo: Repository<ProductionYardEntity> = AppDataSource.getRepository(ProductionYardEntity)
  ) {
    this.departmentRepository = deptRepo;
    this.yardRepository = yardRepo;
  }

  async listDepartments(
    query: ListProductionDepartmentsQueryDto,
    policy: ResolvedProductionAccessPolicy
  ): Promise<PaginatedProductionDepartmentsResult> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const qb = this.departmentRepository
      .createQueryBuilder('dept')
      .leftJoinAndSelect('dept.headUser', 'headUser')
      .where('dept.deletedAt IS NULL');

    // Apply row-level access scope before pagination & counting
    applyDepartmentAccessScope(qb, policy, 'dept');

    if (query.search && query.search.trim() !== '') {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(dept.name LIKE :term OR dept.code LIKE :term)', { term });
    }

    qb.orderBy('dept.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [departments, total] = await qb.getManyAndCount();

    if (departments.length === 0) {
      return {
        items: [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    }

    const deptIds = departments.map((d) => d.id);

    // Aggregate yard counts in single query without N+1
    const countsRaw = await this.yardRepository
      .createQueryBuilder('yard')
      .select('yard.departmentId', 'departmentId')
      .addSelect('COUNT(yard.id)', 'totalCount')
      .addSelect(
        'SUM(CASE WHEN yard.isActive = :isActive AND yard.deletedAt IS NULL THEN 1 ELSE 0 END)',
        'activeCount'
      )
      .where('yard.departmentId IN (:...deptIds)', { deptIds })
      .andWhere('yard.deletedAt IS NULL')
      .setParameter('isActive', true)
      .groupBy('yard.departmentId')
      .getRawMany<{ departmentId: string; totalCount: string | number; activeCount: string | number }>();

    const countMap = new Map<string, { total: number; active: number }>();
    for (const row of countsRaw) {
      countMap.set(row.departmentId, {
        total: Number(row.totalCount) || 0,
        active: Number(row.activeCount) || 0,
      });
    }

    const items: SafeProductionDepartmentOutput[] = departments.map((dept) => {
      const counts = countMap.get(dept.id) || { total: 0, active: 0 };
      return {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        description: dept.description,
        isActive: dept.isActive,
        headUserId: dept.headUserId,
        headUserName: dept.headUser?.fullName || null,
        yardCount: counts.total,
        activeYardCount: counts.active,
        createdAt: dept.createdAt,
        updatedAt: dept.updatedAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getDepartmentById(
    id: string,
    policy: ResolvedProductionAccessPolicy
  ): Promise<SafeProductionDepartmentOutput> {
    const qb = this.departmentRepository
      .createQueryBuilder('dept')
      .leftJoinAndSelect('dept.headUser', 'headUser')
      .where('dept.id = :id', { id })
      .andWhere('dept.deletedAt IS NULL');

    applyDepartmentAccessScope(qb, policy, 'dept');

    const dept = await qb.getOne();

    if (!dept) {
      throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
    }

    const yardCounts = await this.yardRepository
      .createQueryBuilder('yard')
      .select('COUNT(yard.id)', 'totalCount')
      .addSelect(
        'SUM(CASE WHEN yard.isActive = :isActive AND yard.deletedAt IS NULL THEN 1 ELSE 0 END)',
        'activeCount'
      )
      .where('yard.departmentId = :id', { id: dept.id })
      .andWhere('yard.deletedAt IS NULL')
      .setParameter('isActive', true)
      .getRawOne<{ totalCount: string | number; activeCount: string | number }>();

    return {
      id: dept.id,
      name: dept.name,
      code: dept.code,
      description: dept.description,
      isActive: dept.isActive,
      headUserId: dept.headUserId,
      headUserName: dept.headUser?.fullName || null,
      yardCount: Number(yardCounts?.totalCount) || 0,
      activeYardCount: Number(yardCounts?.activeCount) || 0,
      createdAt: dept.createdAt,
      updatedAt: dept.updatedAt,
    };
  }

  async createDepartment(dto: CreateProductionDepartmentDto): Promise<SafeProductionDepartmentOutput> {
    const normalizedCode = dto.code.trim().toUpperCase();

    return await AppDataSource.transaction(async (manager) => {
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);

      // 1. Check code uniqueness including soft-deleted departments
      const existingCode = await deptRepo
        .createQueryBuilder('dept')
        .withDeleted()
        .where('dept.code = :code', { code: normalizedCode })
        .getOne();

      if (existingCode) {
        throw new ConflictError(
          'رمز قسم الإنتاج مستخدم مسبقاً',
          'PRODUCTION_DEPARTMENT_CODE_ALREADY_EXISTS'
        );
      }

      // 2. Lock & Validate Head User using shared helper (Protocol step: lock user row)
      const headUser = await assertUserAvailableAsDepartmentHead(manager, dto.headUserId);

      try {
        const department = deptRepo.create({
          name: dto.name.trim(),
          code: normalizedCode,
          description: dto.description ?? null,
          isActive: dto.isActive ?? true,
          headUserId: headUser.id,
        });

        const saved = await deptRepo.save(department);

        return {
          id: saved.id,
          name: saved.name,
          code: saved.code,
          description: saved.description,
          isActive: saved.isActive,
          headUserId: saved.headUserId,
          headUserName: headUser.fullName,
          yardCount: 0,
          activeYardCount: 0,
          createdAt: saved.createdAt,
          updatedAt: saved.updatedAt,
        };
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          ((err as { code: string }).code === 'ER_DUP_ENTRY' ||
            ('errno' in err && (err as { errno: number }).errno === 1062))
        ) {
          const errMsg = 'message' in err && typeof (err as { message: string }).message === 'string'
            ? (err as { message: string }).message
            : '';
          if (errMsg.includes('UQ_production_department_head_user') || errMsg.includes('head_user_id')) {
            throw new ConflictError(
              'المستخدم المحدد هو رئيس قسم إنتاج آخر ولا يمكن تعيينه رئيساً لأكثر من قسم',
              'PRODUCTION_USER_ALREADY_DEPARTMENT_HEAD'
            );
          }
          throw new ConflictError(
            'رمز قسم الإنتاج مستخدم مسبقاً',
            'PRODUCTION_DEPARTMENT_CODE_ALREADY_EXISTS'
          );
        }
        throw err;
      }
    });
  }

  async updateDepartment(
    id: string,
    dto: UpdateProductionDepartmentDto,
    policy: ResolvedProductionAccessPolicy
  ): Promise<SafeProductionDepartmentOutput> {
    return await AppDataSource.transaction(async (manager) => {
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);
      const yardRepo = manager.getRepository(ProductionYardEntity);

      // Lock Department row for serialized lifecycle & yard assignment
      const department = await deptRepo
        .createQueryBuilder('dept')
        .setLock('pessimistic_write')
        .where('dept.id = :id', { id })
        .andWhere('dept.deletedAt IS NULL')
        .getOne();

      if (!department) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      // Enforce row-level authorization on locked department before mutation
      if (!canAccessDepartment(policy, department.id)) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      // Check deactivation rule: Cannot deactivate department if it has active yards
      if (dto.isActive === false && department.isActive === true) {
        const activeYardsCount = await yardRepo.count({
          where: {
            departmentId: department.id,
            isActive: true,
            deletedAt: IsNull(),
          },
        });

        if (activeYardsCount > 0) {
          throw new BusinessRuleError(
            'لا يمكن تعطيل القسم قبل تعطيل ساحاته النشطة',
            'PRODUCTION_DEPARTMENT_HAS_ACTIVE_YARDS'
          );
        }
      }

      if (dto.name !== undefined) {
        department.name = dto.name.trim();
      }

      if (dto.description !== undefined) {
        department.description = dto.description;
      }

      if (dto.isActive !== undefined) {
        department.isActive = dto.isActive;
      }

      const updated = await deptRepo.save(department);

      const yardCounts = await yardRepo
        .createQueryBuilder('yard')
        .select('COUNT(yard.id)', 'totalCount')
        .addSelect(
          'SUM(CASE WHEN yard.isActive = :isActive AND yard.deletedAt IS NULL THEN 1 ELSE 0 END)',
          'activeCount'
        )
        .where('yard.departmentId = :id', { id: updated.id })
        .andWhere('yard.deletedAt IS NULL')
        .setParameter('isActive', true)
        .getRawOne<{ totalCount: string | number; activeCount: string | number }>();

      return {
        id: updated.id,
        name: updated.name,
        code: updated.code,
        description: updated.description,
        isActive: updated.isActive,
        yardCount: Number(yardCounts?.totalCount) || 0,
        activeYardCount: Number(yardCounts?.activeCount) || 0,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    });
  }

  async softDeleteDepartment(
    id: string,
    policy: ResolvedProductionAccessPolicy
  ): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);
      const yardRepo = manager.getRepository(ProductionYardEntity);

      // Lock Department row for serialized lifecycle
      const department = await deptRepo
        .createQueryBuilder('dept')
        .setLock('pessimistic_write')
        .where('dept.id = :id', { id })
        .andWhere('dept.deletedAt IS NULL')
        .getOne();

      if (!department) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      // Enforce row-level authorization on locked department before mutation
      if (!canAccessDepartment(policy, department.id)) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      // Check soft-delete rule: Cannot delete department if it has ANY non-deleted yards
      const totalYardsCount = await yardRepo.count({
        where: {
          departmentId: department.id,
          deletedAt: IsNull(),
        },
      });

      if (totalYardsCount > 0) {
        throw new BusinessRuleError(
          'لا يمكن أرشفة القسم قبل أرشفة جميع ساحاته',
          'PRODUCTION_DEPARTMENT_HAS_YARDS'
        );
      }

      // Check active engineers rule: Cannot delete department if it has active engineers
      const engRepo = manager.getRepository(ProductionDepartmentEngineerEntity);
      const activeEngineersCount = await engRepo.count({
        where: {
          departmentId: department.id,
          isActive: true,
        },
      });

      if (activeEngineersCount > 0) {
        throw new BusinessRuleError(
          'لا يمكن أرشفة القسم قبل إزالة تعيينات المهندسين منه',
          'PRODUCTION_DEPARTMENT_HAS_ENGINEERS'
        );
      }

      department.headUserId = null;
      department.deletedAt = new Date();
      department.isActive = false;
      await deptRepo.save(department);
    });
  }

  async findActiveDepartmentById(id: string, manager?: EntityManager): Promise<ProductionDepartmentEntity> {
    const repo = manager
      ? manager.getRepository(ProductionDepartmentEntity)
      : this.departmentRepository;

    const dept = await repo.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!dept) {
      throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
    }

    if (!dept.isActive) {
      throw new BusinessRuleError(
        'قسم الإنتاج معطل ولا يمكن استخدامه',
        'PRODUCTION_DEPARTMENT_INACTIVE'
      );
    }

    return dept;
  }

  async findAssignableDepartmentForUpdate(
    id: string,
    manager: EntityManager
  ): Promise<ProductionDepartmentEntity> {
    const deptRepo = manager.getRepository(ProductionDepartmentEntity);

    const department = await deptRepo
      .createQueryBuilder('dept')
      .setLock('pessimistic_write')
      .where('dept.id = :id', { id })
      .andWhere('dept.deletedAt IS NULL')
      .getOne();

    if (!department) {
      throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
    }

    if (!department.isActive) {
      throw new BusinessRuleError(
        'لا يمكن ربط الساحة بقسم إنتاج معطل أو غير نشط',
        'PRODUCTION_DEPARTMENT_NOT_FOUND_OR_INACTIVE'
      );
    }

    return department;
  }

  async listActiveDepartments(): Promise<{ id: string; name: string; code: string }[]> {
    const depts = await this.departmentRepository.find({
      where: { isActive: true, deletedAt: IsNull() },
      order: { name: 'ASC' },
      select: { id: true, name: true, code: true },
    });

    return depts.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
    }));
  }

  async listActiveDepartmentsForPolicy(
    policy: ResolvedProductionAccessPolicy
  ): Promise<{ id: string; name: string; code: string }[]> {
    const qb = this.departmentRepository
      .createQueryBuilder('dept')
      .where('dept.isActive = :isActive', { isActive: true })
      .andWhere('dept.deletedAt IS NULL');

    applyDepartmentAccessScope(qb, policy, 'dept');

    qb.orderBy('dept.name', 'ASC')
      .select(['dept.id', 'dept.name', 'dept.code']);

    const depts = await qb.getMany();

    return depts.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
    }));
  }

  async validateDepartmentForStage(departmentId: string): Promise<{ id: string; name: string; code: string }> {
    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
      withDeleted: true,
    });
    if (!department) {
      throw new NotFoundError('قسم الإنتاج المحدد غير موجود', 'PRODUCTION_TEMPLATE_STAGE_DEPARTMENT_NOT_FOUND');
    }
    if (department.deletedAt) {
      throw new BusinessRuleError('قسم الإنتاج المحدد مؤرشف', 'PRODUCTION_TEMPLATE_STAGE_DEPARTMENT_ARCHIVED');
    }
    if (!department.isActive) {
      throw new BusinessRuleError('قسم الإنتاج المحدد معطل', 'PRODUCTION_TEMPLATE_STAGE_DEPARTMENT_INACTIVE');
    }
    return { id: department.id, name: department.name, code: department.code };
  }
}

export const productionDepartmentService = new ProductionDepartmentService();

