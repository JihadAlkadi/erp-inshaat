import { DataSourceOptions } from 'typeorm';
import { envConfig } from './env.config.js';
import { RoleEntity } from '../modules/system/role/role.entity.js';
import { UserEntity } from '../modules/system/user/user.entity.js';
import { PermissionEntity } from '../modules/system/permission/permission.entity.js';
import { PermissionGrantEntity } from '../modules/system/permission-grant/permission-grant.entity.js';
import { AccessRuleEntity } from '../modules/system/access-rule/access-rule.entity.js';
import { SessionEntity } from '../modules/system/session/session.entity.js';
import { ProductionDepartmentEntity } from '../modules/production/department/production-department.entity.js';
import { ProductionYardEntity } from '../modules/production/yard/production-yard.entity.js';
import { CreateSystemCoreTables1710000000000 } from '../database/migrations/1710000000000-CreateSystemCoreTables.js';
import { CreateSystemSessionTable1710000000001 } from '../database/migrations/1710000000001-CreateSystemSessionTable.js';
import { CreateProductionDepartmentsAndYards1710000000002 } from '../database/migrations/1710000000002-CreateProductionDepartmentsAndYards.js';

export const databaseConfig: DataSourceOptions = {
  type: 'mysql',
  host: envConfig.db.host,
  port: envConfig.db.port,
  username: envConfig.db.username,
  password: envConfig.db.password,
  database: envConfig.db.database,
  synchronize: false,
  logging: envConfig.nodeEnv === 'development' ? ['error', 'warn'] : false,
  entities: [
    RoleEntity,
    UserEntity,
    PermissionEntity,
    PermissionGrantEntity,
    AccessRuleEntity,
    SessionEntity,
    ProductionDepartmentEntity,
    ProductionYardEntity,
  ],
  migrations: [
    CreateSystemCoreTables1710000000000,
    CreateSystemSessionTable1710000000001,
    CreateProductionDepartmentsAndYards1710000000002,
  ],
  subscribers: [],
};

