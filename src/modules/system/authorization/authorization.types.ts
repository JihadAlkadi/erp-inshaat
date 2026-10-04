export interface ApplicableAccessRule {
  ruleId: string;
  grantId: string;
  effect: 'ALLOW' | 'DENY';
  scopeType: string;
  scope: Record<string, unknown> | null;
  permissionName?: string;
}
