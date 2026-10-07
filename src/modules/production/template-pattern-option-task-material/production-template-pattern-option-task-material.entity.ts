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
import { ProductionTemplatePatternOptionTaskEntity } from '../template-pattern-option-task/production-template-pattern-option-task.entity.js';
import { InventoryProductEntity } from '../../inventory/product/inventory-product.entity.js';
import { InventoryProductUnitEntity } from '../../inventory/product/inventory-product-unit.entity.js';

@Entity('production_template_pattern_option_task_material')
@Index('UQ_production_pattern_task_material_task_unit', ['taskId', 'productUnitId'], { unique: true })
export class ProductionTemplatePatternOptionTaskMaterialEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_production_pattern_task_mat_task_id')
  @Column({ name: 'task_id', type: 'varchar', length: 36 })
  taskId!: string;

  @Index('IDX_production_pattern_task_mat_product_id')
  @Column({ name: 'product_id', type: 'varchar', length: 36 })
  productId!: string;

  @Column({ name: 'product_unit_id', type: 'varchar', length: 36 })
  productUnitId!: string;

  @Column({ name: 'planned_quantity', type: 'decimal', precision: 18, scale: 6 })
  plannedQuantity!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => ProductionTemplatePatternOptionTaskEntity, (task) => task.plannedMaterials, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'task_id' })
  task?: ProductionTemplatePatternOptionTaskEntity;

  @ManyToOne(() => InventoryProductEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'product_id' })
  product?: InventoryProductEntity;

  @ManyToOne(() => InventoryProductUnitEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'product_unit_id' })
  productUnit?: InventoryProductUnitEntity;
}
