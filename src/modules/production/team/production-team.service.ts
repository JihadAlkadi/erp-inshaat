import { EntityManager, In, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionDepartmentEntity } from '../department/production-department.entity.js';
import { ProductionYardEntity } from '../yard/production-yard.entity.js';
import { UserEntity } from '../../system/user/user.entity.js';
import { ProductionDepartmentEngineerEntity } from './entities/production-department-engineer.entity.js';
import { ProductionYardEngineerEntity } from './entities/production-yard-engineer.entity.js';
import {
  DepartmentTeamOutput,
  SafeEngineerAssignmentOutput,
  SafeHeadUserOutput,
  ActiveUserSelectOption,
} from './production-team.types.js';
import { CreateProductionEngineerAssignmentDto } from './dto/create-production-engineer-assignment.dto.js';
import { UpdateProductionEngineerYardsDto } from './dto/update-production-engineer-yards.dto.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export class ProductionTeamService {
  /**
   * Retrieves the department team details (Head + Engineers + Yards) in an optimized batched query without N+1.
   */
  async getDepartmentTeam(departmentId: string): Promise<DepartmentTeamOutput> {
    const deptRepo = AppDataSource.getRepository(ProductionDepartmentEntity);

    const department = await deptRepo
      .createQueryBuilder('dept')
      .leftJoinAndSelect('dept.headUser', 'headUser')
      .where('dept.id = :departmentId', { departmentId })
      .andWhere('dept.deletedAt IS NULL')
      .getOne();

    if (!department) {
      throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
    }

    let head: SafeHeadUserOutput | null = null;
    if (department.headUser) {
      head = {
        id: department.headUser.id,
        fullName: department.headUser.fullName,
        phone: department.headUser.phone,
        isActive: department.headUser.isActive && !department.headUser.deletedAt,
      };
    }

    // Fetch active engineer assignments with their user and yard mappings in a single joined query
    const engRepo = AppDataSource.getRepository(ProductionDepartmentEngineerEntity);
    const engineerRows = await engRepo
      .createQueryBuilder('deptEng')
      .leftJoinAndSelect('deptEng.user', 'user')
      .leftJoinAndSelect('deptEng.yardMappings', 'yardMapping')
      .leftJoinAndSelect('yardMapping.yard', 'yard')
      .where('deptEng.departmentId = :departmentId', { departmentId })
      .andWhere('deptEng.isActive = :isActive', { isActive: true })
      .orderBy('user.fullName', 'ASC')
      .getMany();

    const engineers: SafeEngineerAssignmentOutput[] = engineerRows.map((eng) => {
      const yards = (eng.yardMappings || [])
        .filter((ym) => ym.yard && ym.yard.deletedAt === null)
        .map((ym) => ({
          id: ym.yard.id,
          name: ym.yard.name,
          code: ym.yard.code,
          capacity: ym.yard.capacity,
          isActive: ym.yard.isActive,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

      return {
        assignmentId: eng.id,
        userId: eng.userId,
        fullName: eng.user?.fullName || 'مستخدم غير معروف',
        phone: eng.user?.phone || '',
        userIsActive: Boolean(eng.user?.isActive && !eng.user?.deletedAt),
        assignmentIsActive: eng.isActive,
        yards,
        createdAt: eng.createdAt,
        updatedAt: eng.updatedAt,
      };
    });

    return {
      department: {
        id: department.id,
        name: department.name,
        code: department.code,
        description: department.description,
        isActive: department.isActive,
      },
      head,
      engineers,
    };
  }

  /**
   * Sets or changes the department head atomically with pessimistic locking.
   */
  async setDepartmentHead(
    departmentId: string,
    userId: string
  ): Promise<{ success: boolean; message: string; head: SafeHeadUserOutput }> {
    return await AppDataSource.transaction(async (manager: EntityManager) => {
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);
      const userRepo = manager.getRepository(UserEntity);

      // 1. Lock Department
      const department = await deptRepo
        .createQueryBuilder('dept')
        .setLock('pessimistic_write')
        .where('dept.id = :departmentId', { departmentId })
        .andWhere('dept.deletedAt IS NULL')
        .getOne();

      if (!department) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      // 2. Lock User
      const user = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .andWhere('user.deletedAt IS NULL')
        .getOne();

      if (!user || !user.isActive) {
        throw new BusinessRuleError(
          'المستخدم المحدد غير موجود أو غير متاح لتعيينه رئيساً للقسم',
          'PRODUCTION_DEPARTMENT_HEAD_USER_NOT_AVAILABLE'
        );
      }

      department.headUserId = user.id;
      await deptRepo.save(department);

      return {
        success: true,
        message: 'تم تعيين رئيس قسم الإنتاج بنجاح',
        head: {
          id: user.id,
          fullName: user.fullName,
          phone: user.phone,
          isActive: user.isActive,
        },
      };
    });
  }

  /**
   * Adds an engineer assignment to the department with all yard mappings in a single transaction.
   */
  async addEngineerToDepartment(
    departmentId: string,
    dto: CreateProductionEngineerAssignmentDto
  ): Promise<SafeEngineerAssignmentOutput> {
    return await AppDataSource.transaction(async (manager: EntityManager) => {
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);
      const userRepo = manager.getRepository(UserEntity);
      const engRepo = manager.getRepository(ProductionDepartmentEngineerEntity);
      const yardRepo = manager.getRepository(ProductionYardEntity);
      const yardEngRepo = manager.getRepository(ProductionYardEngineerEntity);

      // 1. Lock Department
      const department = await deptRepo
        .createQueryBuilder('dept')
        .setLock('pessimistic_write')
        .where('dept.id = :departmentId', { departmentId })
        .andWhere('dept.deletedAt IS NULL')
        .getOne();

      if (!department) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      if (!department.isActive) {
        throw new BusinessRuleError(
          'لا يمكن إضافة مهندس لقسم إنتاج معطل أو غير نشط',
          'PRODUCTION_DEPARTMENT_NOT_FOUND_OR_INACTIVE'
        );
      }

      // 2. Lock User (Serialization point for multi-department conflict prevention)
      const user = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId: dto.userId })
        .andWhere('user.deletedAt IS NULL')
        .getOne();

      if (!user || !user.isActive) {
        throw new BusinessRuleError(
          'المستخدم المحدد غير موجود أو غير متاح لتعيينه مهندساً',
          'PRODUCTION_ENGINEER_USER_NOT_AVAILABLE'
        );
      }

      // 3. Check existing engineer record across all production departments
      const existingAssignment = await engRepo
        .createQueryBuilder('eng')
        .setLock('pessimistic_write')
        .where('eng.userId = :userId', { userId: user.id })
        .getOne();

      let assignment: ProductionDepartmentEngineerEntity;

      if (existingAssignment && existingAssignment.isActive) {
        if (existingAssignment.departmentId === department.id) {
          throw new ConflictError(
            'المهندس مسند بالفعل لهذا القسم',
            'PRODUCTION_ENGINEER_ALREADY_ASSIGNED'
          );
        } else {
          throw new ConflictError(
            'المهندس مسند بالفعل لقسم إنتاج آخر، يجب إزالته من قسمه الحالي أولاً',
            'PRODUCTION_ENGINEER_ASSIGNED_TO_OTHER_DEPARTMENT'
          );
        }
      } else if (existingAssignment && !existingAssignment.isActive) {
        // Reuse existing assignment record
        existingAssignment.departmentId = department.id;
        existingAssignment.isActive = true;
        assignment = existingAssignment;
      } else {
        // Create new assignment
        assignment = engRepo.create({
          departmentId: department.id,
          userId: user.id,
          isActive: true,
        });
      }

      // 4. Validate & Lock Target Yards (Sorted IDs to prevent deadlocks)
      const sortedYardIds = [...new Set(dto.yardIds)].sort();
      if (sortedYardIds.length === 0) {
        throw new BusinessRuleError(
          'يجب تحديد ساحة واحدة على الأقل للمهندس',
          'PRODUCTION_ENGINEER_YARDS_REQUIRED'
        );
      }

      const yards = await yardRepo
        .createQueryBuilder('yard')
        .setLock('pessimistic_write')
        .where('yard.id IN (:...yardIds)', { yardIds: sortedYardIds })
        .andWhere('yard.deletedAt IS NULL')
        .andWhere('yard.isActive = :isActive', { isActive: true })
        .getMany();

      if (yards.length !== sortedYardIds.length) {
        throw new BusinessRuleError(
          'إحدى الساحات المحددة غير موجودة أو معطلة',
          'PRODUCTION_ENGINEER_YARD_DEPARTMENT_MISMATCH'
        );
      }

      const invalidDeptYard = yards.find((y) => y.departmentId !== department.id);
      if (invalidDeptYard) {
        throw new BusinessRuleError(
          'الساحة المحددة تتبع لقسم إنتاج آخر ولا يمكن إسنادها لمهندس هذا القسم',
          'PRODUCTION_ENGINEER_YARD_DEPARTMENT_MISMATCH'
        );
      }

      try {
        const savedAssignment = await engRepo.save(assignment);

        // Delete any stale mappings (if reused assignment)
        await yardEngRepo.delete({ departmentEngineerId: savedAssignment.id });

        // Insert new yard mappings
        const mappings = yards.map((yard) =>
          yardEngRepo.create({
            departmentEngineerId: savedAssignment.id,
            yardId: yard.id,
          })
        );
        await yardEngRepo.save(mappings);

        return {
          assignmentId: savedAssignment.id,
          userId: user.id,
          fullName: user.fullName,
          phone: user.phone,
          userIsActive: user.isActive,
          assignmentIsActive: savedAssignment.isActive,
          yards: yards.map((y) => ({
            id: y.id,
            name: y.name,
            code: y.code,
            capacity: y.capacity,
            isActive: y.isActive,
          })),
          createdAt: savedAssignment.createdAt,
          updatedAt: savedAssignment.updatedAt,
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
            'المهندس مسند بالفعل لقسم إنتاج',
            'PRODUCTION_ENGINEER_ALREADY_ASSIGNED'
          );
        }
        throw err;
      }
    });
  }

  /**
   * Updates an engineer's assigned yards inside the same department atomically.
   */
  async updateEngineerYards(
    departmentId: string,
    assignmentId: string,
    dto: UpdateProductionEngineerYardsDto
  ): Promise<SafeEngineerAssignmentOutput> {
    return await AppDataSource.transaction(async (manager: EntityManager) => {
      const engRepo = manager.getRepository(ProductionDepartmentEngineerEntity);
      const yardRepo = manager.getRepository(ProductionYardEntity);
      const yardEngRepo = manager.getRepository(ProductionYardEngineerEntity);

      // 1. Lock Assignment
      const assignment = await engRepo
        .createQueryBuilder('eng')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('eng.user', 'user')
        .where('eng.id = :assignmentId', { assignmentId })
        .andWhere('eng.departmentId = :departmentId', { departmentId })
        .andWhere('eng.isActive = :isActive', { isActive: true })
        .getOne();

      if (!assignment) {
        throw new NotFoundError(
          'تعيين المهندس غير موجود أو غير نشط في هذا القسم',
          'PRODUCTION_ENGINEER_ASSIGNMENT_NOT_FOUND'
        );
      }

      // 2. Validate & Lock Target Yards
      const sortedYardIds = [...new Set(dto.yardIds)].sort();
      if (sortedYardIds.length === 0) {
        throw new BusinessRuleError(
          'يجب تحديد ساحة واحدة على الأقل للمهندس',
          'PRODUCTION_ENGINEER_YARDS_REQUIRED'
        );
      }

      const yards = await yardRepo
        .createQueryBuilder('yard')
        .setLock('pessimistic_write')
        .where('yard.id IN (:...yardIds)', { yardIds: sortedYardIds })
        .andWhere('yard.deletedAt IS NULL')
        .andWhere('yard.isActive = :isActive', { isActive: true })
        .getMany();

      if (yards.length !== sortedYardIds.length) {
        throw new BusinessRuleError(
          'إحدى الساحات المحددة غير موجودة أو معطلة',
          'PRODUCTION_ENGINEER_YARD_DEPARTMENT_MISMATCH'
        );
      }

      const invalidDeptYard = yards.find((y) => y.departmentId !== departmentId);
      if (invalidDeptYard) {
        throw new BusinessRuleError(
          'الساحة المحددة تتبع لقسم إنتاج آخر ولا يمكن إسنادها لمهندس هذا القسم',
          'PRODUCTION_ENGINEER_YARD_DEPARTMENT_MISMATCH'
        );
      }

      // Replace mappings atomically
      await yardEngRepo.delete({ departmentEngineerId: assignment.id });

      const mappings = yards.map((yard) =>
        yardEngRepo.create({
          departmentEngineerId: assignment.id,
          yardId: yard.id,
        })
      );
      await yardEngRepo.save(mappings);

      assignment.updatedAt = new Date();
      await engRepo.save(assignment);

      return {
        assignmentId: assignment.id,
        userId: assignment.userId,
        fullName: assignment.user?.fullName || '',
        phone: assignment.user?.phone || '',
        userIsActive: Boolean(assignment.user?.isActive && !assignment.user?.deletedAt),
        assignmentIsActive: assignment.isActive,
        yards: yards.map((y) => ({
          id: y.id,
          name: y.name,
          code: y.code,
          capacity: y.capacity,
          isActive: y.isActive,
        })),
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      };
    });
  }

  /**
   * Removes an engineer from the department (sets isActive = false and deletes yard mappings).
   */
  async removeEngineerFromDepartment(
    departmentId: string,
    assignmentId: string
  ): Promise<{ success: boolean; message: string }> {
    return await AppDataSource.transaction(async (manager: EntityManager) => {
      const engRepo = manager.getRepository(ProductionDepartmentEngineerEntity);
      const yardEngRepo = manager.getRepository(ProductionYardEngineerEntity);

      const assignment = await engRepo
        .createQueryBuilder('eng')
        .setLock('pessimistic_write')
        .where('eng.id = :assignmentId', { assignmentId })
        .andWhere('eng.departmentId = :departmentId', { departmentId })
        .getOne();

      if (!assignment) {
        throw new NotFoundError(
          'تعيين المهندس غير موجود في هذا القسم',
          'PRODUCTION_ENGINEER_ASSIGNMENT_NOT_FOUND'
        );
      }

      // Delete yard mappings
      await yardEngRepo.delete({ departmentEngineerId: assignment.id });

      // Deactivate assignment row
      assignment.isActive = false;
      await engRepo.save(assignment);

      return {
        success: true,
        message: 'تمت إزالة المهندس من قسم الإنتاج بنجاح',
      };
    });
  }

  /**
   * Lists active, non-deleted users for assignment selection (without passwords or secrets).
   */
  async listActiveUsersForAssignment(): Promise<ActiveUserSelectOption[]> {
    const userRepo = AppDataSource.getRepository(UserEntity);
    const users = await userRepo.find({
      where: { isActive: true, deletedAt: IsNull() },
      order: { fullName: 'ASC' },
      select: { id: true, fullName: true, phone: true },
    });

    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      phone: u.phone,
    }));
  }

  /**
   * Lists active, non-deleted yards belonging to a department.
   */
  async listDepartmentActiveYards(
    departmentId: string
  ): Promise<Array<{ id: string; name: string; code: string; capacity: number }>> {
    const yardRepo = AppDataSource.getRepository(ProductionYardEntity);
    const yards = await yardRepo.find({
      where: { departmentId, isActive: true, deletedAt: IsNull() },
      order: { name: 'ASC' },
      select: { id: true, name: true, code: true, capacity: true },
    });

    return yards.map((y) => ({
      id: y.id,
      name: y.name,
      code: y.code,
      capacity: y.capacity,
    }));
  }
}

export const productionTeamService = new ProductionTeamService();
