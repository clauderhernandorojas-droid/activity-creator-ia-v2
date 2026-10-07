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
    const studentBucketId = studentAnswers[token.id] || (token.isExample ? token.correctBucketId : undefined);
    const isRight = studentBucketId === token.correctBucketId || Boolean(token.isExample);
    details[token.id] = isRight;
    if (isRight) score++;
  });

  return { score, maxScore, details };
}
