import { EntityManager, IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionDepartmentEntity } from './production-department.entity.js';
import { ProductionYardEntity } from '../yard/production-yard.entity.js';
import { UserEntity } from '../../system/user/user.entity.js';
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
    query: ListProductionDepartmentsQueryDto
  ): Promise<PaginatedProductionDepartmentsResult> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const qb = this.departmentRepository
      .createQueryBuilder('dept')
      .leftJoinAndSelect('dept.headUser', 'headUser')
      .where('dept.deletedAt IS NULL');

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

  async getDepartmentById(id: string): Promise<SafeProductionDepartmentOutput> {
    const dept = await this.departmentRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { headUser: true },
    });

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

    // 1. Check uniqueness including soft-deleted departments
    const existingCode = await this.departmentRepository
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

    // 2. Validate Head User exists, active and non-deleted
    const userRepo = AppDataSource.getRepository(UserEntity);
    const headUser = await userRepo.findOne({
      where: { id: dto.headUserId, deletedAt: IsNull() },
    });

    if (!headUser || !headUser.isActive) {
      throw new BusinessRuleError(
        'المستخدم المحدد غير موجود أو غير متاح لتعيينه رئيساً للقسم',
        'PRODUCTION_DEPARTMENT_HEAD_USER_NOT_AVAILABLE'
      );
    }

    try {
      const department = this.departmentRepository.create({
        name: dto.name.trim(),
        code: normalizedCode,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        headUserId: headUser.id,
      });

      const saved = await this.departmentRepository.save(department);

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
        throw new ConflictError(
          'رمز قسم الإنتاج مستخدم مسبقاً',
          'PRODUCTION_DEPARTMENT_CODE_ALREADY_EXISTS'
        );
      }
      throw err;
    }
  }

  async updateDepartment(
    id: string,
    dto: UpdateProductionDepartmentDto
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

  async softDeleteDepartment(id: string): Promise<void> {
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
}

export const productionDepartmentService = new ProductionDepartmentService();
