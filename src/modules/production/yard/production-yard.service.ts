import { IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionYardEntity } from './production-yard.entity.js';
import { ProductionDepartmentEntity } from '../department/production-department.entity.js';
import { ProductionDepartmentService, productionDepartmentService } from '../department/production-department.service.js';
import { CreateProductionYardDto } from './dto/create-production-yard.dto.js';
import { UpdateProductionYardDto } from './dto/update-production-yard.dto.js';
import { ListProductionYardsQueryDto } from './dto/list-production-yards-query.dto.js';
import {
  PaginatedProductionYardsResult,
  SafeProductionYardOutput,
} from './production-yard.types.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { ForbiddenError } from '../../../common/errors/forbidden.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';
import { ProductionYardEngineerEntity } from '../team/entities/production-yard-engineer.entity.js';
import { ResolvedProductionAccessPolicy } from '../authorization/production-access-policy.types.js';
import {
  applyYardAccessScope,
  canAccessDepartment,
  canAccessYard,
} from '../authorization/production-access-query.helper.js';

export class ProductionYardService {
  private readonly yardRepository: Repository<ProductionYardEntity>;
  private readonly departmentService: ProductionDepartmentService;

  constructor(
    yardRepo: Repository<ProductionYardEntity> = AppDataSource.getRepository(ProductionYardEntity),
    deptService: ProductionDepartmentService = productionDepartmentService
  ) {
    this.yardRepository = yardRepo;
    this.departmentService = deptService;
  }

  async listYards(
    query: ListProductionYardsQueryDto,
    policy: ResolvedProductionAccessPolicy
  ): Promise<PaginatedProductionYardsResult> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const qb = this.yardRepository
      .createQueryBuilder('yard')
      .leftJoinAndSelect('yard.department', 'department')
      .where('yard.deletedAt IS NULL');

    // Apply row-level access scope before pagination & counting
    applyYardAccessScope(qb, policy, 'yard');

    if (query.departmentId) {
      qb.andWhere('yard.departmentId = :deptId', { deptId: query.departmentId });
    }

    if (query.search && query.search.trim() !== '') {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(yard.name LIKE :term OR yard.code LIKE :term OR department.name LIKE :term)', { term });
    }

    qb.orderBy('yard.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [yards, total] = await qb.getManyAndCount();

    const items: SafeProductionYardOutput[] = yards.map((yard) => ({
      id: yard.id,
      departmentId: yard.departmentId,
      departmentName: yard.department?.name || '',
      name: yard.name,
      code: yard.code,
      capacity: yard.capacity,
      description: yard.description,
      isActive: yard.isActive,
      createdAt: yard.createdAt,
      updatedAt: yard.updatedAt,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getYardById(
    id: string,
    policy: ResolvedProductionAccessPolicy
  ): Promise<SafeProductionYardOutput> {
    const qb = this.yardRepository
      .createQueryBuilder('yard')
      .leftJoinAndSelect('yard.department', 'department')
      .where('yard.id = :id', { id })
      .andWhere('yard.deletedAt IS NULL');

    applyYardAccessScope(qb, policy, 'yard');

    const yard = await qb.getOne();

    if (!yard) {
      throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
    }

    return {
      id: yard.id,
      departmentId: yard.departmentId,
      departmentName: yard.department?.name || '',
      name: yard.name,
      code: yard.code,
      capacity: yard.capacity,
      description: yard.description,
      isActive: yard.isActive,
      createdAt: yard.createdAt,
      updatedAt: yard.updatedAt,
    };
  }

  async createYard(
    dto: CreateProductionYardDto,
    policy: ResolvedProductionAccessPolicy
  ): Promise<SafeProductionYardOutput> {
    // 1. Authorize creation in target department scope
    if (!canAccessDepartment(policy, dto.departmentId)) {
      throw new ForbiddenError(
        'ليس لديك صلاحية لإنشاء ساحة في هذا القسم',
        'ACCESS_SCOPE_DENIED'
      );
    }

    const normalizedCode = dto.code.trim().toUpperCase();

    return await AppDataSource.transaction(async (manager) => {
      const yardRepo = manager.getRepository(ProductionYardEntity);

      // 2. Lock Target Department to ensure active and serialize concurrent department deactivation
      const department = await this.departmentService.findAssignableDepartmentForUpdate(
        dto.departmentId,
        manager
      );

      // 3. Check code uniqueness including soft-deleted yards
      const existingCode = await yardRepo
        .createQueryBuilder('yard')
        .withDeleted()
        .where('yard.code = :code', { code: normalizedCode })
        .getOne();

      if (existingCode) {
        throw new ConflictError(
          'رمز ساحة الإنتاج مستخدم مسبقاً',
          'PRODUCTION_YARD_CODE_ALREADY_EXISTS'
        );
      }

      try {
        const yard = yardRepo.create({
          departmentId: department.id,
          name: dto.name.trim(),
          code: normalizedCode,
          capacity: dto.capacity,
          description: dto.description ?? null,
          isActive: dto.isActive ?? true,
        });

        const saved = await yardRepo.save(yard);

        return {
          id: saved.id,
          departmentId: saved.departmentId,
          departmentName: department.name,
          name: saved.name,
          code: saved.code,
          capacity: saved.capacity,
          description: saved.description,
          isActive: saved.isActive,
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
            'رمز ساحة الإنتاج مستخدم مسبقاً',
            'PRODUCTION_YARD_CODE_ALREADY_EXISTS'
          );
        }
        throw err;
      }
    });
  }

  async updateYard(
    id: string,
    dto: UpdateProductionYardDto,
    policy: ResolvedProductionAccessPolicy
  ): Promise<SafeProductionYardOutput> {
    // 1. Scoped pre-read Yard outside transaction to reject out-of-scope requests before acquiring locks
    const preReadQb = this.yardRepository
      .createQueryBuilder('yard')
      .where('yard.id = :id', { id })
      .andWhere('yard.deletedAt IS NULL');

    applyYardAccessScope(preReadQb, policy, 'yard');

    const unverifiedYard = await preReadQb
      .select(['yard.id', 'yard.departmentId', 'yard.isActive'])
      .getOne();

    if (!unverifiedYard) {
      throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
    }

    return await AppDataSource.transaction(async (manager) => {
      const yardRepo = manager.getRepository(ProductionYardEntity);
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);
      const yardEngRepo = manager.getRepository(ProductionYardEngineerEntity);

      // 2. Determine involved Departments & Lock in deterministic ascending order (Protocol step 1)
      const sourceDepartmentId = unverifiedYard.departmentId;
      const targetDepartmentId =
        dto.departmentId !== undefined && dto.departmentId !== sourceDepartmentId
          ? dto.departmentId
          : undefined;

      const sortedDeptIds = [
        ...new Set(
          targetDepartmentId
            ? [sourceDepartmentId, targetDepartmentId]
            : [sourceDepartmentId]
        ),
      ].sort();

      const lockedDepartments = new Map<string, ProductionDepartmentEntity>();

      for (const deptId of sortedDeptIds) {
        const department = await deptRepo
          .createQueryBuilder('dept')
          .setLock('pessimistic_write')
          .where('dept.id = :deptId', { deptId })
          .andWhere('dept.deletedAt IS NULL')
          .getOne();

        if (department) {
          lockedDepartments.set(department.id, department);
        }
      }

      const sourceDepartment = lockedDepartments.get(sourceDepartmentId);
      if (!sourceDepartment) {
        throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
      }

      // 3. Lock Target Yard (Protocol step 2)
      const yard = await yardRepo
        .createQueryBuilder('yard')
        .setLock('pessimistic_write')
        .where('yard.id = :id', { id })
        .andWhere('yard.deletedAt IS NULL')
        .getOne();

      if (!yard) {
        throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
      }

      // Revalidate that yard's departmentId did not change concurrently from pre-read
      if (yard.departmentId !== sourceDepartmentId) {
        throw new BusinessRuleError(
          'تم تعديل قسم الساحة بالتوازي، يرجى إعادة المحاولة',
          'PRODUCTION_YARD_CONCURRENTLY_CHANGED'
        );
      }

      // 4. Enforce row-level authorization on source yard before evaluating target department
      if (!canAccessYard(policy, { id: yard.id, departmentId: yard.departmentId })) {
        throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
      }

      // 5. After source yard is authorized, validate target department if moving
      const isMovingDepartment = targetDepartmentId !== undefined;
      let targetDepartment = sourceDepartment;

      if (isMovingDepartment) {
        const foundTarget = lockedDepartments.get(targetDepartmentId);
        if (!foundTarget || !foundTarget.isActive) {
          throw new BusinessRuleError(
            'قسم الإنتاج المستهدف غير موجود أو غير نشط',
            'PRODUCTION_DEPARTMENT_NOT_FOUND_OR_INACTIVE'
          );
        }

        // Verify user has department-level access to the target department
        if (!canAccessDepartment(policy, foundTarget.id)) {
          throw new ForbiddenError(
            'ليس لديك صلاحية لنقل الساحة إلى قسم الإنتاج المستهدف',
            'ACCESS_SCOPE_DENIED'
          );
        }

        // Invariant: If moving to another department, verify no assigned engineers
        const assignedCount = await yardEngRepo.count({
          where: { yardId: yard.id },
        });

        if (assignedCount > 0) {
          throw new BusinessRuleError(
            'لا يمكن نقل الساحة إلى قسم آخر لأنها مسندة لمهندسين حالياً',
            'PRODUCTION_YARD_HAS_ENGINEERS'
          );
        }

        targetDepartment = foundTarget;
        yard.departmentId = targetDepartment.id;
      }

      // 6. Invariant: If reactivating yard (isActive: true), ensure active parent department
      const willBeActive = dto.isActive !== undefined ? dto.isActive : yard.isActive;
      if (willBeActive && !yard.isActive) {
        const parentDept = targetDepartment;
        if (!parentDept.isActive) {
          throw new BusinessRuleError(
            'لا يمكن تفعيل الساحة لأن قسم الإنتاج التابع له معطل أو غير نشط',
            'PRODUCTION_DEPARTMENT_NOT_FOUND_OR_INACTIVE'
          );
        }
      }

      if (dto.name !== undefined) {
        yard.name = dto.name.trim();
      }

      if (dto.capacity !== undefined) {
        yard.capacity = dto.capacity;
      }

      if (dto.description !== undefined) {
        yard.description = dto.description;
      }

      if (dto.isActive !== undefined) {
        yard.isActive = dto.isActive;
      }

      const updated = await yardRepo.save(yard);

      return {
        id: updated.id,
        departmentId: updated.departmentId,
        departmentName: targetDepartment.name,
        name: updated.name,
        code: updated.code,
        capacity: updated.capacity,
        description: updated.description,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    });
  }

  async softDeleteYard(
    id: string,
    policy: ResolvedProductionAccessPolicy
  ): Promise<void> {
    // 1. Scoped pre-read Yard outside transaction to reject out-of-scope requests before acquiring locks
    const preReadQb = this.yardRepository
      .createQueryBuilder('yard')
      .where('yard.id = :id', { id })
      .andWhere('yard.deletedAt IS NULL');

    applyYardAccessScope(preReadQb, policy, 'yard');

    const unverifiedYard = await preReadQb
      .select(['yard.id', 'yard.departmentId'])
      .getOne();

    if (!unverifiedYard) {
      throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
    }

    await AppDataSource.transaction(async (manager) => {
      const yardRepo = manager.getRepository(ProductionYardEntity);
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);
      const yardEngRepo = manager.getRepository(ProductionYardEngineerEntity);

      // 2. Lock Department (Protocol step 1)
      const department = await deptRepo
        .createQueryBuilder('dept')
        .setLock('pessimistic_write')
        .where('dept.id = :deptId', { deptId: unverifiedYard.departmentId })
        .andWhere('dept.deletedAt IS NULL')
        .getOne();

      if (!department) {
        throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
      }

      // 3. Lock Target Yard (Protocol step 2)
      const yard = await yardRepo
        .createQueryBuilder('yard')
        .setLock('pessimistic_write')
        .where('yard.id = :id', { id })
        .andWhere('yard.deletedAt IS NULL')
        .getOne();

      if (!yard) {
        throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
      }

      // Revalidate parent department consistency
      if (yard.departmentId !== unverifiedYard.departmentId) {
        throw new BusinessRuleError(
          'تم تعديل قسم الساحة بالتوازي، يرجى إعادة المحاولة',
          'PRODUCTION_YARD_CONCURRENTLY_CHANGED'
        );
      }

      // 4. Enforce row-level authorization on locked yard
      if (!canAccessYard(policy, { id: yard.id, departmentId: yard.departmentId })) {
        throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
      }

      // 5. Invariant: Cannot delete yard if assigned to engineers
      const assignedCount = await yardEngRepo.count({
        where: { yardId: yard.id },
      });

      if (assignedCount > 0) {
        throw new BusinessRuleError(
          'لا يمكن أرشفة الساحة لأنها مسندة لمهندسين حالياً',
          'PRODUCTION_YARD_HAS_ENGINEERS'
        );
      }

      yard.deletedAt = new Date();
      yard.isActive = false;
      await yardRepo.save(yard);
    });
  }

  /**
   * Retrieves distinct department options derived strictly from accessible yards within the user's yard view policy.
   * Prevents leaking department metadata that the user has no visibility over.
   */
  async listAccessibleDepartmentOptions(
    policy: ResolvedProductionAccessPolicy
  ): Promise<Array<{ id: string; name: string; code: string }>> {
    const qb = this.yardRepository
      .createQueryBuilder('yard')
      .innerJoin('yard.department', 'department')
      .where('yard.deletedAt IS NULL')
      .andWhere('department.deletedAt IS NULL');

    applyYardAccessScope(qb, policy, 'yard');

    qb.select('department.id', 'id')
      .addSelect('department.name', 'name')
      .addSelect('department.code', 'code')
      .distinct(true)
      .orderBy('department.name', 'ASC');

    const rows = await qb.getRawMany<{ id: string; name: string; code: string }>();

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
    }));
  }
}

export const productionYardService = new ProductionYardService();
