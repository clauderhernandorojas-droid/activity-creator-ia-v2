/**
 * Pure text normalization utility for ELT student responses.
 * Zero-UI: No React, no Tailwind, no Zustand.
 */

export function normalizeAnswer(text: string): string {
  if (!text) return '';

  return (
    text
      // Normalize Unicode characters to standard form
      .normalize('NFD')
      // Homogenize curved and accented apostrophes to standard straight apostrophe
      .replace(/[’‘`´]/g, "'")
      // Normalize curly quotes
      .replace(/[“”]/g, '"')
      // Remove trailing punctuation (. ? ! , ; :)
      .replace(/[.?!,:;]+$/, '')
      // Replace multiple spaces/tabs with a single space
      .replace(/\s+/g, ' ')
      // Trim leading and trailing whitespace
      .trim()
      // Lowercase for case-insensitive matching
      .toLowerCase()
  );
}
