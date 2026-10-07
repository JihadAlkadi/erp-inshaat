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
import { ProductionOrderLineEntity } from '../order-line/production-order-line.entity.js';
import { ProductionTemplatePatternEntity } from '../template-pattern/production-template-pattern.entity.js';
import { ProductionTemplatePatternOptionEntity } from '../template-pattern-option/production-template-pattern-option.entity.js';

@Entity('production_order_line_pattern_selection')
@Index('UQ_prod_order_line_pattern', ['orderLineId', 'templatePatternId'], {
  unique: true,
})
export class ProductionOrderLinePatternSelectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_prod_order_line_pattern_sel_line')
  @Column({ name: 'order_line_id', type: 'varchar', length: 36 })
  orderLineId!: string;

  @Index('IDX_prod_order_line_pattern_sel_pattern')
  @Column({ name: 'template_pattern_id', type: 'varchar', length: 36 })
  templatePatternId!: string;

  @Index('IDX_prod_order_line_pattern_sel_option')
  @Column({ name: 'selected_option_id', type: 'varchar', length: 36 })
  selectedOptionId!: string;

  @ManyToOne(() => ProductionOrderLineEntity, (line) => line.patternSelections, {
    eager: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_line_id' })
  line?: ProductionOrderLineEntity;

  @ManyToOne(() => ProductionTemplatePatternEntity, {
    eager: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'template_pattern_id' })
  templatePattern?: ProductionTemplatePatternEntity;

  @ManyToOne(() => ProductionTemplatePatternOptionEntity, {
    eager: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'selected_option_id' })
  selectedOption?: ProductionTemplatePatternOptionEntity;

  @CreateDateColumn({ name: 'created_at', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', precision: 6 })
  updatedAt!: Date;
}
