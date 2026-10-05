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

@Entity('inventory_category')
@Index('IDX_inventory_category_parent_id', ['parentId'])
@Index('IDX_inventory_category_is_active', ['isActive'])
@Index('IDX_inventory_category_deleted_at', ['deletedAt'])
export class InventoryCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, name: 'parent_id' })
  parentId!: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt!: Date | null;

  @ManyToOne(() => InventoryCategoryEntity, (category) => category.children, {
    nullable: true,
    eager: false,
    cascade: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_id' })
  parent!: InventoryCategoryEntity | null;

  @OneToMany(() => InventoryCategoryEntity, (category) => category.parent, {
    eager: false,
    cascade: false,
  })
  children!: InventoryCategoryEntity[];
}
