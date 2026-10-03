import { AuthPrincipal } from '../auth/auth.types.js';

export type SupportedScopeType = 'ALL';

export interface PermissionEvaluationContext {
  principal: AuthPrincipal;
  permissionName: string;
}
