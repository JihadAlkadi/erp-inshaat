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
import { ProductionDepartmentEntity } from '../../department/production-department.entity.js';
import { UserEntity } from '../../../system/user/user.entity.js';
import { ProductionYardEngineerEntity } from './production-yard-engineer.entity.js';

@Entity('production_department_engineer')
export class ProductionDepartmentEngineerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_production_department_engineer_dept_id')
  @Column({ name: 'department_id', type: 'varchar', length: 36 })
  departmentId!: string;

  @Index('UQ_production_department_engineer_user', { unique: true })
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId!: string;

  @Index('IDX_production_department_engineer_is_active')
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => ProductionDepartmentEntity, (dept) => dept.engineers, {
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'department_id' })
  department!: ProductionDepartmentEntity;

  @ManyToOne(() => UserEntity, {
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @OneToMany(() => ProductionYardEngineerEntity, (ye) => ye.departmentEngineer, {
    eager: false,
    cascade: false,
  })
  yardMappings!: ProductionYardEngineerEntity[];
}
