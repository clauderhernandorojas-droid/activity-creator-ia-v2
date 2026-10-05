import type { SequenceBlock } from '../../types/schema';
import type { EvaluationResult } from './evaluateInput';

export function evaluateSequence(
  block: SequenceBlock,
  studentAnswers: Record<string, any>
): EvaluationResult {
  const currentOrder: string[] =
    Array.isArray(studentAnswers['sequence_order']) &&
    studentAnswers['sequence_order'].length === block.items.length
      ? (studentAnswers['sequence_order'] as string[])
      : block.items.map((i) => i.id);

  const maxScore = block.items.length;
  const details: Record<string, boolean> = {};

  // Sort items by correctOrder to determine the target ID for each 0-indexed slot
  const sortedTargetIds = [...block.items]
    .sort((a, b) => a.correctOrder - b.correctOrder)
    .map((item) => item.id);

  let score = 0;
  sortedTargetIds.forEach((expectedId, slotIdx) => {
    const isRight = currentOrder[slotIdx] === expectedId;
    details[`pos-${slotIdx}`] = isRight;
    if (isRight) score++;
  });

  return { score, maxScore, details };
}
