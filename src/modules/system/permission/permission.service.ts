import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { PermissionEntity } from './permission.entity.js';

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

  async findActivePermissionById(
    id: string,
    manager?: EntityManager
  ): Promise<PermissionEntity | null> {
    const repo = manager ? manager.getRepository(PermissionEntity) : this.permissionRepository;
    return repo.findOne({
      where: {
        id,
        isActive: true,
        deletedAt: IsNull(),
      },
    });
  }

  async findActivePermissionsByIds(
    ids: string[],
    manager?: EntityManager
  ): Promise<PermissionEntity[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    const repo = manager ? manager.getRepository(PermissionEntity) : this.permissionRepository;
    return repo.find({
      where: {
        id: In(ids),
        isActive: true,
        deletedAt: IsNull(),
      },
      order: {
        name: 'ASC',
      },
    });
  }
}

export const permissionService = new PermissionService();
