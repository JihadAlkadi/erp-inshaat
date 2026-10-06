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
import { StudiesTemplateSpecificationEntity } from './studies-template-specification.entity.js';
import { StudiesTemplateStageEntity } from './studies-template-stage.entity.js';

@Entity('studies_template')
export class StudiesTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'reference_number', type: 'varchar', length: 100, nullable: true })
  referenceNumber!: string | null;

  @Index('UQ_studies_template_code', { unique: true })
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index('IDX_studies_template_is_active')
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Index('IDX_studies_template_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => StudiesTemplateSpecificationEntity, (spec) => spec.template, {
    cascade: false,
    eager: false,
  })
  specifications?: StudiesTemplateSpecificationEntity[];

  @OneToMany(() => StudiesTemplateStageEntity, (stage) => stage.template, {
    cascade: false,
    eager: false,
  })
  stages?: StudiesTemplateStageEntity[];
}
