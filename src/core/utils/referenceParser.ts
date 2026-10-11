import type { StructuredReferenceColumn } from '../../types/schema';
import { stripEditorialPrefix, stripOrphanTypographicalMarkers } from '../text/textDeduplication';

/**
 * Parses unstructured or semi-structured reference text into hierarchical columns.
 */
export function parseHierarchicalReference(text: string | null | undefined): { title?: string; columns: StructuredReferenceColumn[] } {
  if (!text || !text.trim()) return { columns: [] };
  const clean = text.trim();

  // Split into paragraphs / blocks by double linebreaks
  const rawBlocks = clean.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (rawBlocks.length === 0) return { columns: [] };

  let potentialTitle: string | undefined = undefined;
  let blocksToProcess = rawBlocks;

  const firstBlock = rawBlocks[0];
  const firstBlockLines = firstBlock.split('\n').map((l) => l.trim()).filter(Boolean);
  const isFirstBlockHeading =
    firstBlockLines.length === 1 &&
    firstBlockLines[0].length <= 60 &&
    !firstBlockLines[0].includes(':') &&
    !/^[•*\-\d.)]/.test(firstBlockLines[0]) &&
    rawBlocks.length >= 2;

  if (isFirstBlockHeading) {
    potentialTitle = stripEditorialPrefix(firstBlockLines[0].replace(/^[*#\s—-]+|[:*#\s—-]+$/g, '').trim());
    blocksToProcess = rawBlocks.slice(1);
  }

  const candidateCols: StructuredReferenceColumn[] = [];

  for (const block of blocksToProcess) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const header = stripEditorialPrefix(stripOrphanTypographicalMarkers(lines[0].replace(/^[*#\s—\-:]+|[:*#\s—-]+$/g, '').trim()));
      const items = lines.slice(1).map((l) =>
        stripOrphanTypographicalMarkers(l.replace(/^[•*\-\s\d.)]+/, '').trim())
      ).filter(Boolean);

      if (header && items.length > 0) {
        candidateCols.push({ header, items });
      }
    } else if (lines.length === 1) {
      const colonMatch = lines[0].match(/^([^:]{2,40}):\s*(.+)$/);
      if (colonMatch) {
        const header = stripEditorialPrefix(stripOrphanTypographicalMarkers(colonMatch[1].replace(/^[*#\s—-]+|[:*#\s—-]+$/g, '').trim()));
        const items = colonMatch[2]
          .split(/[,;/•|]+/)
          .map((it) => stripOrphanTypographicalMarkers(it.trim()))
          .filter(Boolean);
        if (header && items.length > 0) {
          candidateCols.push({ header, items });
        }
      }
    }
  }

  if (candidateCols.length >= 2 || (candidateCols.length === 1 && candidateCols[0].items.length >= 2)) {
    return {
      title: potentialTitle,
      columns: candidateCols,
    };
  }

  return { title: potentialTitle, columns: candidateCols };
}

/**
 * Universal Grouping: Returns array of columns if structured categories are found.
 */
export function parseStructuredReferenceColumns(text: string | null | undefined): StructuredReferenceColumn[] {
  return parseHierarchicalReference(text).columns;
}

/**
 * Parses Markdown tables into structured headers and rows matrix.
 */
export function parseMarkdownTable(markdown?: string | null): { headers: string[]; rows: string[][] } | null {
  if (!markdown || !markdown.includes('|')) return null;
  const lines = markdown.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const pipeLines = lines.filter((l) => l.includes('|'));
  if (pipeLines.length < 2) return null;

  const parseRowCells = (line: string): string[] => {
    let clean = line.trim();
    if (clean.startsWith('|')) clean = clean.slice(1);
    if (clean.endsWith('|')) clean = clean.slice(0, -1);
    return clean.split('|').map((c) => stripOrphanTypographicalMarkers(c.trim()));
  };

  const isSeparator = (line: string): boolean => {
    const cells = parseRowCells(line);
    return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
  };

  const sepIdx = pipeLines.findIndex(isSeparator);
  if (sepIdx < 1) return null;

  const headers = parseRowCells(pipeLines[sepIdx - 1]);
  const rows = pipeLines
    .slice(sepIdx + 1)
    .filter((l) => !isSeparator(l))
    .map(parseRowCells)
    .filter((r) => r.length > 0 && r.some((c) => c.length > 0));

  return { headers, rows };
}
