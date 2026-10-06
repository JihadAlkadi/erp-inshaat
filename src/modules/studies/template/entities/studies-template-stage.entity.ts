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
import { StudiesTemplateEntity } from './studies-template.entity.js';
import { ProductionDepartmentEntity } from '../../../production/department/production-department.entity.js';
import { StudiesTemplateStageMaterialEntity } from './studies-template-stage-material.entity.js';

@Entity('studies_template_stage')
export class StudiesTemplateStageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_studies_template_stage_template_id')
  @Column({ name: 'template_id', type: 'varchar', length: 36 })
  templateId!: string;

  @Index('IDX_studies_template_stage_department_id')
  @Column({ name: 'department_id', type: 'varchar', length: 36 })
  departmentId!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index('IDX_studies_template_stage_sort_order')
  @Column({ name: 'sort_order', type: 'int' })
  sortOrder!: number;

  @Column({ name: 'estimated_duration_minutes', type: 'int', nullable: true })
  estimatedDurationMinutes!: number | null;

  @Column({ name: 'estimated_cost', type: 'decimal', precision: 18, scale: 4, nullable: true })
  estimatedCost!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Index('IDX_studies_template_stage_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => StudiesTemplateEntity, (tmpl) => tmpl.stages, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'template_id' })
  template?: StudiesTemplateEntity;

  @ManyToOne(() => ProductionDepartmentEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'department_id' })
  department?: ProductionDepartmentEntity;

  @OneToMany(() => StudiesTemplateStageMaterialEntity, (mat) => mat.stage, {
    cascade: false,
    eager: false,
  })
  plannedMaterials?: StudiesTemplateStageMaterialEntity[];
}
