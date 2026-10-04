import { SafeUserOutput } from '../user.types.js';
import { UserProductionResponsibilityOutput } from '../../../production/team/production-user-responsibility-read.service.js';

export type UserPortfolioTab = 'overview' | 'account' | 'permissions' | 'production';

export type UserPortfolioWarningSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface UserPortfolioWarning {
  code: string;
  severity: UserPortfolioWarningSeverity;
  title: string;
  message: string;
  href?: string;
}

export interface UserPortfolioBaseViewModel {
  targetUser: SafeUserOutput;
  isSelf: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canManagePermissions: boolean;
  canViewProduction: boolean;
  activePortfolioTab: UserPortfolioTab;
}

export interface UserPortfolioPermissionSummary {
  inheritedCount: number;
  directCount: number;
  warningCount: number;
}

export interface UserPortfolioOverviewViewModel extends UserPortfolioBaseViewModel {
  permissionSummary: UserPortfolioPermissionSummary;
  warnings: UserPortfolioWarning[];
  productionResponsibility?: UserProductionResponsibilityOutput;
}

export interface UserPortfolioAccountViewModel extends UserPortfolioBaseViewModel {
  accountDetails: {
    id: string;
    fullName: string;
    phone: string;
    roleName: string;
    roleId: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface UserPortfolioProductionViewModel extends UserPortfolioBaseViewModel {
  productionResponsibility: UserProductionResponsibilityOutput;
}
