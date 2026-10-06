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
import { StudiesTemplateStageEntity } from './studies-template-stage.entity.js';
import { InventoryProductEntity } from '../../../inventory/product/inventory-product.entity.js';
import { InventoryProductUnitEntity } from '../../../inventory/product/inventory-product-unit.entity.js';

@Entity('studies_template_stage_material')
@Index('UQ_studies_stage_material_stage_unit', ['stageId', 'productUnitId'], { unique: true })
export class StudiesTemplateStageMaterialEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_studies_stage_mat_stage_id')
  @Column({ name: 'stage_id', type: 'varchar', length: 36 })
  stageId!: string;

  @Index('IDX_studies_stage_mat_product_id')
  @Column({ name: 'product_id', type: 'varchar', length: 36 })
  productId!: string;

  @Index('IDX_studies_stage_mat_unit_id')
  @Column({ name: 'product_unit_id', type: 'varchar', length: 36 })
  productUnitId!: string;

  @Column({ name: 'planned_quantity', type: 'decimal', precision: 18, scale: 6 })
  plannedQuantity!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => StudiesTemplateStageEntity, (stage) => stage.plannedMaterials, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'stage_id' })
  stage?: StudiesTemplateStageEntity;

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
