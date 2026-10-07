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
import { ProductionOrderEntity } from '../order/production-order.entity.js';
import { ProductionTemplateEntity } from '../template/production-template.entity.js';
import { ProductionOrderLinePatternSelectionEntity } from '../order-line-pattern-selection/production-order-line-pattern-selection.entity.js';

@Entity('production_order_line')
export class ProductionOrderLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_production_order_line_order_id')
  @Column({ name: 'order_id', type: 'varchar', length: 36 })
  orderId!: string;

  @Index('IDX_production_order_line_template_id')
  @Column({ name: 'template_id', type: 'varchar', length: 36 })
  templateId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'sort_order', type: 'int' })
  sortOrder!: number;

  @ManyToOne(() => ProductionOrderEntity, (order) => order.lines, {
    eager: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_id' })
  order?: ProductionOrderEntity;

  @ManyToOne(() => ProductionTemplateEntity, {
    eager: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'template_id' })
  template?: ProductionTemplateEntity;

  @OneToMany(
    () => ProductionOrderLinePatternSelectionEntity,
    (selection) => selection.line,
    {
      cascade: false,
      eager: false,
    }
  )
  patternSelections?: ProductionOrderLinePatternSelectionEntity[];

  @CreateDateColumn({ name: 'created_at', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', precision: 6 })
  updatedAt!: Date;

  @Index('IDX_production_order_line_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', precision: 6, nullable: true })
  deletedAt!: Date | null;
}
