import type { BucketsMatchingBlock } from '../../types/schema';
import type { EvaluationResult } from './evaluateInput';

export function evaluateBuckets(
  block: BucketsMatchingBlock,
  studentAnswers: Record<string, any>
): EvaluationResult {
  let score = 0;
  const maxScore = block.tokens.length;
  const details: Record<string, boolean> = {};

  block.tokens.forEach((token) => {
    const studentBucketId = studentAnswers[token.id];
    const isRight = studentBucketId === token.correctBucketId;
    details[token.id] = isRight;
    if (isRight) score++;
  });

  return { score, maxScore, details };
}
