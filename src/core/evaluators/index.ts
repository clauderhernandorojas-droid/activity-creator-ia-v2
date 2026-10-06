export * from './evaluateInput';
export * from './evaluateSelection';
export * from './evaluateBuckets';
export * from './evaluateSequence';
export * from './fillBlankValidator';

import type { InteractionBlock } from '../../types/schema';
import type { EvaluationResult } from './evaluateInput';
import { evaluateInput } from './evaluateInput';
import { evaluateSelection } from './evaluateSelection';
import { evaluateBuckets } from './evaluateBuckets';
import { evaluateSequence } from './evaluateSequence';

/**
 * Dispatcher function to evaluate any InteractionBlock using pure evaluators.
 */
export function evaluateInteraction(
  interaction: InteractionBlock,
  studentAnswers: Record<string, any>
): EvaluationResult {
  switch (interaction.type) {
    case 'input_fields':
      return evaluateInput(interaction, studentAnswers);
    case 'selection':
      return evaluateSelection(interaction, studentAnswers);
    case 'buckets_matching':
      return evaluateBuckets(interaction, studentAnswers);
    case 'sequence':
      return evaluateSequence(interaction, studentAnswers);
    default:
      return { score: 0, maxScore: 0, details: {} };
  }
}
