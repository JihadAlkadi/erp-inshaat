import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { PermissionEntity } from './permission.entity.js';
import { UserEntity } from '../user/user.entity.js';
import { RoleEntity } from '../role/role.entity.js';
import { AccessRuleEntity } from './access-rule.entity.js';

@Entity('system_permission_grant')
export class PermissionGrantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_system_permission_grant_permission_id')
  @Column({ name: 'permission_id', type: 'varchar', length: 36 })
  permissionId!: string;

  @Index('IDX_system_permission_grant_user_id')
  @Column({ name: 'user_id', type: 'varchar', length: 36, nullable: true })
  userId!: string | null;

  @Index('IDX_system_permission_grant_role_id')
  @Column({ name: 'role_id', type: 'varchar', length: 36, nullable: true })
  roleId!: string | null;

  @Column({ name: 'can_delegate', type: 'boolean', default: false })
  canDelegate!: boolean;

  @Index('IDX_system_permission_grant_granted_by')
  @Column({ name: 'granted_by', type: 'varchar', length: 36, nullable: true })
  grantedBy!: string | null;

  @Column({
    name: 'granted_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  grantedAt!: Date;

  @Index('IDX_system_permission_grant_expires_at')
  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @Index('IDX_system_permission_grant_is_active')
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => PermissionEntity, (permission) => permission.permissionGrants, {
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'permission_id' })
  permission!: PermissionEntity;

  @ManyToOne(() => UserEntity, (user) => user.permissionGrants, {
    eager: false,
    cascade: false,
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity | null;

  @ManyToOne(() => RoleEntity, (role) => role.permissionGrants, {
    eager: false,
    cascade: false,
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role!: RoleEntity | null;

  @ManyToOne(() => UserEntity, (user) => user.grantedPermissions, {
    eager: false,
    cascade: false,
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'granted_by' })
  grantedByUser!: UserEntity | null;

  @OneToMany(() => AccessRuleEntity, (rule) => rule.permissionGrant, {
    eager: false,
    cascade: false,
  })
  accessRules!: AccessRuleEntity[];
}
