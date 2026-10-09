import { normalizeAnswer } from './normalize';

/**
 * Checks whether referenceContent is just a redundant duplicate
 * of the interactive items extracted from an exercise.
 */
export function isDuplicateReferenceContent(
  referenceText: string | null | undefined,
  items: Array<{ prompt?: string; expectedAnswer?: string }> | null | undefined
): boolean {
  if (!referenceText || !referenceText.trim()) return false;
  if (!items || items.length === 0) return false;

  const trimmedRef = referenceText.trim();

  // Split reference text into lines
  const refLines = trimmedRef
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  if (refLines.length === 0) return false;

  const normalizedItems = items
    .map((it) => (it.prompt ? normalizeAnswer(it.prompt).replace(/^[\d.)\-_—\s]+/, '').trim() : ''))
    .filter((p) => p.length > 3);

  const normalizedAnswers = items
    .map((it) => (it.expectedAnswer ? normalizeAnswer(it.expectedAnswer).replace(/^[\d.)\-_—\s]+/, '').trim() : ''))
    .filter((a) => a.length > 3);

  if (normalizedItems.length === 0 && normalizedAnswers.length === 0) return false;

  let matchedLines = 0;
  let totalSubstantialLines = 0;

  for (const line of refLines) {
    const cleanLine = normalizeAnswer(line).replace(/^[\d.)\-_—\s]+/, '').trim();
    if (cleanLine.length <= 3) continue;

    totalSubstantialLines++;

    const isMatch =
      normalizedItems.some(
        (itemPrompt) =>
          cleanLine === itemPrompt ||
          cleanLine.includes(itemPrompt) ||
          itemPrompt.includes(cleanLine)
      ) ||
      normalizedAnswers.some(
        (ans) =>
          cleanLine === ans ||
          cleanLine.includes(ans) ||
          ans.includes(cleanLine)
      );

    if (isMatch) {
      matchedLines++;
    }
  }

  // If at least 50% of the substantial lines in the reference text match the interactive item prompts,
  // it is considered duplicate exercise text rather than a genuine external reading passage.
  if (totalSubstantialLines > 0 && matchedLines / totalSubstantialLines >= 0.5) {
    return true;
  }

  // Also check full text comparison: if the item prompts cover > 60% of the reference text characters
  const cleanFullRef = normalizeAnswer(trimmedRef).replace(/[\s\d.)\-_—]+/g, '');
  if (cleanFullRef.length > 0) {
    let overlapCount = 0;
    for (const itemP of normalizedItems) {
      const cleanP = itemP.replace(/[\s\d.)\-_—]+/g, '');
      if (cleanP.length > 5 && cleanFullRef.includes(cleanP)) {
        overlapCount += cleanP.length;
      }
    }
    if (overlapCount / cleanFullRef.length >= 0.6) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes text for architectural deduplication and cross-level comparison.
 * Strips accents, Markdown tokens (**bold**, _italic_), bullet points (1., a)), and punctuation.
 */
export function normalizeTextForComparison(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*{1,3}|_{1,3}|`+/g, '') // remove markdown markers
    .replace(/(?:^|\n|\s)(?:\(?\d+[.)]|\(?[a-zA-Z][.)])\s+/g, ' ') // remove bullets
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether textA and textB have substantial or identical semantic overlap.
 * Used to prevent stacked repeated instructions between Slide Header and Active Block.
 */
export function isSubstantialTextOverlap(
  textA: string | null | undefined,
  textB: string | null | undefined,
  threshold = 0.65
): boolean {
  const normA = normalizeTextForComparison(textA);
  const normB = normalizeTextForComparison(textB);

  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // Substring inclusion with length ratio check
  if (normA.includes(normB) || normB.includes(normA)) {
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    if (minLen / maxLen >= 0.45) return true;
  }

  // Token-based Jaccard / containment similarity
  const wordsA = new Set(normA.split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(normB.split(' ').filter((w) => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }

  const similarity = common / Math.min(wordsA.size, wordsB.size);
  return similarity >= threshold;
}

/**
 * Determines whether a plain paragraph merely concatenates or restates structured items
 * (e.g. guidelines or list items prompts). If true, the plain paragraph should be omitted
 * in favor of the structured visual component.
 */
export function isConcatenationOfItems(
  paragraph: string | null | undefined,
  items: string[] | null | undefined,
  threshold = 0.55
): boolean {
  if (!paragraph || !items || items.length === 0) return false;
  const normPara = normalizeTextForComparison(paragraph);
  if (!normPara || normPara.length < 15) return false;

  let matchedChars = 0;
  for (const it of items) {
    const normIt = normalizeTextForComparison(it);
    if (normIt && normIt.length > 5 && normPara.includes(normIt)) {
      matchedChars += normIt.length;
    }
  }

  return matchedChars / normPara.length >= threshold;
}

/**
 * Detects whether a string in referenceContent is synthetic didactic advice,
 * teacher notes, summaries, or artificial instructions fabricated by the AI model
 * rather than an authentic printed reading passage (article, chronicle, dialogue, or grammar table).
 */
export function isSyntheticPedagogicalText(text: string | null | undefined): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 20) return true;

  // 1. Explicit meta-pedagogical comments or teacher advice
  const metaRegex = /^(?:this is an? (?:open-ended|speaking|communicative|interactive|writing|reading) activity|this (?:activity|exercise|task|lesson) is (?:designed|intended|meant|created|aimed) to|in this (?:activity|exercise|task|lesson),?\s*students (?:will|are encouraged to|can|practice|should)|the (?:goal|purpose|objective|aim) of this (?:activity|exercise|task)|learning objectives?|teacher'?s? notes?|teaching tips?|pedagogical notes?|guidelines for the teacher)/i;
  if (metaRegex.test(trimmed)) return true;

  // 2. Synthetic writing advice or student tips fabricated when no passage was in the image
  const adviceRegex = /^(?:(?:useful\s+)?tips? for (?:writing|speaking|students?)|how to (?:write|complete|answer)|advice for (?:writing|students?)|writing tips?|useful tips?|reminders? for students?|instructions? for students?|steps? to follow)[:\s]/i;
  if (adviceRegex.test(trimmed)) return true;

  // 3. Teacher directives instructing how to write/answer rather than reading material
  const directiveRegex = /^(?:to (?:write|complete|produce) (?:a|an|your|this)|before you (?:write|start|begin)|when (?:writing|answering|completing),?\s*(?:remember|make sure|think)|make sure (?:you|to)|remember to check|don't forget to|you (?:should|must|need to) (?:write|use|include|check))/i;
  if (directiveRegex.test(trimmed)) return true;

  // 4. Summaries or restatements of exercise prompts ("Write ten questions about...", "Ask each other...")
  if (/^(?:write|make|ask|complete|match|choose|underline|circle)\s+(?:ten|eight|five|the|\d+)?\s*(?:questions|sentences|items|answers|dialogue)/i.test(trimmed) && trimmed.length < 120) {
    return true;
  }

  return false;
}

/**
 * Strips isolated alphanumeric editorial cataloging codes, lesson/unit labels,
 * or appendix prefixes (e.g., "3A. ", "1.2 - ", "Unit 3: ", "Lesson 4. ", "B1. ", "A. ", "Ex. 2: ")
 * from titles and headings, while preserving the title when the whole string consists only of the label.
 */
export function stripEditorialPrefix(text: string | null | undefined): string {
  if (!text) return '';
  let current = text.trim();
  if (!current) return '';

  // Match prefixes:
  // - Unit/Lesson/Module/Section/Part/Chapter/Exercise/Activity/Page (EN/ES)
  // - Alphanumeric cataloging codes: "3A.", "B1.", "1.2 -", "2b)", "A.", "B.", "1.", "2."
  const prefixRegex = /^(?:(?:(?:unit|unidad|lesson|lecci[oó]n|module|m[oó]dulo|section|secci[oó]n|part|parte|chapter|cap[ií]tulo|ap[eé]ndice|appendix|ex(?:ercise)?\.?|act(?:ivity)?\.?|ejercicio\.?|p(?:age|ág(?:ina)?)?\.?)\s*(?:\d+[a-zA-Z]?|[a-zA-Z]\d*|\d+\.\d+|[a-zA-Z]))|\b\d+[a-zA-Z](?:\.\d+)?|\b[a-zA-Z]\d+(?:\.\d+)?|\b\d+\.\d+(?:\.\d+)?|\b[A-Za-z]\b|\b\d{1,2}\b)(?:\s*[:.\-–—|•/)]|\s+)\s*/i;

  let iterations = 0;
  while (iterations < 3) {
    const next = current.replace(prefixRegex, '').trim();
    if (next && next !== current) {
      current = next;
      iterations++;
    } else {
      break;
    }
  }

  return current.length > 0 ? current : text.trim();
}

/**
 * Strips orphan typographical footnote/appendix calls (*, †, ‡, §, ¶, #, °, ◊, ¹, ², ³, ※)
 * commonly found in scanned textbook word banks, table cells, and lexical items,
 * while strictly preserving valid Markdown formatting (**bold**, `# Heading`).
 */
export function stripOrphanTypographicalMarkers(text: string | null | undefined): string {
  if (!text) return '';
  let str = text;

  // 1. Remove explicit footnote reference symbols: †, ‡, §, ¶, ◊, ※
  str = str.replace(/[†‡§¶◊※]/g, '');

  // 2. Remove isolated superscript footnote numbers (¹ ² ³ ⁴ ⁵)
  str = str.replace(/(?<=\w)[¹²³⁴⁵]+(?!\w)/g, '');
  str = str.replace(/(?<!\w)[¹²³⁴⁵]+(?!\w)/g, '');

  // 3. Remove orphan degree or hash signs attached at end of words or standalone: e.g. "word#", "word°"
  str = str.replace(/(?<=[a-zA-Z0-9])[#°]+(?=\s|$|[.,;:!?])/g, '');
  str = str.replace(/(?:^|\s)[°](?=\s|$)/g, ' ');

  // 4. Remove orphan single asterisks without destroying Markdown bold (**bold**):
  // - Trailing single asterisk: "word*" or "word *" -> "word"
  str = str.replace(/(?<!\*)\*\s*$/g, '');
  // - Leading isolated asterisk on single lexical item: "*word" -> "word" (avoiding "**bold**")
  str = str.replace(/^\s*\*(?!\*)\s*/g, '');
  // - Single asterisk immediately following an alphanumeric word: "take* a seat" -> "take a seat"
  str = str.replace(/(?<=[a-zA-Z0-9])(?<!\*)\*(?!\*)(?=\s|[.,;:!?]|$)/g, '');
  // - Isolated asterisk surrounded by spaces: "word * word" -> "word word"
  str = str.replace(/(?<=\s)(?<!\*)\*(?!\*)(?=\s)/g, '');

  return str.replace(/[ \t]{2,}/g, ' ').trim();
}

