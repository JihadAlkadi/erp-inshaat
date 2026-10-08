import { createHash } from 'node:crypto';

export interface PatternSelectionReference {
  templatePatternId: string;
  selectedOptionId: string;
}

/**
 * Produces a stable, deterministic canonical string representation of a production order line's configuration.
 *
 * Rules:
 * 1. Only immutable IDs are used (templateId, templatePatternId, selectedOptionId). Names are NEVER used.
 * 2. Quantity is strictly excluded from configuration identity.
 * 3. Selections are always sorted deterministically by templatePatternId ASC.
 * 4. For templates without patterns (empty selections), templateId alone forms the canonical representation.
 */
export function canonicalizeLineConfiguration(
  templateId: string,
  selections: PatternSelectionReference[] = []
): string {
  if (!selections || selections.length === 0) {
    return templateId;
  }

  const sortedSelections = [...selections].sort((a, b) =>
    a.templatePatternId.localeCompare(b.templatePatternId)
  );

  const parts = sortedSelections.map((s) => `${s.templatePatternId}:${s.selectedOptionId}`);
  return `${templateId}|${parts.join('|')}`;
}

/**
 * Computes a 64-character lowercase hexadecimal SHA-256 hash of the canonical line configuration.
 */
export function hashLineConfiguration(
  templateId: string,
  selections: PatternSelectionReference[] = []
): string {
  const canonical = canonicalizeLineConfiguration(templateId, selections);
  return createHash('sha256').update(canonical, 'utf8').digest('hex').toLowerCase();
}
