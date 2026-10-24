import type { BucketsMatchingBlock } from '../../types/schema';
import type { EvaluationResult } from './evaluateInput';

export function evaluateBuckets(
  block: BucketsMatchingBlock,
  studentAnswers: Record<string, any>
): EvaluationResult {
  let score = 0;
  const maxScore = block.tokens.length;
  const details: Record<string, boolean> = {};
  const targetBuckets = block.buckets || block.targetSlots || [];

  const matchesBucket = (tokBucketId: string | undefined | null, b: { id: string; label?: string }): boolean => {
    if (!tokBucketId || !b) return false;
    const tid = tokBucketId.toLowerCase().trim();
    const bid = (b.id || '').toLowerCase().trim();
    const blabel = (b.label || '').toLowerCase().trim();
    return (
      bid === tid ||
      bid.endsWith(`-${tid}`) ||
      bid.endsWith(`_${tid}`) ||
      blabel.startsWith(tid) ||
      blabel.startsWith(`${tid} `) ||
      blabel.startsWith(`${tid})`)
    );
  };

  block.tokens.forEach((token) => {
    const studentBucketId = studentAnswers[token.id] || (token.isExample ? token.correctBucketId : undefined);
    let isRight = Boolean(token.isExample);
    if (!isRight && studentBucketId) {
      if (studentBucketId === token.correctBucketId) {
        isRight = true;
      } else {
        const targetBucket = targetBuckets.find(
          (b) => b.id === studentBucketId || matchesBucket(studentBucketId, b)
        );
        if (targetBucket && matchesBucket(token.correctBucketId, targetBucket)) {
          isRight = true;
        }
      }
    }
    details[token.id] = isRight;
    if (isRight) score++;
  });

  return { score, maxScore, details };
}
