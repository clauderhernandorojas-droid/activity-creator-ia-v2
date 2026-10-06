/**
 * Pure pedagogical flexible validator for Fill-in-the-Blank and Comprehension exercises.
 * Zero-UI: Pure business and pedagogical logic.
 */

export interface FlexibleValidationResult {
  isCorrect: boolean;
  status: 'correct' | 'correct_with_typo' | 'incorrect';
  expectedAnswer: string;
  matchedAnswer?: string;
  typoWarning?: boolean;
  feedback: string;
  explanation?: string;
}

/**
 * Irrelevant leading particles/articles in language assessment:
 * 'the', 'a', 'an', 'in', 'on'
 */
const IRRELEVANT_PREFIX_REGEX = /^(?:the|a|an|in|on)\s+/i;

/**
 * Base string cleanup:
 * 1. Normalize Unicode (NFD)
 * 2. Unify curly quotes and apostrophes to standard straight forms
 * 3. Trim whitespace and replace consecutive whitespaces with a single space
 * 4. Lowercase
 * 5. Strip trailing and leading punctuation (. , ! ? ; : -)
 */
export function cleanBaseAnswer(text: string): string {
  if (!text) return '';

  return (
    text
      .normalize('NFD')
      .replace(/[’‘`´]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      // Remove surrounding quotes if student wrapped answer in quotes
      .replace(/^["']+|["']+$/g, '')
      .trim()
      // Remove trailing and leading punctuation (periods, commas, etc.)
      .replace(/^[.,;:!?-]+|[.,;:!?-]+$/g, '')
      .trim()
      // Clean surrounding quotes again if punctuation was inside quotes
      .replace(/^["']+|["']+$/g, '')
      .trim()
  );
}

/**
 * Strips irrelevant leading articles / prepositions ('the', 'a', 'an', 'in', 'on')
 * while ensuring that if the target itself is only that word (e.g. 'in' or 'on'),
 * it is not reduced to an empty string.
 */
export function stripLeadingIrrelevantParticles(text: string): string {
  let current = text.trim();
  while (IRRELEVANT_PREFIX_REGEX.test(current)) {
    const stripped = current.replace(IRRELEVANT_PREFIX_REGEX, '').trim();
    if (stripped.length === 0) break;
    current = stripped;
  }
  return current;
}

/**
 * Computes classic Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Tests if student answer differs by at most 1 Levenshtein distance on words
 * having more than 4 characters (e.g. 'recipies' vs 'recipes').
 * Short words (<= 4 chars like 'cat', 'in', 'has', 'live') are NEVER allowed
 * 1-character typos as they fundamentally alter meaning/grammar.
 */
export function isTypoMatch(studentStr: string, targetStr: string): boolean {
  if (studentStr === targetStr) return false;

  const studentWords = studentStr.split(/\s+/).filter(Boolean);
  const targetWords = targetStr.split(/\s+/).filter(Boolean);

  // Case 1: Single-word comparison
  if (studentWords.length === 1 && targetWords.length === 1) {
    const sWord = studentWords[0];
    const tWord = targetWords[0];

    // Must be a word of more than 4 letters (target > 4 and student >= 4)
    if (tWord.length > 4 && sWord.length >= 4) {
      return levenshteinDistance(sWord, tWord) === 1;
    }
    return false;
  }

  // Case 2: Multi-word phrase with identical word count
  if (studentWords.length === targetWords.length && studentWords.length > 1) {
    let differingWords = 0;
    let validTypo = true;

    for (let i = 0; i < targetWords.length; i++) {
      const sWord = studentWords[i];
      const tWord = targetWords[i];

      if (sWord !== tWord) {
        differingWords++;
        // Must be exactly 1 edit and word must have more than 4 letters
        if (tWord.length <= 4 || sWord.length < 4 || levenshteinDistance(sWord, tWord) !== 1) {
          validTypo = false;
          break;
        }
      }
    }

    if (validTypo && differingWords === 1) {
      return true;
    }
  }

  // Case 3: Overall string distance is 1 (e.g. hyphen vs space or single transposed letter)
  if (targetStr.length > 4 && studentStr.length >= 4) {
    const dist = levenshteinDistance(studentStr, targetStr);
    if (dist === 1) {
      // Ensure the differing token has > 4 characters
      const minWordLen = Math.min(...targetWords.map((w) => w.length));
      if (minWordLen > 4 || targetWords.length === 1) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Flexible evaluation engine for fill-in-the-blank & comprehension items.
 *
 * Normalization pipeline:
 * 1. Base clean (trim, lowercase, strip trailing periods/commas)
 * 2. Omit irrelevant leading articles/particles ('the', 'a', 'an', 'in', 'on')
 * 3. Typo tolerance: Levenshtein distance of 1 for words > 4 letters.
 *
 * Guarantees `expectedAnswer` is never empty.
 */
export function validateFillInBlank(
  studentInput: string | undefined | null,
  acceptedAnswers: string[] = [],
  expectedAnswer?: string,
  explanationOrHint?: string
): FlexibleValidationResult {
  // Determine canonical answer: never empty
  const rawCanonical = (expectedAnswer && expectedAnswer.trim().length > 0)
    ? expectedAnswer.trim()
    : (acceptedAnswers.find((a) => a && a.trim().length > 0)?.trim() || 'Respuesta canónica');

  const canonical = rawCanonical;

  // Compile list of unique candidates to evaluate
  const candidateSet = new Set<string>();
  if (canonical && canonical !== 'Respuesta canónica') {
    candidateSet.add(canonical);
  }
  acceptedAnswers.forEach((ans) => {
    if (ans && ans.trim()) candidateSet.add(ans.trim());
  });

  if (candidateSet.size === 0) {
    candidateSet.add(canonical);
  }

  const candidates = Array.from(candidateSet);

  const rawStudent = String(studentInput || '').trim();
  const cleanStudent = cleanBaseAnswer(rawStudent);

  // Empty response
  if (!cleanStudent) {
    return {
      isCorrect: false,
      status: 'incorrect',
      expectedAnswer: canonical,
      feedback: `Respuesta correcta: ${canonical}`,
      explanation: explanationOrHint
    };
  }

  // Pass 1: Exact normalized match
  for (const candidate of candidates) {
    const cleanCand = cleanBaseAnswer(candidate);
    if (cleanStudent === cleanCand) {
      return {
        isCorrect: true,
        status: 'correct',
        expectedAnswer: canonical,
        matchedAnswer: candidate,
        feedback: '¡Respuesta correcta!',
        explanation: explanationOrHint
      };
    }
  }

  // Pass 2: Article & particle-stripped match
  const strippedStudent = stripLeadingIrrelevantParticles(cleanStudent);
  for (const candidate of candidates) {
    const cleanCand = cleanBaseAnswer(candidate);
    const strippedCand = stripLeadingIrrelevantParticles(cleanCand);

    if (strippedStudent === strippedCand) {
      return {
        isCorrect: true,
        status: 'correct',
        expectedAnswer: canonical,
        matchedAnswer: candidate,
        feedback: '¡Respuesta correcta!',
        explanation: explanationOrHint
      };
    }
  }

  // Pass 3: Typo tolerance (Levenshtein distance 1 on words > 4 letters)
  for (const candidate of candidates) {
    const cleanCand = cleanBaseAnswer(candidate);
    const strippedCand = stripLeadingIrrelevantParticles(cleanCand);

    if (
      isTypoMatch(cleanStudent, cleanCand) ||
      isTypoMatch(strippedStudent, strippedCand) ||
      isTypoMatch(strippedStudent, cleanCand) ||
      isTypoMatch(cleanStudent, strippedCand)
    ) {
      return {
        isCorrect: true,
        status: 'correct_with_typo',
        expectedAnswer: canonical,
        matchedAnswer: candidate,
        typoWarning: true,
        feedback: `Correcta con advertencia de ortografía: se esperaba "${canonical}"`,
        explanation: explanationOrHint
      };
    }
  }

  // No match
  return {
    isCorrect: false,
    status: 'incorrect',
    expectedAnswer: canonical,
    feedback: `Respuesta correcta: ${canonical}`,
    explanation: explanationOrHint
  };
}
