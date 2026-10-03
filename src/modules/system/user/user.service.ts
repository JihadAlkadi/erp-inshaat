import { EntityManager, IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { UserEntity } from './user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { SafeUserOutput, PaginatedUsersResult } from './user.types.js';
import { RoleService, roleService } from '../role/role.service.js';
import { SessionService, sessionService } from '../session/session.service.js';
import { SystemRole } from '../role/constants/system-role.enum.js';
import { AuthPrincipal } from '../auth/auth.types.js';
import { hashPassword } from '../../../common/security/password.util.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { ForbiddenError } from '../../../common/errors/forbidden.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class UserService {
  private readonly userRepository: Repository<UserEntity>;
  private readonly roleService: RoleService;
  private readonly sessionService: SessionService;

  constructor(
    userRepo: Repository<UserEntity> = AppDataSource.getRepository(UserEntity),
    rService: RoleService = roleService,
    sService: SessionService = sessionService
  ) {
    this.userRepository = userRepo;
    this.roleService = rService;
    this.sessionService = sService;
  }

  private toSafeUserOutput(user: UserEntity, roleName?: string): SafeUserOutput {
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      roleId: user.roleId,
      roleName: roleName ?? user.role?.name,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async listUsers(query: ListUsersQueryDto): Promise<PaginatedUsersResult> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.deletedAt IS NULL');

    if (query.search && query.search.trim() !== '') {
      const searchParam = `%${query.search.trim()}%`;
      qb.andWhere('(user.fullName LIKE :search OR user.phone LIKE :search)', {
        search: searchParam,
      });
    }

    qb.orderBy('user.createdAt', 'DESC').skip(skip).take(limit);

    const [users, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: users.map((user) => this.toSafeUserOutput(user)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getUserById(id: string): Promise<SafeUserOutput> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { role: true },
    });

    if (!user) {
      throw new NotFoundError('المستخدم غير موجود', 'USER_NOT_FOUND');
    }

    return this.toSafeUserOutput(user);
  }

  async createUser(dto: CreateUserDto): Promise<SafeUserOutput> {
    const cleanPhone = dto.phone.trim();
    const existingPhone = await this.userRepository
      .createQueryBuilder('u')
      .withDeleted()
      .where('u.phone = :phone', { phone: cleanPhone })
      .getOne();

    if (existingPhone) {
      throw new ConflictError('رقم الهاتف مستخدم بالفعل', 'USER_PHONE_ALREADY_EXISTS');
    }

    const role = await this.roleService.findActiveRoleById(dto.roleId);
    if (!role) {
      throw new NotFoundError('الدور المحدد غير موجود أو غير نشط', 'ROLE_NOT_FOUND_OR_INACTIVE');
    }

    const passwordHash = await hashPassword(dto.password);

    const newUser = this.userRepository.create({
      fullName: dto.fullName.trim(),
      phone: cleanPhone,
      passwordHash,
      roleId: dto.roleId,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    const saved = await this.userRepository.save(newUser);
    return this.toSafeUserOutput(saved, role.name);
  }

  async updateUser(
    id: string,
    dto: UpdateUserDto,
    currentPrincipal: AuthPrincipal
  ): Promise<SafeUserOutput> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { role: true },
    });

    if (!user) {
      throw new NotFoundError('المستخدم غير موجود', 'USER_NOT_FOUND');
    }

    // 1. Self Protection Rules
    if (currentPrincipal.id === id) {
      if (dto.isActive !== undefined && dto.isActive === false) {
        throw new ForbiddenError('لا يمكنك تعطيل حسابك الحالي', 'CANNOT_DEACTIVATE_OWN_ACCOUNT');
      }
      if (dto.roleId !== undefined && dto.roleId !== user.roleId) {
        throw new ForbiddenError('لا يمكنك تغيير الدور الخاص بحسابك الحالي', 'CANNOT_CHANGE_OWN_ROLE');
      }
    }

    // 2. Phone Uniqueness Check
    if (dto.phone !== undefined) {
      const cleanPhone = dto.phone.trim();
      if (cleanPhone !== user.phone) {
        const duplicate = await this.userRepository
          .createQueryBuilder('u')
          .withDeleted()
          .where('u.phone = :phone AND u.id != :id', { phone: cleanPhone, id })
          .getOne();

        if (duplicate) {
          throw new ConflictError('رقم الهاتف مستخدم بالفعل', 'USER_PHONE_ALREADY_EXISTS');
        }
      }
    }

    // 3. Role Change Rules
    if (dto.roleId !== undefined && dto.roleId !== user.roleId) {
      if (user.role?.code === SystemRole.SYSTEM_ADMIN && user.isActive) {
        const adminCount = await this.countActiveSystemAdmins();
        if (adminCount <= 1) {
          throw new BusinessRuleError(
            'لا يمكن تغيير دور آخر مدير نظام فعال',
            'CANNOT_CHANGE_LAST_ADMIN_ROLE'
          );
        }
      }

      const targetRole = await this.roleService.findActiveRoleById(dto.roleId);
      if (!targetRole) {
        throw new NotFoundError('الدور المحدد غير موجود أو غير نشط', 'ROLE_NOT_FOUND_OR_INACTIVE');
      }
    }

    // 4. Deactivation Rules
    if (dto.isActive === false && user.isActive === true) {
      if (user.role?.code === SystemRole.SYSTEM_ADMIN) {
        const adminCount = await this.countActiveSystemAdmins();
        if (adminCount <= 1) {
          throw new BusinessRuleError(
            'لا يمكن تعطيل آخر مدير نظام فعال',
            'CANNOT_DEACTIVATE_LAST_ADMIN'
          );
        }
      }
    }

    // 5. Transaction execution
    return await AppDataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);

      if (dto.fullName !== undefined) {
        user.fullName = dto.fullName.trim();
      }
      if (dto.phone !== undefined) {
        user.phone = dto.phone.trim();
      }
      if (dto.roleId !== undefined) {
        user.roleId = dto.roleId;
      }

      const isDeactivating = dto.isActive === false && user.isActive === true;
      if (dto.isActive !== undefined) {
        user.isActive = dto.isActive;
      }

      await userRepo.save(user);

      if (isDeactivating) {
        await this.sessionService.revokeUserSessions(id, 'USER_DEACTIVATED', manager);
      }

      const reloaded = await userRepo.findOne({
        where: { id },
        relations: { role: true },
      });

      return this.toSafeUserOutput(reloaded ?? user);
    });
  }

  async softDeleteUser(
    id: string,
    currentPrincipal: AuthPrincipal
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { role: true },
    });

    if (!user) {
      throw new NotFoundError('المستخدم غير موجود', 'USER_NOT_FOUND');
    }

    // 1. Self Protection
    if (currentPrincipal.id === id) {
      throw new ForbiddenError('لا يمكنك أرشفة أو حذف حسابك الحالي', 'CANNOT_DELETE_OWN_ACCOUNT');
    }

    // 2. Last SYSTEM_ADMIN Protection
    if (user.role?.code === SystemRole.SYSTEM_ADMIN && user.isActive) {
      const adminCount = await this.countActiveSystemAdmins();
      if (adminCount <= 1) {
        throw new BusinessRuleError(
          'لا يمكن أرشفة أو حذف آخر مدير نظام فعال',
          'CANNOT_DELETE_LAST_ADMIN'
        );
      }
    }

    // 3. Transaction Soft Delete + Revoke Sessions
    await AppDataSource.transaction(async (manager) => {
      await this.sessionService.revokeUserSessions(id, 'USER_DELETED', manager);
      user.isActive = false;
      await manager.getRepository(UserEntity).save(user);
      await manager.getRepository(UserEntity).softDelete(id);
    });

    return {
      success: true,
      message: 'تم أرشفة المستخدم بنجاح',
    };
  }

  async countActiveSystemAdmins(manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(UserEntity) : this.userRepository;
    return repo
      .createQueryBuilder('u')
      .innerJoin('u.role', 'role')
      .where('role.code = :adminCode', { adminCode: SystemRole.SYSTEM_ADMIN })
      .andWhere('u.isActive = :isActive', { isActive: true })
      .andWhere('u.deletedAt IS NULL')
      .getCount();
  }
}

export const userService = new UserService();
