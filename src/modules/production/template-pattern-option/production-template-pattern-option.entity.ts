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
import { ProductionTemplatePatternEntity } from '../template-pattern/production-template-pattern.entity.js';
import { ProductionTemplatePatternOptionTaskEntity } from '../template-pattern-option-task/production-template-pattern-option-task.entity.js';

@Entity('production_template_pattern_option')
export class ProductionTemplatePatternOptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_production_template_pattern_option_pattern_id')
  @Column({ name: 'pattern_id', type: 'varchar', length: 36 })
  patternId!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Index('IDX_production_template_pattern_option_sort_order')
  @Column({ name: 'sort_order', type: 'int' })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Index('IDX_production_template_pattern_option_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => ProductionTemplatePatternEntity, (pat) => pat.options, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'pattern_id' })
  pattern?: ProductionTemplatePatternEntity;

  @OneToMany(() => ProductionTemplatePatternOptionTaskEntity, (task) => task.option, {
    cascade: false,
    eager: false,
  })
  tasks?: ProductionTemplatePatternOptionTaskEntity[];
}
