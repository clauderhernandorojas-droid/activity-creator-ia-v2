/**
 * Comprehensive regular expression to match internal template/placeholder tokens in prompts:
 * - Template markers: {{blank}}, {{ blank }}, {{1}}, {{gap}}, {{_}}
 * - Bracketed markers: [blank], [1], [___], [....], [—]
 * - Underscore or dash sequences: __, ___, ____, _______, ——
 * - Ellipsis sequences: ..., ...., ........
 * - Parenthesized blank markers: (blank), (___), (...)
 */
export const BLANK_DELIMITER_REGEX =
  /\{\{\s*(?:blank|\d+|gap|_)\s*\}\}|\[\s*(?:blank|\?|&\w+;\s*\?\s*&\w+;|\d+|gap|_+|\.{2,}|—+)\s*\]|\((?:blank|_+|\.{3,})\)|(?:_{2,}|—{2,}|\.{3,})/i;

/**
 * Global version to clean all occurrences from text.
 */
export const BLANK_DELIMITER_GLOBAL_REGEX =
  /\{\{\s*(?:blank|\d+|gap|_)\s*\}\}|\[\s*(?:blank|\?|&\w+;\s*\?\s*&\w+;|\d+|gap|_+|\.{2,}|—+)\s*\]|\((?:blank|_+|\.{3,})\)|(?:_{2,}|—{2,}|\.{3,})/gi;

/**
 * Checks if a string contains any internal blank delimiter tokens.
 */
export function hasBlankToken(text: string): boolean {
  if (!text) return false;
  return BLANK_DELIMITER_REGEX.test(text);
}

/**
 * Cleans all internal delimiter tokens from text, ensuring no template markers
 * (e.g. {{blank}}, [blank], ___) leak to the user as raw text.
 */
export function cleanBlankMarkers(text: string): string {
  if (!text) return '';
  return text.replace(BLANK_DELIMITER_GLOBAL_REGEX, '').trim();
}

export interface ClozeSplitResult {
  hasBlank: boolean;
  prefix: string;
  suffix: string;
}

/**
 * Segments a sentence prompt around the primary blank replacement token.
 * Guarantees that the delimiter token itself is completely omitted from prefix and suffix.
 */
export function splitSentenceAtBlank(text: string): ClozeSplitResult {
  if (!text) {
    return { hasBlank: false, prefix: '', suffix: '' };
  }

  const match = text.match(BLANK_DELIMITER_REGEX);
  if (!match || match.index === undefined) {
    return {
      hasBlank: false,
      prefix: text.trim(),
      suffix: '',
    };
  }

  const rawBefore = text.slice(0, match.index);
  const rawAfter = text.slice(match.index + match[0].length);

  // Clean any subsequent stray blank delimiters so no raw tokens leak
  const cleanedAfter = rawAfter.replace(BLANK_DELIMITER_GLOBAL_REGEX, '');

  return {
    hasBlank: true,
    prefix: rawBefore,
    suffix: cleanedAfter,
  };
}
