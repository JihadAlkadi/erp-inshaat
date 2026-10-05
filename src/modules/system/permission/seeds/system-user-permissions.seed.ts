import { EntityManager } from 'typeorm';
import { PermissionEntity } from '../permission.entity.js';
import { SystemPermission } from '../constants/system-permission.enum.js';

interface PermissionDefinition {
  name: SystemPermission;
  description: string;
}

const SYSTEM_USER_PERMISSIONS: PermissionDefinition[] = [
  {
    name: SystemPermission.USER_VIEW,
    description: 'عرض المستخدمين',
  },
  {
    name: SystemPermission.USER_CREATE,
    description: 'إنشاء مستخدم',
  },
  {
    name: SystemPermission.USER_UPDATE,
    description: 'تعديل بيانات المستخدم',
  },
  {
    name: SystemPermission.USER_DELETE,
    description: 'حذف المستخدم',
  },
  {
    name: SystemPermission.USER_PERMISSION_MANAGE,
    description: 'إدارة الصلاحيات المباشرة للمستخدمين',
  },
  {
    name: SystemPermission.ROLE_VIEW,
    description: 'عرض الأدوار والصلاحيات',
  },
  {
    name: SystemPermission.ROLE_CREATE,
    description: 'إنشاء دور جديد',
  },
  {
    name: SystemPermission.ROLE_UPDATE,
    description: 'تعديل بيانات الدور',
  },
  {
    name: SystemPermission.ROLE_DELETE,
    description: 'حذف أو أرشفة الدور',
  },
  {
    name: SystemPermission.ROLE_PERMISSION_MANAGE,
    description: 'إدارة وإسناد صلاحيات الدور',
  },
  {
    name: SystemPermission.PRODUCTION_DEPARTMENT_VIEW,
    description: 'عرض أقسام الإنتاج',
  },
  {
    name: SystemPermission.PRODUCTION_DEPARTMENT_CREATE,
    description: 'إنشاء قسم إنتاج',
  },
  {
    name: SystemPermission.PRODUCTION_DEPARTMENT_UPDATE,
    description: 'تعديل قسم إنتاج',
  },
  {
    name: SystemPermission.PRODUCTION_DEPARTMENT_DELETE,
    description: 'أرشفة قسم إنتاج',
  },
  {
    name: SystemPermission.PRODUCTION_YARD_VIEW,
    description: 'عرض ساحات الإنتاج',
  },
  {
    name: SystemPermission.PRODUCTION_YARD_CREATE,
    description: 'إنشاء ساحة إنتاج',
  },
  {
    name: SystemPermission.PRODUCTION_YARD_UPDATE,
    description: 'تعديل ساحة إنتاج',
  },
  {
    name: SystemPermission.PRODUCTION_YARD_DELETE,
    description: 'أرشفة ساحة إنتاج',
  },
  {
    name: SystemPermission.PRODUCTION_ASSIGNMENT_VIEW,
    description: 'عرض تعيينات فرق الإنتاج',
  },
  {
    name: SystemPermission.PRODUCTION_ASSIGNMENT_MANAGE,
    description: 'إدارة رؤساء الأقسام والمهندسين وساحات مسؤوليتهم',
  },
  {
    name: SystemPermission.INVENTORY_CATEGORY_VIEW,
    description: 'عرض فئات المستودعات',
  },
  {
    name: SystemPermission.INVENTORY_CATEGORY_CREATE,
    description: 'إنشاء فئة مستودعات',
  },
  {
    name: SystemPermission.INVENTORY_CATEGORY_UPDATE,
    description: 'تعديل فئة مستودعات',
  },
  {
    name: SystemPermission.INVENTORY_CATEGORY_DELETE,
    description: 'أرشفة فئة مستودعات',
  },
  {
    name: SystemPermission.INVENTORY_PRODUCT_VIEW,
    description: 'عرض منتجات المستودعات ووحداتها',
  },
  {
    name: SystemPermission.INVENTORY_PRODUCT_CREATE,
    description: 'إنشاء منتج مستودعات',
  },
  {
    name: SystemPermission.INVENTORY_PRODUCT_UPDATE,
    description: 'تعديل منتج مستودعات ووحداته',
  },
  {
    name: SystemPermission.INVENTORY_PRODUCT_DELETE,
    description: 'أرشفة منتج مستودعات',
  },
];


export async function seedSystemUserPermissions(
  manager: EntityManager,
): Promise<PermissionEntity[]> {
  const permissionRepository = manager.getRepository(PermissionEntity);
  const permissions: PermissionEntity[] = [];

  for (const def of SYSTEM_USER_PERMISSIONS) {
    let permission = await permissionRepository.findOne({
      where: { name: def.name },
    });

    if (!permission) {
      permission = permissionRepository.create({
        name: def.name,
        description: def.description,
        isActive: true,
      });
      permission = await permissionRepository.save(permission);
    }

    permissions.push(permission);
  }

  console.log('[seed] system user permissions ready');
  return permissions;
}
