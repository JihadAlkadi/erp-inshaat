/**
 * Strict runtime validator for the ALL access rule scope contract.
 * An ALL scope is valid if and only if scope is null.
 * Any non-null scope (object, array, string, etc.) is considered malformed.
 */
export function isValidAllScope(scope: unknown): scope is null {
  return scope === null;
}
