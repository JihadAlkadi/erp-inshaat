import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProductionYardEntity } from '../yard/production-yard.entity.js';
import { UserEntity } from '../../system/user/user.entity.js';
import { ProductionDepartmentEngineerEntity } from '../team/entities/production-department-engineer.entity.js';

@Entity('production_department')
export class ProductionDepartmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index('UQ_production_department_code', { unique: true })
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Index('UQ_production_department_head_user', { unique: true })
  @Column({ name: 'head_user_id', type: 'varchar', length: 36, nullable: true })
  headUserId!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index('IDX_production_department_is_active')
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Index('IDX_production_department_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => UserEntity, {
    eager: false,
    cascade: false,
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'head_user_id' })
  headUser?: UserEntity | null;

  @OneToMany(() => ProductionYardEntity, (yard) => yard.department, {
    eager: false,
    cascade: false,
  })
  yards!: ProductionYardEntity[];

  @OneToMany(() => ProductionDepartmentEngineerEntity, (eng) => eng.department, {
    eager: false,
    cascade: false,
  })
  engineers!: ProductionDepartmentEngineerEntity[];
}
