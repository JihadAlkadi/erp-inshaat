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
import { InventoryProductEntity } from './inventory-product.entity.js';
import { InventoryProductUnitSpecification } from './inventory-product.types.js';

@Entity('inventory_product_unit')
@Index('UQ_inventory_product_unit_product_name', ['productId', 'name'], { unique: true })
@Index('UQ_inventory_product_unit_barcode', ['barcode'], { unique: true })
@Index('IDX_inventory_product_unit_product_id', ['productId'])
@Index('IDX_inventory_product_unit_equivalent_to_unit_id', ['equivalentToUnitId'])
@Index('IDX_inventory_product_unit_deleted_at', ['deletedAt'])
export class InventoryProductUnitEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'product_id', type: 'varchar', length: 36, nullable: false })
  productId!: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: false })
  price!: string;

  @Column({ name: 'equivalent_to_unit_id', type: 'varchar', length: 36, nullable: true })
  equivalentToUnitId!: string | null;

  @Column({ name: 'conversion_quantity', type: 'decimal', precision: 18, scale: 6, nullable: true })
  conversionQuantity!: string | null;

  @Column({ type: 'json', nullable: true })
  specifications!: InventoryProductUnitSpecification[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => InventoryProductEntity, (product) => product.units, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product!: InventoryProductEntity;

  @ManyToOne(() => InventoryProductUnitEntity, (unit) => unit.dependentUnits, {
    nullable: true,
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'equivalent_to_unit_id' })
  equivalentToUnit!: InventoryProductUnitEntity | null;

  @OneToMany(() => InventoryProductUnitEntity, (unit) => unit.equivalentToUnit, {
    eager: false,
    cascade: false,
  })
  dependentUnits!: InventoryProductUnitEntity[];
}
