import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { InventoryCategoryEntity } from './inventory-category.entity.js';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto.js';
import { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto.js';
import { ListInventoryCategoriesQueryDto } from './dto/list-inventory-categories-query.dto.js';
import { CategoryOptionsQueryDto } from './dto/category-options-query.dto.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';
import { ConflictError } from '../../../common/errors/conflict.error.js';
import { BusinessRuleError } from '../../../common/errors/business-rule.error.js';

export interface CategoryTreeNodeDto {
  id: string;
  name: string;
  code: string;
  description: string | null;
  parentId: string | null;
  parentName?: string | null;
  isActive: boolean;
  hasChildren: boolean;
  childrenCount?: number;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryOptionDto {
  id: string;
  name: string;
  code: string;
  parentName: string | null;
}

export interface PaginatedCategoriesResult {
  items: CategoryTreeNodeDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class InventoryCategoryService {
  private categoryRepository: Repository<InventoryCategoryEntity>;

  constructor(private dataSource: DataSource = AppDataSource) {
    this.categoryRepository = this.dataSource.getRepository(InventoryCategoryEntity);
  }

  /**
   * Helper to check if inventory_product table exists for productCount subqueries.
   * If table doesn't exist yet (e.g. before migration 5), safely returns '0'.
   */
  private getProductCountSubquery(): string {
    return `(SELECT COUNT(1) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'inventory_product') > 0`;
  }

  /**
   * Lists root categories with pagination and child/product counts.
   */
  async listRoots(query: ListInventoryCategoriesQueryDto): Promise<PaginatedCategoriesResult> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const qb = this.categoryRepository.createQueryBuilder('c')
      .where('c.parent_id IS NULL')
      .andWhere('c.deleted_at IS NULL');

    if (query.search && query.search.trim() !== '') {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(c.name LIKE :term OR c.code LIKE :term)', { term });
    }

    const total = await qb.getCount();

    // Select aggregated columns
    const rawItems = await qb
      .addSelect((subQb) => {
        return subQb
          .select('COUNT(child.id)', 'children_count')
          .from(InventoryCategoryEntity, 'child')
          .where('child.parent_id = c.id')
          .andWhere('child.deleted_at IS NULL');
      }, 'children_count')
      .addSelect(`CASE WHEN ${this.getProductCountSubquery()} THEN (SELECT COUNT(1) FROM inventory_product p WHERE p.category_id = c.id AND p.deleted_at IS NULL) ELSE 0 END`, 'product_count')
      .orderBy('c.name', 'ASC')
      .skip(skip)
      .take(limit)
      .getRawAndEntities();

    const items: CategoryTreeNodeDto[] = rawItems.entities.map((entity, index) => {
      const raw = rawItems.raw[index];
      const childrenCount = parseInt(raw.children_count || '0', 10);
      const productCount = parseInt(raw.product_count || '0', 10);

      return {
        id: entity.id,
        name: entity.name,
        code: entity.code,
        description: entity.description,
        parentId: null,
        parentName: null,
        isActive: entity.isActive,
        hasChildren: childrenCount > 0,
        childrenCount,
        productCount,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Lists direct children of a given parent category.
   */
  async listChildren(parentId: string, query: ListInventoryCategoriesQueryDto): Promise<PaginatedCategoriesResult> {
    const parent = await this.categoryRepository.findOne({
      where: { id: parentId },
    });

    if (!parent) {
      throw new NotFoundError('الفئة الأب غير موجودة', 'INVENTORY_CATEGORY_NOT_FOUND');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const qb = this.categoryRepository.createQueryBuilder('c')
      .leftJoinAndSelect('c.parent', 'parent')
      .where('c.parent_id = :parentId', { parentId })
      .andWhere('c.deleted_at IS NULL');

    if (query.search && query.search.trim() !== '') {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(c.name LIKE :term OR c.code LIKE :term)', { term });
    }

    const total = await qb.getCount();

    const rawItems = await qb
      .addSelect((subQb) => {
        return subQb
          .select('COUNT(child.id)', 'children_count')
          .from(InventoryCategoryEntity, 'child')
          .where('child.parent_id = c.id')
          .andWhere('child.deleted_at IS NULL');
      }, 'children_count')
      .addSelect(`CASE WHEN ${this.getProductCountSubquery()} THEN (SELECT COUNT(1) FROM inventory_product p WHERE p.category_id = c.id AND p.deleted_at IS NULL) ELSE 0 END`, 'product_count')
      .orderBy('c.name', 'ASC')
      .skip(skip)
      .take(limit)
      .getRawAndEntities();

    const items: CategoryTreeNodeDto[] = rawItems.entities.map((entity, index) => {
      const raw = rawItems.raw[index];
      const childrenCount = parseInt(raw.children_count || '0', 10);
      const productCount = parseInt(raw.product_count || '0', 10);

      return {
        id: entity.id,
        name: entity.name,
        code: entity.code,
        description: entity.description,
        parentId: entity.parentId,
        parentName: entity.parent ? entity.parent.name : null,
        isActive: entity.isActive,
        hasChildren: childrenCount > 0,
        childrenCount,
        productCount,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Searches categories across the hierarchy.
   */
  async searchCategories(query: ListInventoryCategoriesQueryDto): Promise<PaginatedCategoriesResult> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const qb = this.categoryRepository.createQueryBuilder('c')
      .leftJoinAndSelect('c.parent', 'parent')
      .where('c.deleted_at IS NULL');

    if (query.search && query.search.trim() !== '') {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(c.name LIKE :term OR c.code LIKE :term)', { term });
    }

    const total = await qb.getCount();

    const rawItems = await qb
      .addSelect((subQb) => {
        return subQb
          .select('COUNT(child.id)', 'children_count')
          .from(InventoryCategoryEntity, 'child')
          .where('child.parent_id = c.id')
          .andWhere('child.deleted_at IS NULL');
      }, 'children_count')
      .addSelect(`CASE WHEN ${this.getProductCountSubquery()} THEN (SELECT COUNT(1) FROM inventory_product p WHERE p.category_id = c.id AND p.deleted_at IS NULL) ELSE 0 END`, 'product_count')
      .orderBy('c.name', 'ASC')
      .skip(skip)
      .take(limit)
      .getRawAndEntities();

    const items: CategoryTreeNodeDto[] = rawItems.entities.map((entity, index) => {
      const raw = rawItems.raw[index];
      const childrenCount = parseInt(raw.children_count || '0', 10);
      const productCount = parseInt(raw.product_count || '0', 10);

      return {
        id: entity.id,
        name: entity.name,
        code: entity.code,
        description: entity.description,
        parentId: entity.parentId,
        parentName: entity.parent ? entity.parent.name : null,
        isActive: entity.isActive,
        hasChildren: childrenCount > 0,
        childrenCount,
        productCount,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Bounded lookup options for product and category dropdown selectors.
   */
  async listOptions(query: CategoryOptionsQueryDto): Promise<CategoryOptionDto[]> {
    const limit = Math.max(1, Math.min(100, query.limit || 50));

    const qb = this.categoryRepository.createQueryBuilder('c')
      .leftJoinAndSelect('c.parent', 'parent')
      .where('c.is_active = :isActive', { isActive: true })
      .andWhere('c.deleted_at IS NULL');

    if (query.search && query.search.trim() !== '') {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(c.name LIKE :term OR c.code LIKE :term)', { term });
    }

    const categories = await qb
      .orderBy('c.name', 'ASC')
      .take(limit)
      .getMany();

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      parentName: c.parent ? c.parent.name : null,
    }));
  }

  /**
   * Gets category details by ID.
   */
  async getCategoryById(id: string): Promise<CategoryTreeNodeDto> {
    const qb = this.categoryRepository.createQueryBuilder('c')
      .leftJoinAndSelect('c.parent', 'parent')
      .where('c.id = :id', { id })
      .andWhere('c.deleted_at IS NULL');

    const rawItem = await qb
      .addSelect((subQb) => {
        return subQb
          .select('COUNT(child.id)', 'children_count')
          .from(InventoryCategoryEntity, 'child')
          .where('child.parent_id = c.id')
          .andWhere('child.deleted_at IS NULL');
      }, 'children_count')
      .addSelect(`CASE WHEN ${this.getProductCountSubquery()} THEN (SELECT COUNT(1) FROM inventory_product p WHERE p.category_id = c.id AND p.deleted_at IS NULL) ELSE 0 END`, 'product_count')
      .getRawAndEntities();

    if (!rawItem.entities || rawItem.entities.length === 0) {
      throw new NotFoundError('الفئة غير موجودة', 'INVENTORY_CATEGORY_NOT_FOUND');
    }

    const entity = rawItem.entities[0];
    const raw = rawItem.raw[0];
    const childrenCount = parseInt(raw.children_count || '0', 10);
    const productCount = parseInt(raw.product_count || '0', 10);

    return {
      id: entity.id,
      name: entity.name,
      code: entity.code,
      description: entity.description,
      parentId: entity.parentId,
      parentName: entity.parent ? entity.parent.name : null,
      isActive: entity.isActive,
      hasChildren: childrenCount > 0,
      childrenCount,
      productCount,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * Creates a new category.
   */
  async createCategory(dto: CreateInventoryCategoryDto): Promise<InventoryCategoryEntity> {
    const normalizedCode = dto.code.trim().toUpperCase();

    // Check code uniqueness including soft-deleted categories
    const existingCode = await this.categoryRepository.findOne({
      where: { code: normalizedCode },
      withDeleted: true,
    });

    if (existingCode) {
      throw new ConflictError('رمز الفئة مستخدم بالفعل', 'INVENTORY_CATEGORY_CODE_ALREADY_EXISTS');
    }

    const isActive = dto.isActive !== undefined ? dto.isActive : true;

    if (dto.parentId) {
      return this.dataSource.transaction(async (manager) => {
        const parentRepo = manager.getRepository(InventoryCategoryEntity);

        // Lock parent category row
        const parent = await parentRepo.findOne({
          where: { id: dto.parentId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!parent || parent.deletedAt) {
          throw new NotFoundError('الفئة الأب غير موجودة', 'INVENTORY_CATEGORY_PARENT_NOT_FOUND');
        }

        if (isActive && !parent.isActive) {
          throw new BusinessRuleError('لا يمكن إنشاء فئة نشطة تتبع لفئة أب معطلة', 'INVENTORY_CATEGORY_PARENT_INACTIVE');
        }

        const category = parentRepo.create({
          name: dto.name.trim(),
          code: normalizedCode,
          description: dto.description ? dto.description.trim() : null,
          parentId: parent.id,
          isActive,
        });

        return parentRepo.save(category);
      });
    }

    const category = this.categoryRepository.create({
      name: dto.name.trim(),
      code: normalizedCode,
      description: dto.description ? dto.description.trim() : null,
      parentId: null,
      isActive,
    });

    return this.categoryRepository.save(category);
  }

  /**
   * Updates an existing category.
   */
  async updateCategory(id: string, dto: UpdateInventoryCategoryDto): Promise<InventoryCategoryEntity> {
    return this.dataSource.transaction(async (manager) => {
      const categoryRepo = manager.getRepository(InventoryCategoryEntity);

      // Lock target category row
      const category = await categoryRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!category || category.deletedAt) {
        throw new NotFoundError('الفئة غير موجودة', 'INVENTORY_CATEGORY_NOT_FOUND');
      }

      const effectiveIsActive = dto.isActive !== undefined ? dto.isActive : category.isActive;

      // Handle parentId changes
      if (dto.parentId !== undefined) {
        if (dto.parentId === id) {
          throw new BusinessRuleError('لا يمكن للفئة أن تكون أباً لنفسها', 'INVENTORY_CATEGORY_CYCLE');
        }

        if (dto.parentId !== null) {
          // Detect cycles by traversing ancestry
          const visited = new Set<string>([dto.parentId]);
          let currParentId: string | null = dto.parentId;

          while (currParentId) {
            if (currParentId === id) {
              throw new BusinessRuleError('لا يمكن تعيين فئة فرعية كفئة أب (حلقة دائرية)', 'INVENTORY_CATEGORY_CYCLE');
            }

            const currCategory = await categoryRepo.findOne({
              where: { id: currParentId },
              withDeleted: true,
            });

            if (!currCategory || currCategory.deletedAt) {
              break;
            }

            currParentId = currCategory.parentId;
            if (currParentId) {
              if (visited.has(currParentId)) {
                throw new BusinessRuleError('هيكل الفئات يحتوي على تكرار دائري غير متسق', 'INVENTORY_CATEGORY_HIERARCHY_INCONSISTENT');
              }
              visited.add(currParentId);
            }
          }

          // Lock proposed parent
          const proposedParent = await categoryRepo.findOne({
            where: { id: dto.parentId },
            lock: { mode: 'pessimistic_write' },
          });

          if (!proposedParent || proposedParent.deletedAt) {
            throw new NotFoundError('الفئة الأب غير موجودة', 'INVENTORY_CATEGORY_PARENT_NOT_FOUND');
          }

          if (effectiveIsActive && !proposedParent.isActive) {
            throw new BusinessRuleError('لا يمكن ربط فئة نشطة بفئة أب معطلة', 'INVENTORY_CATEGORY_PARENT_INACTIVE');
          }

          category.parentId = proposedParent.id;
        } else {
          category.parentId = null;
        }
      }

      // Handle activation / deactivation rules
      if (dto.isActive !== undefined) {
        if (dto.isActive === true) {
          // If activating, parent if present must be active
          if (category.parentId) {
            const currentParent = await categoryRepo.findOne({
              where: { id: category.parentId },
              lock: { mode: 'pessimistic_write' },
            });

            if (!currentParent || currentParent.deletedAt || !currentParent.isActive) {
              throw new BusinessRuleError('لا يمكن تفعيل فئة تتبع لفئة أب معطلة', 'INVENTORY_CATEGORY_PARENT_INACTIVE');
            }
          }
        } else {
          // If deactivating, reject if has active children
          const activeChildrenCount = await categoryRepo.count({
            where: {
              parentId: id,
              isActive: true,
            },
          });

          if (activeChildrenCount > 0) {
            throw new BusinessRuleError('لا يمكن تعطيل فئة تحتوي على فئات فرعية نشطة', 'INVENTORY_CATEGORY_HAS_ACTIVE_CHILDREN');
          }

          // Reject if has active products
          const activeProductCountRaw = await manager.query(
            `SELECT COUNT(1) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'inventory_product'`
          );
          if (parseInt(activeProductCountRaw[0]?.cnt || '0', 10) > 0) {
            const productCountResult = await manager.query(
              `SELECT COUNT(1) as cnt FROM inventory_product WHERE category_id = ? AND is_active = 1 AND deleted_at IS NULL`,
              [id]
            );
            const activeProducts = parseInt(productCountResult[0]?.cnt || '0', 10);
            if (activeProducts > 0) {
              throw new BusinessRuleError('لا يمكن تعطيل فئة تحتوي على منتجات نشطة', 'INVENTORY_CATEGORY_HAS_ACTIVE_PRODUCTS');
            }
          }
        }

        category.isActive = dto.isActive;
      }

      if (dto.name !== undefined) {
        category.name = dto.name.trim();
      }

      if (dto.description !== undefined) {
        category.description = dto.description ? dto.description.trim() : null;
      }

      return categoryRepo.save(category);
    });
  }

  /**
   * Soft deletes (archives) a category.
   */
  async softDeleteCategory(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const categoryRepo = manager.getRepository(InventoryCategoryEntity);

      // Lock target category
      const category = await categoryRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!category || category.deletedAt) {
        throw new NotFoundError('الفئة غير موجودة', 'INVENTORY_CATEGORY_NOT_FOUND');
      }

      // Check for any non-deleted child categories
      const childrenCount = await categoryRepo.count({
        where: { parentId: id },
      });

      if (childrenCount > 0) {
        throw new BusinessRuleError('لا يمكن أرشفة فئة تحتوي على فئات فرعية', 'INVENTORY_CATEGORY_HAS_CHILDREN');
      }

      // Check for any non-deleted products
      const productTableCheck = await manager.query(
        `SELECT COUNT(1) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'inventory_product'`
      );
      if (parseInt(productTableCheck[0]?.cnt || '0', 10) > 0) {
        const productCountResult = await manager.query(
          `SELECT COUNT(1) as cnt FROM inventory_product WHERE category_id = ? AND deleted_at IS NULL`,
          [id]
        );
        const productsCount = parseInt(productCountResult[0]?.cnt || '0', 10);
        if (productsCount > 0) {
          throw new BusinessRuleError('لا يمكن أرشفة فئة مرتبطة بمنتجات', 'INVENTORY_CATEGORY_HAS_PRODUCTS');
        }
      }

      category.deletedAt = new Date();
      category.isActive = false;

      await categoryRepo.save(category);
    });
  }
}

export const inventoryCategoryService = new InventoryCategoryService();
