import type { EvaluationResult } from './evaluateInput';
import { sanitizeEvaluationString } from './fillBlankValidator';

export interface ClozeMultichoiceEvaluationResult extends EvaluationResult {
  isCorrect: boolean;
}

/**
 * Pure evaluation function for Cloze Multi-Choice interactions.
 * Compares student answers for each gap against the correctOptionId.
 * Solved examples (isExample: true) are omitted from scoring.
 */
export function evaluateClozeMultichoice(
  interaction: any,
  studentAnswers: Record<string, any>
): ClozeMultichoiceEvaluationResult {
  const gaps: any[] = Array.isArray(interaction?.gaps) ? interaction.gaps : [];
  let score = 0;
  let maxScore = 0;
  const details: Record<string, boolean> = {};

  for (const gap of gaps) {
    if (gap.isExample) {
      // Examples are pre-solved and do not count towards maxScore
      details[gap.id] = true;
      continue;
    }

    maxScore++;
    const studentAns = sanitizeEvaluationString(studentAnswers[gap.id]);
    const expectedAns = sanitizeEvaluationString(gap.correctOptionId);

    // Check matching either by option id ('a', 'b') or literal text
    const matchingOpt = Array.isArray(gap.options)
      ? gap.options.find((o: any) => sanitizeEvaluationString(o.id) === expectedAns)
      : null;
    const expectedText = matchingOpt ? sanitizeEvaluationString(matchingOpt.text) : '';

    const isCorrect = Boolean(
      (studentAns && expectedAns && studentAns === expectedAns) ||
      (studentAns && expectedText && studentAns === expectedText)
    );

    if (isCorrect) {
      score++;
    }

    details[gap.id] = isCorrect;
  }

  return {
    score,
    maxScore,
    isCorrect: maxScore > 0 && score === maxScore,
    details,
  };
}
