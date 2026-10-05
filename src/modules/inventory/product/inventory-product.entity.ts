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
import { InventoryCategoryEntity } from '../category/inventory-category.entity.js';
import { InventoryProductUnitEntity } from './inventory-product-unit.entity.js';

@Entity('inventory_product')
@Index('UQ_inventory_product_code', ['code'], { unique: true })
@Index('IDX_inventory_product_category_id', ['categoryId'])
@Index('IDX_inventory_product_base_unit_id', ['baseUnitId'])
@Index('IDX_inventory_product_is_active', ['isActive'])
@Index('IDX_inventory_product_deleted_at', ['deletedAt'])
export class InventoryProductEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'category_id', type: 'varchar', length: 36, nullable: true })
  categoryId!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: false })
  name!: string;

  @Column({ type: 'varchar', length: 50, nullable: false, unique: true })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'location_name', type: 'varchar', length: 255, nullable: true })
  locationName!: string | null;

  @Column({ name: 'base_unit_id', type: 'varchar', length: 36, nullable: true })
  baseUnitId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => InventoryCategoryEntity, {
    nullable: true,
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'category_id' })
  category!: InventoryCategoryEntity | null;

  @OneToMany(() => InventoryProductUnitEntity, (unit) => unit.product, {
    eager: false,
    cascade: false,
  })
  units!: InventoryProductUnitEntity[];

  @ManyToOne(() => InventoryProductUnitEntity, {
    nullable: true,
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'base_unit_id' })
  baseUnit!: InventoryProductUnitEntity | null;
}
