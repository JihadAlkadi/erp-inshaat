import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { RoleEntity } from '../role/role.entity.js';
import { PermissionGrantEntity } from '../permission/permission-grant.entity.js';
import { SessionEntity } from '../session/session.entity.js';

@Entity('system_user')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName!: string;

  @Index('UQ_system_user_phone', { unique: true })
  @Column({ type: 'varchar', length: 20, unique: true })
  phone!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Index('IDX_system_user_role_id')
  @Column({ name: 'role_id', type: 'varchar', length: 36 })
  roleId!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => RoleEntity, (role) => role.users, {
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role!: RoleEntity;

  @OneToMany(() => PermissionGrantEntity, (grant) => grant.user, {
    eager: false,
    cascade: false,
  })
  permissionGrants!: PermissionGrantEntity[];

  @OneToMany(() => PermissionGrantEntity, (grant) => grant.grantedByUser, {
    eager: false,
    cascade: false,
  })
  grantedPermissions!: PermissionGrantEntity[];

  @OneToMany(() => SessionEntity, (session) => session.user, {
    eager: false,
    cascade: false,
  })
  sessions!: SessionEntity[];
}
