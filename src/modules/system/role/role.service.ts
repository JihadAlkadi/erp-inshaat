import { Repository, IsNull, EntityManager } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { RoleEntity } from './role.entity.js';

export class RoleService {
  private readonly roleRepository: Repository<RoleEntity>;

  constructor(roleRepo: Repository<RoleEntity> = AppDataSource.getRepository(RoleEntity)) {
    this.roleRepository = roleRepo;
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
