import { EntityManager, IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { PermissionEntity } from './permission.entity.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';

export class PermissionService {
  private readonly permissionRepository: Repository<PermissionEntity>;

  constructor(
    permissionRepo: Repository<PermissionEntity> = AppDataSource.getRepository(PermissionEntity)
  ) {
    this.permissionRepository = permissionRepo;
  }

  async listActivePermissions(manager?: EntityManager): Promise<PermissionEntity[]> {
    const repo = manager ? manager.getRepository(PermissionEntity) : this.permissionRepository;
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

  async getPermissionById(id: string, manager?: EntityManager): Promise<PermissionEntity> {
    const repo = manager ? manager.getRepository(PermissionEntity) : this.permissionRepository;
    const perm = await repo.findOne({
      where: {
        id,
        isActive: true,
        deletedAt: IsNull(),
      },
    });

    if (!perm) {
      throw new NotFoundError('الصلاحية غير موجودة أو غير نشطة', 'PERMISSION_NOT_FOUND');
    }

    return perm;
  }
}

export const permissionService = new PermissionService();
