import { EntityManager, IsNull } from 'typeorm';
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
  AvailableHeadUserSelectOption,
  AvailableEngineerSelectOption,
} from './production-team.types.js';
import { CreateProductionEngineerAssignmentDto } from './dto/create-production-engineer-assignment.dto.js';
import { UpdateProductionEngineerYardsDto } from './dto/update-production-engineer-yards.dto.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

/**
 * Shared Helper: Asserts that a user is available to become a Department Head.
 * Follows lock protocol: Locks the User row with pessimistic_write.
 * Invariants enforced:
 * 1. User must exist, be active, and non-deleted.
 * 2. User must not be head of any other non-deleted Production Department.
 * 3. User must not have an active engineer assignment anywhere.
 * 4. User must have zero yard mappings (fails closed on stale mappings).
 */
export async function assertUserAvailableAsDepartmentHead(
  manager: EntityManager,
  userId: string,
  options?: { currentDepartmentId?: string }
): Promise<UserEntity> {
  const userRepo = manager.getRepository(UserEntity);
  const deptRepo = manager.getRepository(ProductionDepartmentEntity);
  const engRepo = manager.getRepository(ProductionDepartmentEngineerEntity);
  const yardEngRepo = manager.getRepository(ProductionYardEngineerEntity);

  // 1. Lock User (Protocol step 2)
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

  // 2. Verify target User is not head of another non-deleted Department
  const otherDeptQb = deptRepo
    .createQueryBuilder('dept')
    .where('dept.headUserId = :userId', { userId: user.id })
    .andWhere('dept.deletedAt IS NULL');

  if (options?.currentDepartmentId) {
    otherDeptQb.andWhere('dept.id != :currentDepartmentId', { currentDepartmentId: options.currentDepartmentId });
  }

  const existingHeadDept = await otherDeptQb.getOne();
  if (existingHeadDept) {
    throw new ConflictError(
      'المستخدم المحدد هو رئيس قسم إنتاج آخر ولا يمكن تعيينه رئيساً لأكثر من قسم',
      'PRODUCTION_USER_ALREADY_DEPARTMENT_HEAD'
    );
  }

  // 3. Invariant: Head and Engineer roles are mutually exclusive (cannot be active engineer anywhere)
  const activeEng = await engRepo
    .createQueryBuilder('eng')
    .where('eng.userId = :userId', { userId: user.id })
    .andWhere('eng.isActive = :isActive', { isActive: true })
    .getOne();

  if (activeEng) {
    throw new BusinessRuleError(
      'لا يمكن تعيين مهندس ساحات حالي كرئيس قسم قبل إزالة تعيينه الهندسي',
      'PRODUCTION_ENGINEER_CANNOT_BE_DEPARTMENT_HEAD'
    );
  }

  // 4. Invariant: Fail closed on existing/stale yard mappings
  const yardMapping = await yardEngRepo
    .createQueryBuilder('pye')
    .innerJoin('pye.departmentEngineer', 'pde')
    .where('pde.userId = :userId', { userId: user.id })
    .getOne();

  if (yardMapping) {
    throw new BusinessRuleError(
      'يوجد ارتباطات ساحات سابقة غير معالجة لهذا المستخدم، تعذر تعيينه رئيساً للقسم',
      'PRODUCTION_USER_HAS_EXISTING_YARD_ASSIGNMENTS'
    );
  }

  return user;
}

export class ProductionTeamService {
  /**
   * Retrieves the department team details (Head + Engineers + Yards) in an optimized batched query without N+1.
   * Soft-deleted (archived) users remain visible with appropriate flags and identities.
   */
  async getDepartmentTeam(departmentId: string): Promise<DepartmentTeamOutput> {
    const deptRepo = AppDataSource.getRepository(ProductionDepartmentEntity);
    const userRepo = AppDataSource.getRepository(UserEntity);

    const department = await deptRepo
      .createQueryBuilder('dept')
      .where('dept.id = :departmentId', { departmentId })
      .andWhere('dept.deletedAt IS NULL')
      .getOne();

    if (!department) {
      throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
    }

    let head: SafeHeadUserOutput | null = null;
    if (department.headUserId) {
      const headUser = await userRepo
        .createQueryBuilder('u')
        .withDeleted()
        .where('u.id = :id', { id: department.headUserId })
        .select(['u.id', 'u.fullName', 'u.phone', 'u.isActive', 'u.deletedAt'])
        .getOne();

      if (headUser) {
        head = {
          id: headUser.id,
          fullName: headUser.fullName,
          phone: headUser.phone,
          isActive: Boolean(headUser.isActive && !headUser.deletedAt),
          isArchived: Boolean(headUser.deletedAt),
        };
      }
    }

    // Fetch active engineer assignments with yard mappings in a joined query
    const engRepo = AppDataSource.getRepository(ProductionDepartmentEngineerEntity);
    const engineerRows = await engRepo
      .createQueryBuilder('deptEng')
      .leftJoinAndSelect('deptEng.yardMappings', 'yardMapping')
      .leftJoinAndSelect('yardMapping.yard', 'yard')
      .where('deptEng.departmentId = :departmentId', { departmentId })
      .andWhere('deptEng.isActive = :isActive', { isActive: true })
      .getMany();

    // Fetch related users including soft-deleted ones in a single batched query without N+1
    const userIds = [...new Set(engineerRows.map((e) => e.userId))];
    const userMap = new Map<string, UserEntity>();
    if (userIds.length > 0) {
      const users = await userRepo
        .createQueryBuilder('u')
        .withDeleted()
        .where('u.id IN (:...userIds)', { userIds })
        .select(['u.id', 'u.fullName', 'u.phone', 'u.isActive', 'u.deletedAt'])
        .getMany();

      for (const u of users) {
        userMap.set(u.id, u);
      }
    }

    const engineers: SafeEngineerAssignmentOutput[] = engineerRows
      .map((eng) => {
        const user = userMap.get(eng.userId);
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
          fullName: user?.fullName || 'مستخدم غير معروف',
          phone: user?.phone || '',
          userIsActive: Boolean(user?.isActive && !user?.deletedAt),
          userIsArchived: Boolean(user?.deletedAt),
          assignmentIsActive: eng.isActive,
          yards,
          createdAt: eng.createdAt,
          updatedAt: eng.updatedAt,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));

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
   * Enforces lock order: Department -> User.
   * Enforces that a user can head at most one non-deleted Production Department,
   * is not an active engineer, and has no yard mappings.
   */
  async setDepartmentHead(
    departmentId: string,
    userId: string
  ): Promise<{ success: boolean; message: string; head: SafeHeadUserOutput }> {
    return await AppDataSource.transaction(async (manager: EntityManager) => {
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);

      // 1. Lock Department (Protocol step 1)
      const department = await deptRepo
        .createQueryBuilder('dept')
        .setLock('pessimistic_write')
        .where('dept.id = :departmentId', { departmentId })
        .andWhere('dept.deletedAt IS NULL')
        .getOne();

      if (!department) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      // 2. Lock User & Validate availability (Protocol step 2)
      const user = await assertUserAvailableAsDepartmentHead(manager, userId, { currentDepartmentId: departmentId });

      // If already head of current department, return idempotently
      if (department.headUserId === user.id) {
        return {
          success: true,
          message: 'تم تعيين رئيس قسم الإنتاج بنجاح',
          head: {
            id: user.id,
            fullName: user.fullName,
            phone: user.phone,
            isActive: user.isActive,
            isArchived: false,
          },
        };
      }

      try {
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
            isArchived: false,
          },
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
            'المستخدم المحدد هو رئيس قسم إنتاج آخر ولا يمكن تعيينه رئيساً لأكثر من قسم',
            'PRODUCTION_USER_ALREADY_DEPARTMENT_HEAD'
          );
        }
        throw err;
      }
    });
  }

  /**
   * Adds an engineer assignment to the department with all yard mappings in a single transaction.
   * Lock Order: Department -> User -> Assignment -> Yards (sorted).
   * Enforces candidate rules: active, non-deleted, not a department head, no active engineer assignment, no existing mappings.
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

      // 1. Lock Department (Protocol step 1)
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

      // 2. Lock User (Protocol step 2)
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

      // Invariant: Department head cannot be assigned as an engineer (mutually exclusive)
      const isHead = await deptRepo
        .createQueryBuilder('dept')
        .where('dept.headUserId = :userId', { userId: user.id })
        .andWhere('dept.deletedAt IS NULL')
        .getOne();

      if (isHead) {
        throw new BusinessRuleError(
          'لا يمكن إسناد رئيس قسم إنتاج كمهندس ساحات',
          'PRODUCTION_DEPARTMENT_HEAD_CANNOT_BE_ENGINEER'
        );
      }

      // 3. Lock & check existing engineer record across all production departments (Protocol step 3)
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
        // Check for unexpected stale yard mappings (Fail Closed)
        const staleMappingsCount = await yardEngRepo.count({
          where: { departmentEngineerId: existingAssignment.id },
        });

        if (staleMappingsCount > 0) {
          throw new BusinessRuleError(
            'يوجد ارتباطات ساحات سابقة غير معالجة لهذا المهندس، تعذر إعادة الإسناد',
            'PRODUCTION_ENGINEER_HAS_EXISTING_YARD_ASSIGNMENTS'
          );
        }

        // Clean reuse of existing assignment record
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

      // 4. Validate & Lock Target Yards (Protocol step 4: Sorted IDs to prevent deadlocks)
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

        // Delete any stale mappings (safety guard)
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
          userIsArchived: false,
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
   * Lock Order: Department -> User -> Assignment -> Yards (sorted).
   */
  async updateEngineerYards(
    departmentId: string,
    assignmentId: string,
    dto: UpdateProductionEngineerYardsDto
  ): Promise<SafeEngineerAssignmentOutput> {
    return await AppDataSource.transaction(async (manager: EntityManager) => {
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);
      const userRepo = manager.getRepository(UserEntity);
      const engRepo = manager.getRepository(ProductionDepartmentEngineerEntity);
      const yardRepo = manager.getRepository(ProductionYardEntity);
      const yardEngRepo = manager.getRepository(ProductionYardEngineerEntity);

      // Pre-read assignment to obtain userId for ordered locking
      const unverifiedAssignment = await engRepo.findOne({
        where: { id: assignmentId, departmentId, isActive: true },
        select: { id: true, userId: true, departmentId: true, isActive: true },
      });

      if (!unverifiedAssignment) {
        throw new NotFoundError(
          'تعيين المهندس غير موجود أو غير نشط في هذا القسم',
          'PRODUCTION_ENGINEER_ASSIGNMENT_NOT_FOUND'
        );
      }

      // 1. Lock Department (Protocol step 1)
      const department = await deptRepo
        .createQueryBuilder('dept')
        .setLock('pessimistic_write')
        .where('dept.id = :departmentId', { departmentId })
        .andWhere('dept.deletedAt IS NULL')
        .getOne();

      if (!department) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      // 2. Lock User (Protocol step 2)
      const user = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId: unverifiedAssignment.userId })
        .getOne();

      // 3. Lock Assignment & Revalidate (Protocol step 3)
      const assignment = await engRepo
        .createQueryBuilder('eng')
        .setLock('pessimistic_write')
        .where('eng.id = :assignmentId', { assignmentId })
        .andWhere('eng.departmentId = :departmentId', { departmentId })
        .andWhere('eng.userId = :userId', { userId: unverifiedAssignment.userId })
        .andWhere('eng.isActive = :isActive', { isActive: true })
        .getOne();

      if (!assignment) {
        throw new NotFoundError(
          'تعيين المهندس غير موجود أو غير نشط في هذا القسم',
          'PRODUCTION_ENGINEER_ASSIGNMENT_NOT_FOUND'
        );
      }

      // 4. Validate & Lock Target Yards (Protocol step 4: Sorted IDs)
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

      // 5. Replace mappings atomically
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

      const resolvedUser = user;

      return {
        assignmentId: assignment.id,
        userId: assignment.userId,
        fullName: resolvedUser?.fullName || '',
        phone: resolvedUser?.phone || '',
        userIsActive: Boolean(resolvedUser?.isActive && !resolvedUser?.deletedAt),
        userIsArchived: Boolean(resolvedUser?.deletedAt),
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
   * Lock Order: Department -> User -> Assignment.
   */
  async removeEngineerFromDepartment(
    departmentId: string,
    assignmentId: string
  ): Promise<{ success: boolean; message: string }> {
    return await AppDataSource.transaction(async (manager: EntityManager) => {
      const deptRepo = manager.getRepository(ProductionDepartmentEntity);
      const userRepo = manager.getRepository(UserEntity);
      const engRepo = manager.getRepository(ProductionDepartmentEngineerEntity);
      const yardEngRepo = manager.getRepository(ProductionYardEngineerEntity);

      // Pre-read assignment to obtain userId for ordered locking
      const unverifiedAssignment = await engRepo.findOne({
        where: { id: assignmentId, departmentId },
        select: { id: true, userId: true, departmentId: true, isActive: true },
      });

      if (!unverifiedAssignment) {
        throw new NotFoundError(
          'تعيين المهندس غير موجود في هذا القسم',
          'PRODUCTION_ENGINEER_ASSIGNMENT_NOT_FOUND'
        );
      }

      // 1. Lock Department (Protocol step 1)
      const department = await deptRepo
        .createQueryBuilder('dept')
        .setLock('pessimistic_write')
        .where('dept.id = :departmentId', { departmentId })
        .andWhere('dept.deletedAt IS NULL')
        .getOne();

      if (!department) {
        throw new NotFoundError('قسم الإنتاج غير موجود', 'PRODUCTION_DEPARTMENT_NOT_FOUND');
      }

      // 2. Lock User (Protocol step 2)
      await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId: unverifiedAssignment.userId })
        .getOne();

      // 3. Lock Assignment & Revalidate (Protocol step 3)
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

      // 4. Delete yard mappings
      await yardEngRepo.delete({ departmentEngineerId: assignment.id });

      // 5. Deactivate assignment row
      assignment.isActive = false;
      await engRepo.save(assignment);

      return {
        success: true,
        message: 'تمت إزالة المهندس من قسم الإنتاج بنجاح',
      };
    });
  }

  /**
   * Lists available users for Department Head selection.
   * Returns active, non-deleted users who:
   * - Are not Department Heads of ANY non-deleted department (current or other).
   * - Are not active Engineers in ANY department.
   * - Have no current or stale Yard mappings.
   */
  async listAvailableDepartmentHeadUsers(): Promise<AvailableHeadUserSelectOption[]> {
    const userRepo = AppDataSource.getRepository(UserEntity);
    const qb = userRepo
      .createQueryBuilder('user')
      .where('user.isActive = :isActive', { isActive: true })
      .andWhere('user.deletedAt IS NULL')
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM production_department pd
          WHERE pd.head_user_id = user.id
            AND pd.deleted_at IS NULL
        )`
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM production_department_engineer pde
          WHERE pde.user_id = user.id
            AND pde.is_active = 1
        )`
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM production_yard_engineer pye
          INNER JOIN production_department_engineer pde2 ON pye.department_engineer_id = pde2.id
          WHERE pde2.user_id = user.id
        )`
      )
      .orderBy('user.fullName', 'ASC')
      .select(['user.id', 'user.fullName', 'user.phone']);

    const users = await qb.getMany();

    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      phone: u.phone,
    }));
  }

  /**
   * Lists available users for Engineer assignment.
   * Returns active, non-deleted users who:
   * - Are not Department Heads of any non-deleted department.
   * - Have no active engineer assignments in any department (neither target nor other).
   * - Have no current or stale yard mappings in any department.
   */
  async listAvailableEngineerUsers(
    _targetDepartmentId?: string
  ): Promise<AvailableEngineerSelectOption[]> {
    const userRepo = AppDataSource.getRepository(UserEntity);
    const qb = userRepo
      .createQueryBuilder('user')
      .where('user.isActive = :isActive', { isActive: true })
      .andWhere('user.deletedAt IS NULL')
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM production_department pd
          WHERE pd.head_user_id = user.id
            AND pd.deleted_at IS NULL
        )`
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM production_department_engineer pde
          WHERE pde.user_id = user.id
            AND pde.is_active = 1
        )`
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM production_yard_engineer pye
          INNER JOIN production_department_engineer pde2 ON pye.department_engineer_id = pde2.id
          WHERE pde2.user_id = user.id
        )`
      )
      .orderBy('user.fullName', 'ASC')
      .select(['user.id', 'user.fullName', 'user.phone']);

    const users = await qb.getMany();

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
