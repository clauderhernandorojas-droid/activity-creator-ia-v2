import { validateFillInBlank, type FlexibleValidationResult } from './fillBlankValidator';
import type { InputFieldsBlock } from '../../types/schema';

export type EvaluationItemFeedback = FlexibleValidationResult;

export interface EvaluationResult {
  score: number;
  maxScore: number;
  details: Record<string, boolean>; // key -> isCorrect
  itemFeedback?: Record<string, EvaluationItemFeedback>;
}

export function evaluateInput(
  block: InputFieldsBlock,
  studentAnswers: Record<string, any>
): EvaluationResult {
  let score = 0;
  let maxScore = 0;
  const details: Record<string, boolean> = {};
  const itemFeedback: Record<string, EvaluationItemFeedback> = {};

  if (block.layoutMode === 'list') {
    maxScore = block.listItems.length;

    block.listItems.forEach((item) => {
      const rawUserVal = String(studentAnswers[item.id] || '');
      const validation = validateFillInBlank(
        rawUserVal,
        item.acceptedAnswers,
        item.expectedAnswer,
        item.hint || item.explanation
      );

      details[item.id] = validation.isCorrect;
      itemFeedback[item.id] = validation;
      if (validation.isCorrect) score++;
    });
  } else if (block.layoutMode === 'table') {
    let inputCount = 0;

    block.tableRows.forEach((row, rIdx) => {
      row.forEach((cell, cIdx) => {
        if (cell.isInput) {
          inputCount++;
          const cellKey = `cell-${rIdx}-${cIdx}`;
          const rawUserVal = String(studentAnswers[cellKey] || '');
          const validation = validateFillInBlank(rawUserVal, cell.acceptedAnswers);

          details[cellKey] = validation.isCorrect;
          itemFeedback[cellKey] = validation;
          if (validation.isCorrect) score++;
        }
      });
    });

    maxScore = inputCount;
  } else if (block.layoutMode === 'inline_paragraph') {
    const keys = Object.keys(block.paragraphInputs);
    maxScore = keys.length;

    keys.forEach((key) => {
      const rawUserVal = String(studentAnswers[key] || '');
      const acceptedList = block.paragraphInputs[key] || [];
      const validation = validateFillInBlank(rawUserVal, acceptedList);

      details[key] = validation.isCorrect;
      itemFeedback[key] = validation;
      if (validation.isCorrect) score++;
    });
  }

  return { score, maxScore, details, itemFeedback };
}
