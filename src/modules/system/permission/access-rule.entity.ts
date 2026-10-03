import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PermissionGrantEntity } from './permission-grant.entity.js';

export type AccessRuleEffect = 'ALLOW' | 'DENY';

@Entity('system_access_rule')
export class AccessRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_system_access_rule_permission_grant_id')
  @Column({ name: 'permission_grant_id', type: 'varchar', length: 36 })
  permissionGrantId!: string;

  @Index('IDX_system_access_rule_effect')
  @Column({ type: 'varchar', length: 10 })
  effect!: AccessRuleEffect;

  @Index('IDX_system_access_rule_scope_type')
  @Column({ name: 'scope_type', type: 'varchar', length: 50 })
  scopeType!: string;

  @Column({ type: 'json', nullable: true })
  scope!: Record<string, unknown> | null;

  @Index('IDX_system_access_rule_is_active')
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => PermissionGrantEntity, (grant) => grant.accessRules, {
    eager: false,
    cascade: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'permission_grant_id' })
  permissionGrant!: PermissionGrantEntity;
}
