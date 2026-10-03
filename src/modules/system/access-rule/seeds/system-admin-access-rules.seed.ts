import { EntityManager } from 'typeorm';
import { AccessRuleEntity } from '../access-rule.entity.js';
import { PermissionGrantEntity } from '../../permission-grant/permission-grant.entity.js';

export async function seedSystemAdminAccessRules(
  manager: EntityManager,
  grants: PermissionGrantEntity[],
): Promise<AccessRuleEntity[]> {
  const accessRuleRepository = manager.getRepository(AccessRuleEntity);
  const accessRules: AccessRuleEntity[] = [];

  for (const grant of grants) {
    let rule = await accessRuleRepository.findOne({
      where: {
        permissionGrantId: grant.id,
        effect: 'ALLOW',
        scopeType: 'ALL',
      },
    });

    if (!rule) {
      rule = accessRuleRepository.create({
        permissionGrantId: grant.id,
        effect: 'ALLOW',
        scopeType: 'ALL',
        scope: null,
        isActive: true,
        description: 'السماح لمدير النظام بالوصول إلى جميع بيانات هذا المورد',
      });
      rule = await accessRuleRepository.save(rule);
    }

    accessRules.push(rule);
  }

  console.log('[seed] access rules ready');
  return accessRules;
}
