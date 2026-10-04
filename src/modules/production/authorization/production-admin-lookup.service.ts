import { Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionDepartmentEntity } from '../department/production-department.entity.js';
import { ProductionYardEntity } from '../yard/production-yard.entity.js';

export interface AdminDepartmentLookupItem {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface AdminYardLookupItem {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  departmentId: string;
  departmentName: string;
}

export class ProductionAdminLookupService {
  private readonly departmentRepository: Repository<ProductionDepartmentEntity>;
  private readonly yardRepository: Repository<ProductionYardEntity>;

  constructor(
    deptRepo: Repository<ProductionDepartmentEntity> = AppDataSource.getRepository(ProductionDepartmentEntity),
    yardRepo: Repository<ProductionYardEntity> = AppDataSource.getRepository(ProductionYardEntity)
  ) {
    this.departmentRepository = deptRepo;
    this.yardRepository = yardRepo;
  }

  async listDepartmentsForLookup(
    search?: string,
    limit = 50
  ): Promise<AdminDepartmentLookupItem[]> {
    const cappedLimit = Math.min(Math.max(1, limit), 100);
    const qb = this.departmentRepository
      .createQueryBuilder('dept')
      .where('dept.deletedAt IS NULL');

    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      qb.andWhere('(dept.name LIKE :term OR dept.code LIKE :term)', { term });
    }

    qb.orderBy('dept.name', 'ASC').limit(cappedLimit);

    const departments = await qb.getMany();

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      isActive: d.isActive,
    }));
  }

  async listYardsForLookup(
    search?: string,
    departmentId?: string,
    limit = 50
  ): Promise<AdminYardLookupItem[]> {
    const cappedLimit = Math.min(Math.max(1, limit), 100);
    const qb = this.yardRepository
      .createQueryBuilder('yard')
      .innerJoin('yard.department', 'dept')
      .where('yard.deletedAt IS NULL')
      .andWhere('dept.deletedAt IS NULL');

    if (departmentId && departmentId.trim().length > 0) {
      qb.andWhere('yard.departmentId = :departmentId', { departmentId: departmentId.trim() });
    }

    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(yard.name LIKE :term OR yard.code LIKE :term OR dept.name LIKE :term)',
        { term }
      );
    }

    qb.select([
      'yard.id',
      'yard.name',
      'yard.code',
      'yard.isActive',
      'yard.departmentId',
      'dept.name',
    ])
      .orderBy('dept.name', 'ASC')
      .addOrderBy('yard.name', 'ASC')
      .limit(cappedLimit);

    const yards = await qb.getMany();

    return yards.map((y) => ({
      id: y.id,
      name: y.name,
      code: y.code,
      isActive: y.isActive,
      departmentId: y.departmentId,
      departmentName: y.department?.name ?? '',
    }));
  }
}

export const productionAdminLookupService = new ProductionAdminLookupService();
