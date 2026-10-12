import type { SequenceItem } from '../../types/schema';

/**
 * Generates an array of item IDs shuffled so that the initial visible order
 * is guaranteed not to match the exact canonical solution order (when items.length >= 2).
 *
 * Invariant: The original `items` array and each item's canonical `correctOrder`
 * are strictly preserved and never mutated.
 */
export function shuffleSequenceItems(items: SequenceItem[]): string[] {
  if (!items || items.length === 0) return [];
  if (items.length === 1) return [items[0].id];

  // Canonical sorted solution IDs based on correctOrder
  const canonicalSolutionIds = [...items]
    .sort((a, b) => a.correctOrder - b.correctOrder)
    .map((item) => item.id);

  const shuffledIds = [...canonicalSolutionIds];

  // Attempt standard Fisher-Yates shuffle up to 10 iterations
  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    for (let i = shuffledIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffledIds[i];
      shuffledIds[i] = shuffledIds[j];
      shuffledIds[j] = temp;
    }

    const isIdenticalToSolution = shuffledIds.every(
      (id, idx) => id === canonicalSolutionIds[idx]
    );

    if (!isIdenticalToSolution) {
      return shuffledIds;
    }
  }

  // Deterministic fallback if random permutations happened to match solution 10 times in a row
  if (shuffledIds.length === 2) {
    return [shuffledIds[1], shuffledIds[0]];
  }

  // Shift/rotate by 1 position (e.g., [A, B, C] -> [B, C, A])
  return [...shuffledIds.slice(1), shuffledIds[0]];
}
