import { EntityManager, IsNull, Repository } from 'typeorm';
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
}

export const permissionService = new PermissionService();
