import { normalizeAnswer } from './normalize';

/**
 * Checks whether referenceContent is just a redundant duplicate
 * of the interactive items extracted from an exercise.
 */
export function isDuplicateReferenceContent(
  referenceText: string | null | undefined,
  items: Array<{ prompt?: string }> | null | undefined
): boolean {
  if (!referenceText || !referenceText.trim()) return false;
  if (!items || items.length === 0) return false;

  const trimmedRef = referenceText.trim();

  // Split reference text into lines
  const refLines = trimmedRef
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  if (refLines.length === 0) return false;

  const normalizedItems = items
    .map((it) => (it.prompt ? normalizeAnswer(it.prompt).replace(/^[\d.)\-_—\s]+/, '').trim() : ''))
    .filter((p) => p.length > 3);

  if (normalizedItems.length === 0) return false;

  let matchedLines = 0;
  let totalSubstantialLines = 0;

  for (const line of refLines) {
    const cleanLine = normalizeAnswer(line).replace(/^[\d.)\-_—\s]+/, '').trim();
    if (cleanLine.length <= 3) continue;

    totalSubstantialLines++;

    const isMatch = normalizedItems.some(
      (itemPrompt) =>
        cleanLine === itemPrompt ||
        cleanLine.includes(itemPrompt) ||
        itemPrompt.includes(cleanLine)
    );

    if (isMatch) {
      matchedLines++;
    }
  }

  // If at least 50% of the substantial lines in the reference text match the interactive item prompts,
  // it is considered duplicate exercise text rather than a genuine external reading passage.
  if (totalSubstantialLines > 0 && matchedLines / totalSubstantialLines >= 0.5) {
    return true;
  }

  // Also check full text comparison: if the item prompts cover > 60% of the reference text characters
  const cleanFullRef = normalizeAnswer(trimmedRef).replace(/[\s\d.)\-_—]+/g, '');
  if (cleanFullRef.length > 0) {
    let overlapCount = 0;
    for (const itemP of normalizedItems) {
      const cleanP = itemP.replace(/[\s\d.)\-_—]+/g, '');
      if (cleanP.length > 5 && cleanFullRef.includes(cleanP)) {
        overlapCount += cleanP.length;
      }
    }
    if (overlapCount / cleanFullRef.length >= 0.6) {
      return true;
    }
  }

  return false;
}
