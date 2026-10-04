import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProductionDepartmentEngineerEntity } from './production-department-engineer.entity.js';
import { ProductionYardEntity } from '../../yard/production-yard.entity.js';

@Entity('production_yard_engineer')
@Index('UQ_production_yard_engineer_assignment', ['departmentEngineerId', 'yardId'], { unique: true })
export class ProductionYardEngineerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_production_yard_engineer_dept_eng_id')
  @Column({ name: 'department_engineer_id', type: 'varchar', length: 36 })
  departmentEngineerId!: string;

  @Index('IDX_production_yard_engineer_yard_id')
  @Column({ name: 'yard_id', type: 'varchar', length: 36 })
  yardId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => ProductionDepartmentEngineerEntity, (de) => de.yardMappings, {
    eager: false,
    cascade: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'department_engineer_id' })
  departmentEngineer!: ProductionDepartmentEngineerEntity;

  @ManyToOne(() => ProductionYardEntity, {
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'yard_id' })
  yard!: ProductionYardEntity;
}
