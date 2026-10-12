import type { SelectionBlock } from '../../types/schema';
import type { EvaluationResult } from './evaluateInput';

export function evaluateSelection(
  block: SelectionBlock,
  studentAnswers: Record<string, any>
): EvaluationResult {
  // 1. FLAT SELECTION MODE (Grid/List of selectable cards)
  if (block.options && block.options.length > 0) {
    const selectedIds: string[] = Array.isArray(studentAnswers[block.id])
      ? studentAnswers[block.id]
      : block.options.filter((opt) => studentAnswers[opt.id]).map((opt) => opt.id);

    const correctOptions = block.options.filter((opt) => opt.isCorrect === true);

    // If no mandatory correct answers are defined, allow free interaction without arbitrary errors!
    if (correctOptions.length === 0) {
      const details: Record<string, boolean> = {};
      selectedIds.forEach((id) => {
        details[id] = true;
      });
      const hasInteracted = selectedIds.length > 0;
      return {
        score: hasInteracted ? 1 : 0,
        maxScore: hasInteracted ? 1 : 0,
        details
      };
    }

    // When mandatory correct answers exist:
    const correctIds = correctOptions.map((opt) => opt.id);
    const details: Record<string, boolean> = {};

    if (block.allowMultiple) {
      // Multiple selection (checkboxes): exact match between selected set and expected correct options
      const isExactMatch =
        selectedIds.length === correctIds.length &&
        selectedIds.every((id) => correctIds.includes(id));

      block.options.forEach((opt) => {
        const isSelected = selectedIds.includes(opt.id);
        if (opt.isCorrect) {
          details[opt.id] = isSelected;
        } else if (isSelected) {
          details[opt.id] = false;
        }
      });
      details[block.id] = isExactMatch;

      return {
        score: isExactMatch ? 1 : 0,
        maxScore: 1,
        details,
      };
    } else {
      // Single selection (radio button): single answer
      const selectedId = selectedIds[0];
      const isCorrect = Boolean(selectedId && correctIds.includes(selectedId));

      block.options.forEach((opt) => {
        const isSelected = selectedIds.includes(opt.id);
        if (opt.isCorrect) {
          details[opt.id] = isSelected;
        } else if (isSelected) {
          details[opt.id] = false;
        }
      });
      details[block.id] = isCorrect;

      return {
        score: isCorrect ? 1 : 0,
        maxScore: 1,
        details,
      };
    }
  }

  // 2. QUIZ / QUESTIONNAIRE MODE (questions with per-item options)
  let score = 0;
  const questions = block.questions || [];
  const maxScore = questions.length;
  const details: Record<string, boolean> = {};

  questions.forEach((q) => {
    const userVal = studentAnswers[q.id];
    const isMulti = q.mode === 'multiple_choice' || Boolean(q.allowMultiple) || (Boolean(block.allowMultiple) && q.mode !== 'dropdown' && q.mode !== 'single_choice');

    if (!isMulti && (q.mode === 'single_choice' || q.mode === 'dropdown')) {
      const correctOption = q.options.find((opt) => opt.isCorrect);
      if (!correctOption) {
        // Free interaction if question has no marked correct answer
        details[q.id] = true;
        score++;
      } else {
        const isRight = userVal === correctOption.id;
        details[q.id] = isRight;
        if (isRight) score++;
      }
    } else {
      const selectedIds: string[] = Array.isArray(userVal)
        ? userVal
        : typeof userVal === 'string' && userVal
        ? [userVal]
        : [];
      const correctIds = q.options.filter((opt) => opt.isCorrect).map((opt) => opt.id);

      if (correctIds.length === 0) {
        details[q.id] = true;
        score++;
      } else {
        const isExactMatch =
          selectedIds.length === correctIds.length &&
          selectedIds.every((id) => correctIds.includes(id));

        details[q.id] = isExactMatch;
        if (isExactMatch) score++;
      }
    }
  });

  return { score, maxScore, details };
}
