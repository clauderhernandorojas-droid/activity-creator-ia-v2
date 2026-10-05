import type { SelectionBlock } from '../../types/schema';
import type { EvaluationResult } from './evaluateInput';

export function evaluateSelection(
  block: SelectionBlock,
  studentAnswers: Record<string, any>
): EvaluationResult {
  let score = 0;
  const maxScore = block.questions.length;
  const details: Record<string, boolean> = {};

  block.questions.forEach((q) => {
    const userVal = studentAnswers[q.id];

    if (q.mode === 'single_choice' || q.mode === 'dropdown') {
      const correctOption = q.options.find((opt) => opt.isCorrect);
      const isRight = userVal === correctOption?.id;
      details[q.id] = isRight;
      if (isRight) score++;
    } else if (q.mode === 'multiple_choice') {
      const selectedIds: string[] = Array.isArray(userVal) ? userVal : [];
      const correctIds = q.options.filter((opt) => opt.isCorrect).map((opt) => opt.id);

      const isExactMatch =
        selectedIds.length === correctIds.length &&
        selectedIds.every((id) => correctIds.includes(id));

      details[q.id] = isExactMatch;
      if (isExactMatch) score++;
    }
  });

  return { score, maxScore, details };
}
