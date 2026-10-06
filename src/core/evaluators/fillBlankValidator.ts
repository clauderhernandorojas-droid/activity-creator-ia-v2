/**
 * Pure pedagogical flexible validator for Fill-in-the-Blank and Comprehension exercises.
 * Zero-UI: Pure business and pedagogical logic.
 */

export interface FlexibleValidationResult {
  isCorrect: boolean;
  status: 'correct' | 'correct_with_typo' | 'incorrect';
  expectedAnswer: string;
  canonicalAnswer?: string;
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
 * Generates legitimate grammar variations:
 * 1. Contraction expansions and reductions (e.g. "didn't go" <-> "did not go", "I've seen" <-> "I have seen")
 * 2. Standard UK/US spelling variants (e.g. "colour" <-> "color", "travelled" <-> "traveled")
 */
export function generateGrammarVariants(text: string): string[] {
  if (!text) return [];
  const variants = new Set<string>();
  variants.add(text);

  const contractions: Array<[RegExp, string]> = [
    [/\bdidn't\b/gi, 'did not'],
    [/\bdid not\b/gi, "didn't"],
    [/\bhaven't\b/gi, 'have not'],
    [/\bhave not\b/gi, "haven't"],
    [/\bhasn't\b/gi, 'has not'],
    [/\bhas not\b/gi, "hasn't"],
    [/\bhadn't\b/gi, 'had not'],
    [/\bhad not\b/gi, "hadn't"],
    [/\bdon't\b/gi, 'do not'],
    [/\bdo not\b/gi, "don't"],
    [/\bdoesn't\b/gi, 'does not'],
    [/\bdoes not\b/gi, "doesn't"],
    [/\bwon't\b/gi, 'will not'],
    [/\bwill not\b/gi, "won't"],
    [/\bwouldn't\b/gi, 'would not'],
    [/\bwould not\b/gi, "wouldn't"],
    [/\bcan't\b/gi, 'cannot'],
    [/\bcannot\b/gi, "can't"],
    [/\bcouldn't\b/gi, 'could not'],
    [/\bcould not\b/gi, "couldn't"],
    [/\bshouldn't\b/gi, 'should not'],
    [/\bshould not\b/gi, "shouldn't"],
    [/\bisn't\b/gi, 'is not'],
    [/\bis not\b/gi, "isn't"],
    [/\baren't\b/gi, 'are not'],
    [/\bare not\b/gi, "aren't"],
    [/\bwasn't\b/gi, 'was not'],
    [/\bwas not\b/gi, "wasn't"],
    [/\bweren't\b/gi, 'were not'],
    [/\bwere not\b/gi, "weren't"],
    [/\bi'm\b/gi, 'I am'],
    [/\bi am\b/gi, "I'm"],
    [/\bi've\b/gi, 'I have'],
    [/\bi have\b/gi, "I've"],
    [/\byou've\b/gi, 'you have'],
    [/\byou have\b/gi, "you've"],
    [/\bwe've\b/gi, 'we have'],
    [/\bwe have\b/gi, "we've"],
    [/\bthey've\b/gi, 'they have'],
    [/\bthey have\b/gi, "they've"],
    [/\bhe's\b/gi, 'he is'],
    [/\bshe's\b/gi, 'she is'],
    [/\bit's\b/gi, 'it is'],
  ];

  for (const [regex, replacement] of contractions) {
    if (regex.test(text)) {
      variants.add(text.replace(regex, replacement));
    }
  }

  const spellingVariants: Array<[RegExp, string]> = [
    [/\bcolour\b/gi, 'color'],
    [/\bcolor\b/gi, 'colour'],
    [/\bflavour\b/gi, 'flavor'],
    [/\bflavor\b/gi, 'flavour'],
    [/\bneighbour\b/gi, 'neighbor'],
    [/\bneighbor\b/gi, 'neighbour'],
    [/\btravelled\b/gi, 'traveled'],
    [/\btraveled\b/gi, 'travelled'],
    [/\btravelling\b/gi, 'traveling'],
    [/\btraveling\b/gi, 'travelling'],
    [/\brealise\b/gi, 'realize'],
    [/\brealize\b/gi, 'realise'],
    [/\borganise\b/gi, 'organize'],
    [/\borganize\b/gi, 'organise'],
    [/\bcentre\b/gi, 'center'],
    [/\bcenter\b/gi, 'centre'],
    [/\btheatre\b/gi, 'theater'],
    [/\btheater\b/gi, 'theatre'],
  ];

  for (const [regex, replacement] of spellingVariants) {
    if (regex.test(text)) {
      variants.add(text.replace(regex, replacement));
    }
  }

  return Array.from(variants);
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
    generateGrammarVariants(canonical).forEach((v) => candidateSet.add(v));
  }
  acceptedAnswers.forEach((ans) => {
    if (ans && ans.trim()) {
      candidateSet.add(ans.trim());
      generateGrammarVariants(ans.trim()).forEach((v) => candidateSet.add(v));
    }
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
