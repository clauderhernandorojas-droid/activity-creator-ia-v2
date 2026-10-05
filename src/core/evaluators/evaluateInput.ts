import { normalizeAnswer } from '../text/normalize';
import type { InputFieldsBlock } from '../../types/schema';

export interface EvaluationResult {
  score: number;
  maxScore: number;
  details: Record<string, boolean>; // key -> isCorrect
}

export function evaluateInput(
  block: InputFieldsBlock,
  studentAnswers: Record<string, any>
): EvaluationResult {
  let score = 0;
  let maxScore = 0;
  const details: Record<string, boolean> = {};

  if (block.layoutMode === 'list') {
    maxScore = block.listItems.length;

    block.listItems.forEach((item) => {
      const rawUserVal = String(studentAnswers[item.id] || '');
      const normalizedUser = normalizeAnswer(rawUserVal);

      const isRight = item.acceptedAnswers.some((accepted) => {
        const normalizedAccepted = normalizeAnswer(accepted);
        return normalizedUser === normalizedAccepted;
      });

      details[item.id] = isRight;
      if (isRight) score++;
    });
  } else if (block.layoutMode === 'table') {
    let inputCount = 0;

    block.tableRows.forEach((row, rIdx) => {
      row.forEach((cell, cIdx) => {
        if (cell.isInput) {
          inputCount++;
          const cellKey = `cell-${rIdx}-${cIdx}`;
          const rawUserVal = String(studentAnswers[cellKey] || '');
          const normalizedUser = normalizeAnswer(rawUserVal);

          const isRight = cell.acceptedAnswers.some(
            (accepted) => normalizeAnswer(accepted) === normalizedUser
          );

          details[cellKey] = isRight;
          if (isRight) score++;
        }
      });
    });

    maxScore = inputCount;
  } else if (block.layoutMode === 'inline_paragraph') {
    const keys = Object.keys(block.paragraphInputs);
    maxScore = keys.length;

    keys.forEach((key) => {
      const rawUserVal = String(studentAnswers[key] || '');
      const normalizedUser = normalizeAnswer(rawUserVal);
      const acceptedList = block.paragraphInputs[key] || [];

      const isRight = acceptedList.some(
        (accepted) => normalizeAnswer(accepted) === normalizedUser
      );

      details[key] = isRight;
      if (isRight) score++;
    });
  }

  return { score, maxScore, details };
}
