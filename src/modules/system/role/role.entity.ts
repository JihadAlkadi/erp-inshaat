import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserEntity } from '../user/user.entity.js';
import { PermissionGrantEntity } from '../permission-grant/permission-grant.entity.js';

@Entity('system_role')
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index('UQ_system_role_code', { unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => UserEntity, (user) => user.role, {
    eager: false,
    cascade: false,
  })
  users!: UserEntity[];

  @OneToMany(() => PermissionGrantEntity, (grant) => grant.role, {
    eager: false,
    cascade: false,
  })
  permissionGrants!: PermissionGrantEntity[];
}
