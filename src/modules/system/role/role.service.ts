import { EntityManager, IsNull, QueryFailedError, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { RoleEntity } from './role.entity.js';
import { UserEntity } from '../user/user.entity.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { ListRolesQueryDto } from './dto/list-roles-query.dto.js';
import { SafeRoleOutput, PaginatedRolesResult } from './role.types.js';
import { SystemRole } from './constants/system-role.enum.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

function isDuplicateRoleCodeError(error: unknown): boolean {
  if (error instanceof QueryFailedError) {
    const driverError = (
      error as { driverError?: { code?: string; errno?: number; message?: string } }
    ).driverError;
    if (driverError && (driverError.code === 'ER_DUP_ENTRY' || driverError.errno === 1062)) {
      return (
        !driverError.message ||
        driverError.message.includes('UQ_system_role_code') ||
        driverError.message.includes('code')
      );
    }
  }
  return false;
}

export class RoleService {
  private readonly roleRepository: Repository<RoleEntity>;
  private readonly userRepository: Repository<UserEntity>;

  constructor(
    roleRepo: Repository<RoleEntity> = AppDataSource.getRepository(RoleEntity),
    userRepo: Repository<UserEntity> = AppDataSource.getRepository(UserEntity)
  ) {
    this.roleRepository = roleRepo;
    this.userRepository = userRepo;
  }

  private toSafeRoleOutput(role: RoleEntity, userCount?: number): SafeRoleOutput {
    return {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      isActive: role.isActive,
      userCount: userCount !== undefined ? userCount : 0,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async listRoles(query: ListRolesQueryDto): Promise<PaginatedRolesResult> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.roleRepository
      .createQueryBuilder('role')
      .where('role.deletedAt IS NULL');

    if (query.search && query.search.trim() !== '') {
      const searchParam = `%${query.search.trim()}%`;
      qb.andWhere('(role.name LIKE :search OR role.code LIKE :search)', {
        search: searchParam,
      });
    }

    const total = await qb.getCount();
    const totalPages = Math.ceil(total / limit) || 1;

    qb.orderBy('role.createdAt', 'ASC').skip(skip).take(limit);
    const roles = await qb.getMany();

    const roleIds = roles.map((r) => r.id);
    const userCountMap = new Map<string, number>();

    if (roleIds.length > 0) {
      const userCounts = await this.userRepository
        .createQueryBuilder('u')
        .select('u.roleId', 'roleId')
        .addSelect('COUNT(u.id)', 'count')
        .where('u.roleId IN (:...roleIds)', { roleIds })
        .andWhere('u.deletedAt IS NULL')
        .groupBy('u.roleId')
        .getRawMany<{ roleId: string; count: string | number }>();

      for (const row of userCounts) {
        userCountMap.set(row.roleId, Number(row.count) || 0);
      }
    }

    return {
      items: roles.map((role) => this.toSafeRoleOutput(role, userCountMap.get(role.id) || 0)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getRoleById(id: string): Promise<SafeRoleOutput> {
    const role = await this.roleRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!role) {
      throw new NotFoundError('الدور غير موجود', 'ROLE_NOT_FOUND');
    }

    const userCount = await this.countAssignedUsers(id);
    return this.toSafeRoleOutput(role, userCount);
  }

  async createRole(dto: CreateRoleDto): Promise<SafeRoleOutput> {
    const cleanCode = dto.code.trim().toUpperCase();

    const existingRole = await this.roleRepository
      .createQueryBuilder('r')
      .withDeleted()
      .where('r.code = :code', { code: cleanCode })
      .getOne();

    if (existingRole) {
      throw new ConflictError('رمز الدور مستخدم بالفعل', 'ROLE_CODE_ALREADY_EXISTS');
    }

    const newRole = this.roleRepository.create({
      name: dto.name.trim(),
      code: cleanCode,
      description: dto.description ? dto.description.trim() : null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    try {
      const saved = await this.roleRepository.save(newRole);
      return this.toSafeRoleOutput(saved, 0);
    } catch (error) {
      if (isDuplicateRoleCodeError(error)) {
        throw new ConflictError('رمز الدور مستخدم بالفعل', 'ROLE_CODE_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  async updateRole(id: string, dto: UpdateRoleDto): Promise<SafeRoleOutput> {
    return await AppDataSource.transaction(async (manager) => {
      const roleRepo = manager.getRepository(RoleEntity);
      const targetRole = await roleRepo.findOne({
        where: { id, deletedAt: IsNull() },
      });

      if (!targetRole) {
        throw new NotFoundError('الدور غير موجود', 'ROLE_NOT_FOUND');
      }

      // Check deactivation constraints
      if (dto.isActive === false && targetRole.isActive === true) {
        if (targetRole.code === SystemRole.SYSTEM_ADMIN) {
          throw new BusinessRuleError(
            'لا يمكن تعطيل دور مدير النظام',
            'CANNOT_DEACTIVATE_SYSTEM_ADMIN_ROLE'
          );
        }

        const assignedUsersCount = await this.countAssignedUsers(id, manager);
        if (assignedUsersCount > 0) {
          throw new BusinessRuleError(
            'لا يمكن تعطيل الدور لأنه مستخدم من قبل مستخدمين حاليين',
            'ROLE_HAS_ASSIGNED_USERS'
          );
        }
      }

      if (dto.name !== undefined) {
        targetRole.name = dto.name.trim();
      }
      if (dto.description !== undefined) {
        targetRole.description = dto.description.trim() === '' ? null : dto.description.trim();
      }
      if (dto.isActive !== undefined) {
        targetRole.isActive = dto.isActive;
      }

      const updatedRole = await roleRepo.save(targetRole);
      const userCount = await this.countAssignedUsers(id, manager);
      return this.toSafeRoleOutput(updatedRole, userCount);
    });
  }

  async softDeleteRole(id: string): Promise<{ success: boolean; message: string }> {
    return await AppDataSource.transaction(async (manager) => {
      const roleRepo = manager.getRepository(RoleEntity);
      const targetRole = await roleRepo.findOne({
        where: { id, deletedAt: IsNull() },
      });

      if (!targetRole) {
        throw new NotFoundError('الدور غير موجود', 'ROLE_NOT_FOUND');
      }

      if (targetRole.code === SystemRole.SYSTEM_ADMIN) {
        throw new BusinessRuleError(
          'لا يمكن أرشفة أو حذف دور مدير النظام',
          'CANNOT_DELETE_SYSTEM_ADMIN_ROLE'
        );
      }

      const assignedUsersCount = await this.countAssignedUsers(id, manager);
      if (assignedUsersCount > 0) {
        throw new BusinessRuleError(
          'لا يمكن أرشفة الدور لأنه مستخدم من قبل مستخدمين حاليين',
          'ROLE_HAS_ASSIGNED_USERS'
        );
      }

      targetRole.isActive = false;
      await roleRepo.save(targetRole);
      await roleRepo.softDelete(id);

      return {
        success: true,
        message: 'تم أرشفة الدور بنجاح',
      };
    });
  }

  async countAssignedUsers(roleId: string, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(UserEntity) : this.userRepository;
    return repo
      .createQueryBuilder('u')
      .where('u.roleId = :roleId', { roleId })
      .andWhere('u.deletedAt IS NULL')
      .getCount();
  }

  async findActiveRoleById(roleId: string, manager?: EntityManager): Promise<RoleEntity | null> {
    const repo = manager ? manager.getRepository(RoleEntity) : this.roleRepository;
    return repo.findOne({
      where: {
        id: roleId,
        isActive: true,
        deletedAt: IsNull(),
      },
    });
  }

  async listActiveRoles(manager?: EntityManager): Promise<RoleEntity[]> {
    const repo = manager ? manager.getRepository(RoleEntity) : this.roleRepository;
    return repo.find({
      where: {
        isActive: true,
        deletedAt: IsNull(),
      },
      order: {
        name: 'ASC',
      },
    });
  }
}

export const roleService = new RoleService();
