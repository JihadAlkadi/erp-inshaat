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
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';
import { ProductionYardEngineerEntity } from '../team/entities/production-yard-engineer.entity.js';

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

  async listYards(query: ListProductionYardsQueryDto): Promise<PaginatedProductionYardsResult> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const qb = this.yardRepository
      .createQueryBuilder('yard')
      .leftJoinAndSelect('yard.department', 'department')
      .where('yard.deletedAt IS NULL');

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

  async getYardById(id: string): Promise<SafeProductionYardOutput> {
    const yard = await this.yardRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { department: true },
    });

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

  async createYard(dto: CreateProductionYardDto): Promise<SafeProductionYardOutput> {
    const normalizedCode = dto.code.trim().toUpperCase();

    return await AppDataSource.transaction(async (manager) => {
      const yardRepo = manager.getRepository(ProductionYardEntity);

      // 1. Lock Target Department to ensure active and serialize concurrent department deactivation
      const department = await this.departmentService.findAssignableDepartmentForUpdate(
        dto.departmentId,
        manager
      );

      // 2. Check code uniqueness including soft-deleted yards
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

  async updateYard(id: string, dto: UpdateProductionYardDto): Promise<SafeProductionYardOutput> {
    return await AppDataSource.transaction(async (manager) => {
      const yardRepo = manager.getRepository(ProductionYardEntity);
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);

      // 1. Lock Target Yard
      const yard = await yardRepo
        .createQueryBuilder('yard')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('yard.department', 'department')
        .where('yard.id = :id', { id })
        .andWhere('yard.deletedAt IS NULL')
        .getOne();

      if (!yard) {
        throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
      }

      let currentDepartment = yard.department;

      // 2. If moving to another department, validate & lock target department
      if (dto.departmentId !== undefined && dto.departmentId !== yard.departmentId) {
        const yardEngRepo = manager.getRepository(ProductionYardEngineerEntity);
        const assignedCount = await yardEngRepo.count({
          where: { yardId: yard.id },
        });

        if (assignedCount > 0) {
          throw new BusinessRuleError(
            'لا يمكن نقل الساحة إلى قسم آخر لأنها مسندة لمهندسين حالياً',
            'PRODUCTION_YARD_HAS_ENGINEERS'
          );
        }

        currentDepartment = await this.departmentService.findAssignableDepartmentForUpdate(
          dto.departmentId,
          manager
        );
        yard.departmentId = currentDepartment.id;
        yard.department = currentDepartment;
      }

      // 3. If reactivating yard (isActive: true), ensure parent department is active
      const willBeActive = dto.isActive !== undefined ? dto.isActive : yard.isActive;
      if (willBeActive && !yard.isActive) {
        const parentDept = await deptRepo
          .createQueryBuilder('dept')
          .setLock('pessimistic_write')
          .where('dept.id = :deptId', { deptId: yard.departmentId })
          .andWhere('dept.deletedAt IS NULL')
          .getOne();

        if (!parentDept || !parentDept.isActive) {
          throw new BusinessRuleError(
            'لا يمكن تفعيل الساحة لأن قسم الإنتاج التابع له معطل أو غير نشط',
            'PRODUCTION_DEPARTMENT_NOT_FOUND_OR_INACTIVE'
          );
        }
        currentDepartment = parentDept;
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
        departmentName: currentDepartment?.name || '',
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

  async softDeleteYard(id: string): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const yardRepo = manager.getRepository(ProductionYardEntity);
      const yardEngRepo = manager.getRepository(ProductionYardEngineerEntity);

      const yard = await yardRepo
        .createQueryBuilder('yard')
        .setLock('pessimistic_write')
        .where('yard.id = :id', { id })
        .andWhere('yard.deletedAt IS NULL')
        .getOne();

      if (!yard) {
        throw new NotFoundError('ساحة الإنتاج غير موجودة', 'PRODUCTION_YARD_NOT_FOUND');
      }

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
}

export const productionYardService = new ProductionYardService();
