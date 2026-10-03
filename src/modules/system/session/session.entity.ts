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
import { UserEntity } from '../user/user.entity.js';

@Entity('system_session')
@Index('IDX_system_session_user_is_active', ['userId', 'isActive'])
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_system_session_user_id')
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId!: string;

  @Index('UQ_system_session_token_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash!: string;

  @Column({ name: 'device_type', type: 'varchar', length: 50, nullable: true })
  deviceType!: string | null;

  @Column({ name: 'device_name', type: 'varchar', length: 150, nullable: true })
  deviceName!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  browser!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  os!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'last_used_at', type: 'datetime', precision: 6 })
  lastUsedAt!: Date;

  @Index('IDX_system_session_expires_at')
  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Index('IDX_system_session_is_active')
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'revoked_at', type: 'datetime', precision: 6, nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoked_reason', type: 'text', nullable: true })
  revokedReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.sessions, {
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;
}
