import type { TargetSlot, SourceItem } from '../../types/schema';

export interface ParsedMatchingResult {
  targetSlots: TargetSlot[];
  sourceItems: SourceItem[];
  correctPairs: Record<string, string>;
  instruction?: string;
}

/**
 * Parses matching or pairing items from raw text (e.g. from subtitle, contextBody, or OCR fallback).
 * Recognizes common patterns like:
 * - '1 A - B' or '1. left - right' or 'left - right'
 * - 'k item : match' or '1 item : match'
 * - Semicolon or newline-separated matching pairs
 */
export function parseMatchingPairsFromText(text?: string | null): ParsedMatchingResult | null {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  if (!clean) return null;

  // Split into candidate segments
  let rawSegments: string[] = [];
  if (clean.includes('\n')) {
    rawSegments = clean.split(/\r?\n/);
  } else if (clean.includes(';') || clean.includes(' | ')) {
    rawSegments = clean.split(/[;|]/);
  } else if (/,\s*(?=\b\d+[\.\)\:\-]?\s+)/.test(clean)) {
    rawSegments = clean.split(/,\s*(?=\b\d+[\.\)\:\-]?\s+)/);
  } else if (/(?:^|\s)\d+[\.\)\:\-]?\s+/.test(clean)) {
    rawSegments = clean.split(/(?<=[^\d]|^)(?=\b\d+[\.\)\:\-]?\s+)/);
  } else {
    rawSegments = [clean];
  }

  const pairs: Array<{ left: string; right: string }> = [];
  let detectedInstruction = '';

  for (const seg of rawSegments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    // Check if segment is solely an instruction header (e.g. "Match words with definitions:")
    if (
      /^(?:match|connect|join|pair|relaciona|une|empareja)\b/i.test(trimmed) &&
      !/[-–—:=]\s*\w+/.test(trimmed)
    ) {
      detectedInstruction = trimmed;
      continue;
    }

    const cleanLine = trimmed.replace(/^[•\*\-\s]+/, '').trim();
    if (!cleanLine) continue;

    // Guard against non-matching lines: rules, dialogues, notes, steps, tips
    if (/^(?:rule|note|step|tip|speaker|grammar|language summary|vocabulary|example)\b/i.test(cleanLine)) {
      continue;
    }

    // 1) Slash dual item pattern: e.g. "1 A - arrive / B - depart" or "A - arrive / B - depart"
    const slashMatch = cleanLine.match(
      /^(?:(?:\d+|[a-zA-Z])[\.\)\:\-]?\s+)?(?:[a-zA-Z\d]\s*[-–:]\s*)([^\/\n]+?)\s*\/\s*(?:[a-zA-Z\d]\s*[-–:]\s*)([^\/\n]+)$/
    );
    if (slashMatch && slashMatch[1] && slashMatch[2] && !cleanLine.includes('http')) {
      let left = slashMatch[1].trim();
      let right = slashMatch[2].trim();
      left = left.replace(/^[a-zA-Z][\.\)\:\-]\s+/, '').trim();
      right = right.replace(/^[a-zA-Z][\.\)\:\-]\s+/, '').trim();
      if (left && right && left.length < 90 && right.length < 150) {
        pairs.push({ left, right });
        continue;
      }
    }

    // 2) Delimited pattern: e.g. "1 A - B", "1. take : photos", "1 take - a photo", "take : photos"
    const ordMatch = cleanLine.match(/^(\d+[\.\)\:\-]?\s+)/);
    const textWithoutOrd = ordMatch ? cleanLine.slice(ordMatch[1].length).trim() : cleanLine;

    const delimMatch = textWithoutOrd.match(/^([^\-–—:=]+?)\s*(?:[-–—]|->|=>|=|:\s+)\s*(.+)$/);
    if (delimMatch) {
      let left = delimMatch[1].trim();
      let right = delimMatch[2].trim();

      // Guard against dialogue turns like "John: Hello, how are you?"
      if (/:/.test(cleanLine) && !ordMatch && /^[A-Z][a-z]+:/.test(cleanLine)) {
        continue;
      }

      // Clean leading letter prefixes e.g. "a. take" -> "take", "A - word" -> "word" (requires punctuation + space)
      left = left.replace(/^[a-zA-Z][\.\)\:\-]\s+/, '').trim();
      right = right.replace(/^[a-zA-Z][\.\)\:\-]\s+/, '').trim();

      if (left && right && left.length < 90 && right.length < 150) {
        pairs.push({ left, right });
        continue;
      }
    }
  }

  if (pairs.length < 2) return null;

  const targetSlots: TargetSlot[] = [];
  const sourceItems: SourceItem[] = [];
  const correctPairs: Record<string, string> = {};

  pairs.forEach((p, idx) => {
    const slotId = `slot-${idx + 1}`;
    const srcId = `src-${idx + 1}`;
    const isEx =
      /\b(?:example|ejemplo|model)\b/i.test(p.right) ||
      /\b(?:example|ejemplo|model)\b/i.test(p.left);
    const cleanRight = p.right.replace(/\s*\((?:example|ejemplo|model)\)/i, '').trim();

    targetSlots.push({ id: slotId, label: p.left });
    sourceItems.push({
      id: srcId,
      text: cleanRight,
      correctTargetId: slotId,
      ...(isEx ? { isExample: true } : {}),
    });
    correctPairs[srcId] = slotId;
  });

  return {
    targetSlots,
    sourceItems,
    correctPairs,
    instruction: detectedInstruction || undefined,
  };
}

/**
 * Parses sequential answer key text patterns like '2 tidy up 3 look after 4 go out 5 take off'
 * or 'Answers: 2. b 3. a 4. c'.
 */
export function parseSequentialAnswerKeyFromText(text?: string | null): Record<string, string> | null {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  if (!clean) return null;

  // 1. Guard against narrative reading texts (multi-paragraph or long stories)
  if (clean.includes('\n\n') && clean.split(/\s+/).length > 35) {
    const paragraphs = clean.split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length >= 2 && !/^(?:answers?|answer\s*key|key|solucionario|claves?)\b/i.test(clean)) {
      return null;
    }
  }

  // 2. Guard against pure grammar rule boxes or tips
  if (/^(?:grammar focus|language summary|rules?|tip\b)/i.test(clean.replace(/^[•\*\-\s]+/, '').trim())) {
    return null;
  }

  // 3. Strip leading answer key headers
  const stripped = clean.replace(/^(?:answers?|answer\s*key|key|solucionario|claves?(?:\s+de\s+respuestas?)?|teacher'?s?\s*notes?)\s*[:\.-]?\s*/i, '').trim();

  // 4. Find all sequential numbered marker candidates
  // Matches "1.", "1)", "1:", "1 -", or just "1 " preceded by start or whitespace
  const markerRegex = /(?:^|[\s,;|\n]+)(\d{1,2})[\.\)\:\-]?\s+/g;

  interface MarkerPos {
    num: number;
    numStr: string;
    markerIndex: number;
    valueStartIndex: number;
  }

  const markers: MarkerPos[] = [];
  let m: RegExpExecArray | null;

  while ((m = markerRegex.exec(stripped)) !== null) {
    const num = parseInt(m[1], 10);
    // Standard exercises are numbered 1 to 50
    if (num < 1 || num > 50) continue;

    const markerFull = m[0];
    const markerIndex = m.index;
    const valueStartIndex = markerIndex + markerFull.length;

    // Check strict monotonicity and small step with previous marker
    if (markers.length > 0) {
      const prev = markers[markers.length - 1];
      const step = num - prev.num;
      // Must be strictly increasing and step <= 2 (e.g. 1, 2, 3 or 2, 3, 4, or 1, 3, 4)
      if (step <= 0 || step > 2) {
        continue;
      }
    }

    markers.push({
      num,
      numStr: m[1],
      markerIndex,
      valueStartIndex,
    });
  }

  // Must have at least 2 sequential markers
  if (markers.length < 2) return null;

  // The first marker in an answer key must be 1, 2, or 3
  if (markers[0].num > 3) return null;

  // Guard against narrative text: any text before the first marker must NOT be narrative prose
  const preText = stripped.slice(0, markers[0].markerIndex).trim();
  if (preText.length > 0) {
    if (preText.length > 30 || /\b(?:had|was|were|bought|traveled|because|said|lived|years?)\b/i.test(preText)) {
      return null;
    }
  }

  const entries: Record<string, string> = {};

  for (let i = 0; i < markers.length; i++) {
    const curr = markers[i];
    const nextStart = i + 1 < markers.length ? markers[i + 1].markerIndex : stripped.length;
    let val = stripped.slice(curr.valueStartIndex, nextStart).trim();

    // Clean leading/trailing punctuation / commas
    val = val.replace(/^[:\.-]\s*/, '').replace(/[,;]+$/, '').trim();

    // Guard: An answer key item cannot be empty or excessively long
    if (!val || val.length > 100) return null;

    // Guard: An answer key item should not contain multiple sentences
    if ((val.match(/\.\s+[A-Z]/g) || []).length >= 1) return null;

    entries[curr.numStr] = val;
  }

  if (Object.keys(entries).length < 2) return null;

  return entries;
}

export interface NumberedPremise {
  num: number;
  numStr: string;
  text: string;
}

/**
 * Extracts numbered premises (1..N) from text or subtitle (e.g. "1 take\n2 make" or "1 take 2 make").
 */
export function extractNumberedPremises(text?: string | null): NumberedPremise[] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (!clean) return [];

  // 1. Try line-by-line first
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const linePremises: NumberedPremise[] = [];

  for (const line of lines) {
    const lineMatch = line.match(/^(\d{1,2})[\.\)\:\-]?\s+(.+)$/);
    if (lineMatch) {
      const num = parseInt(lineMatch[1], 10);
      let content = lineMatch[2].trim();
      // Remove trailing blank tokens like "___" or "[ ? ]"
      content = content.replace(/[_\s\.\-]+$/, '').trim();
      if (content && content.length < 150) {
        linePremises.push({ num, numStr: lineMatch[1], text: content });
      }
    }
  }

  if (linePremises.length >= 2) {
    const isMonotonic = linePremises.every(
      (p, idx) => idx === 0 || p.num > linePremises[idx - 1].num
    );
    if (isMonotonic) return linePremises;
  }

  // 2. Try inline search e.g. "1 take 2 make 3 do 4 have"
  const markerRegex = /(?:^|[\s,;|\n]+)(\d{1,2})[\.\)\:\-]?\s+/g;
  interface Marker {
    num: number;
    numStr: string;
    markerIndex: number;
    valueStartIndex: number;
  }

  const markers: Marker[] = [];
  let m: RegExpExecArray | null;

  while ((m = markerRegex.exec(clean)) !== null) {
    const num = parseInt(m[1], 10);
    if (num < 1 || num > 50) continue;

    const markerFull = m[0];
    const markerIndex = m.index;
    const valueStartIndex = markerIndex + markerFull.length;

    if (markers.length > 0) {
      const prev = markers[markers.length - 1];
      const step = num - prev.num;
      if (step <= 0 || step > 2) continue;
    }

    markers.push({ num, numStr: m[1], markerIndex, valueStartIndex });
  }

  if (markers.length >= 2) {
    const inlinePremises: NumberedPremise[] = [];
    for (let i = 0; i < markers.length; i++) {
      const curr = markers[i];
      const nextStart = i + 1 < markers.length ? markers[i + 1].markerIndex : clean.length;
      let val = clean.slice(curr.valueStartIndex, nextStart).trim();
      val = val.replace(/^[:\.-]\s*/, '').replace(/[_\s\.\-,;]+$/, '').trim();
      if (val && val.length < 150) {
        inlinePremises.push({ num: curr.num, numStr: curr.numStr, text: val });
      }
    }

    if (inlinePremises.length >= 2) {
      return inlinePremises;
    }
  }

  return [];
}

/**
 * Normalización Defensiva de Consignas de Corrección a Reescritura Completa:
 * Detecta si 'interaction.type === "input_fields"' y las respuestas de 'listItems' o 'acceptedAnswers'
 * son predominantemente oraciones completas (longitud promedio > 3 palabras).
 * Si la 'instruction' o subtítulo contiene patrones de consigna ambigua (/correct the mistake/i, /find and correct/i)
 * sin mencionar 'rewrite', normaliza la consigna pedagógica a 'Rewrite each sentence, correcting the mistake.'
 * y establece un placeholder orientativo ('Write the complete corrected sentence...') en los reactivos.
 */
export function normalizeCorrectionToRewriteDirective(rawSlide: any): void {
  if (!rawSlide || !rawSlide.interaction || rawSlide.interaction.type !== 'input_fields') {
    return;
  }

  const it = rawSlide.interaction;
  const listItems = Array.isArray(it.listItems)
    ? it.listItems
    : Array.isArray(it.items)
    ? it.items
    : [];

  if (listItems.length === 0) return;

  // Recopilar respuestas para calcular promedio de palabras
  const answers: string[] = [];
  for (const item of listItems) {
    if (typeof item?.expectedAnswer === 'string' && item.expectedAnswer.trim()) {
      answers.push(item.expectedAnswer.trim());
    } else if (Array.isArray(item?.acceptedAnswers) && item.acceptedAnswers.length > 0) {
      const first = item.acceptedAnswers[0];
      if (typeof first === 'string' && first.trim()) {
        answers.push(first.trim());
      }
    }
  }

  if (answers.length === 0) return;

  const totalWords = answers.reduce((sum, ans) => {
    return sum + ans.split(/\s+/).filter(Boolean).length;
  }, 0);
  const avgWords = totalWords / answers.length;

  // Predominantemente oraciones completas: longitud promedio > 3 palabras
  if (avgWords <= 3) return;

  // Patrones de consigna ambigua de corrección sin mención de rewrite
  const mistakeCorrectionRegex =
    /\b(?:correct\s+(?:the\s+)?mistakes?|find\s+and\s+correct(?:\s+the\s+mistakes?)?|find\s+the\s+mistakes?|corrige\s+(?:el|los)?\s*errores?)\b/i;
  const mentionsRewrite = /\brewrite\b|\bre-write\b|\breescribe\b/i;

  const inst = it.instruction || '';
  const sub = rawSlide.subtitle || '';
  const combined = `${inst} ${sub}`.trim();

  const hasMistakePattern = mistakeCorrectionRegex.test(combined);
  const alreadyMentionsRewrite = mentionsRewrite.test(combined);

  if (hasMistakePattern && !alreadyMentionsRewrite) {
    const canonicalRewriteDirective = 'Rewrite each sentence, correcting the mistake.';

    // Normalizar la consigna pedagógica en interaction y slide
    if (!it.instruction || mistakeCorrectionRegex.test(it.instruction)) {
      it.instruction = canonicalRewriteDirective;
    } else if (mistakeCorrectionRegex.test(sub)) {
      it.instruction = canonicalRewriteDirective;
    }

    if (rawSlide.subtitle && mistakeCorrectionRegex.test(rawSlide.subtitle)) {
      rawSlide.subtitle = canonicalRewriteDirective;
    }

    if ((rawSlide as any).instruction && mistakeCorrectionRegex.test((rawSlide as any).instruction)) {
      (rawSlide as any).instruction = canonicalRewriteDirective;
    }

    // Establecer placeholder orientativo en reactivos sin placeholder
    for (const item of listItems) {
      if (item && !item.placeholder) {
        item.placeholder = 'Write the complete corrected sentence...';
      }
    }
  }
}

/**
 * Normalizes an extracted slide ensuring agnostic support for 'buckets_matching' (1-to-1 matching and categorization).
 * - Preserves type: 'buckets_matching' and sets format: 'buckets' (or 'matching').
 * - Syncs targetSlots, buckets, sourceItems, tokens, and correctPairs.
 * - Applies contingency parsing if pairs are trapped in subtitle, contextBody, or raw text.
 */
export function normalizeSlide(
  rawSlide: any,
  options?: {
    forcedTargetType?: string;
    harvestedAnswerKeys?: Record<string, Record<string, string>>;
  }
): any {
  if (!rawSlide || typeof rawSlide !== 'object') return rawSlide;

  const isForcedMatching =
    options?.forcedTargetType === 'buckets_matching' ||
    options?.forcedTargetType === 'matching';

  // 1. Direct handling if interaction is explicitly buckets_matching
  if (rawSlide.interaction && rawSlide.interaction.type === 'buckets_matching') {
    rawSlide.format = 'buckets';
    rawSlide.layout = 'single_column';
    rawSlide.referenceContent = null;
    if (rawSlide.contextBody) {
      delete rawSlide.contextBody;
    }

    const it = rawSlide.interaction;
    let targetSlots = Array.isArray(it.targetSlots) ? it.targetSlots : [];
    let buckets = Array.isArray(it.buckets) ? it.buckets : [];

    if (targetSlots.length > 0 && buckets.length === 0) {
      buckets = targetSlots.map((ts: any) => ({
        id: ts.id || `slot-${Date.now()}`,
        label: ts.label || 'Target',
        description: ts.description,
        color: ts.color,
        items: Array.isArray(ts.items) ? ts.items : [],
      }));
    } else if (buckets.length > 0 && targetSlots.length === 0) {
      targetSlots = buckets.map((b: any) => ({
        id: b.id || `slot-${Date.now()}`,
        label: b.label || 'Target',
        description: b.description,
        color: b.color,
        items: Array.isArray(b.items) ? b.items : [],
      }));
    }

    it.targetSlots = targetSlots;
    it.buckets = buckets.map((b: any) => ({
      ...b,
      items: Array.isArray(b.items) ? b.items : [],
    }));

    let sourceItems = Array.isArray(it.sourceItems) ? it.sourceItems : [];
    let tokens = Array.isArray(it.tokens) ? it.tokens : [];

    if (sourceItems.length > 0 && tokens.length === 0) {
      tokens = sourceItems.map((si: any) => ({
        id: si.id || `src-${Date.now()}`,
        text: si.text || '',
        correctBucketId:
          si.correctTargetId ||
          (it.correctPairs && typeof it.correctPairs === 'object' && it.correctPairs[si.id]) ||
          '',
        isExample: si.isExample,
        hint: si.hint,
      }));
    } else if (tokens.length > 0 && sourceItems.length === 0) {
      sourceItems = tokens.map((tk: any) => ({
        id: tk.id || `src-${Date.now()}`,
        text: tk.text || '',
        correctTargetId: tk.correctBucketId || '',
        isExample: tk.isExample,
        hint: tk.hint,
      }));
    }

    it.sourceItems = sourceItems;
    it.tokens = tokens;

    // Normalize correctPairs (Record<string, string>)
    const pairsMap: Record<string, string> = {};
    if (it.correctPairs) {
      if (typeof it.correctPairs === 'object' && !Array.isArray(it.correctPairs)) {
        Object.assign(pairsMap, it.correctPairs);
      } else if (Array.isArray(it.correctPairs)) {
        for (const p of it.correctPairs) {
          if (p && p.sourceId && p.targetId) {
            pairsMap[p.sourceId] = p.targetId;
          }
        }
      }
    }

    // Populate missing mappings from sourceItems and tokens
    for (const si of it.sourceItems) {
      if (si.id && si.correctTargetId && !pairsMap[si.id]) {
        pairsMap[si.id] = si.correctTargetId;
      }
    }
    for (const tk of it.tokens) {
      if (tk.id && tk.correctBucketId && !pairsMap[tk.id]) {
        pairsMap[tk.id] = tk.correctBucketId;
      }
    }
    it.correctPairs = pairsMap;

    return rawSlide;
  }

  // 1.5. Normalización Agnóstica de 'input_fields' incompletos y Mapeo a 'buckets_matching'
  if (rawSlide.interaction && rawSlide.interaction.type === 'input_fields') {
    const it = rawSlide.interaction;
    const listItems = Array.isArray(it.listItems)
      ? it.listItems
      : Array.isArray(it.items)
      ? it.items
      : [];
    const hasListItems = listItems.length > 0;
    const hasTable =
      it.layoutMode === 'table' &&
      Array.isArray(it.tableRows) &&
      it.tableRows.length > 0;
    const hasParagraph =
      it.layoutMode === 'inline_paragraph' && Boolean(it.paragraphTemplate);

    // a) Validar si 'listItems' está ausente o vacío:
    if (!hasListItems && !hasTable && !hasParagraph) {
      const candidateTexts = [
        rawSlide.subtitle,
        it.instruction,
        rawSlide.title,
        rawSlide.contextBody,
        rawSlide.referenceContent?.content,
        rawSlide.referenceContent?.body,
        (rawSlide as any)._rawInstructionText,
        rawSlide.notes,
      ].filter(Boolean) as string[];

      const combinedText = candidateTexts.join('\n');

      const matchingTermsRegex =
        /\b(?:match(?:ing)?|une|relaciona|opposite|opposites|halves|column|columns|empareja|corresponden?|collocation)\b/i;
      const isMatching =
        isForcedMatching ||
        matchingTermsRegex.test(
          `${it.instruction || ''} ${rawSlide.subtitle || ''} ${rawSlide.title || ''}`
        );

      const wordBank = Array.isArray(it.wordBank)
        ? (it.wordBank as any[])
            .map((w) => (typeof w === 'string' ? w : w?.text || ''))
            .filter(Boolean)
        : [];

      // Check for explicit matching pairs in text (e.g. "1 take - a photo" or "take : photos")
      const parsedPairs = parseMatchingPairsFromText(combinedText);

      // * Si la instrucción contiene términos de correspondencia ("match", "une", "relaciona", "opposite") o existe un 'wordBank' de opciones con señal de matching:
      if (isMatching || (wordBank.length > 0 && matchingTermsRegex.test(combinedText))) {
        if (parsedPairs && parsedPairs.targetSlots.length >= 2) {
          rawSlide.interaction = {
            id: it.id || `interaction-${rawSlide.id}`,
            type: 'buckets_matching',
            instruction:
              parsedPairs.instruction ||
              it.instruction ||
              rawSlide.subtitle ||
              rawSlide.title ||
              'Match the items:',
            targetSlots: parsedPairs.targetSlots,
            sourceItems: parsedPairs.sourceItems,
            correctPairs: parsedPairs.correctPairs,
            buckets: parsedPairs.targetSlots.map((ts) => ({
              id: ts.id,
              label: ts.label,
              items: [],
            })),
            tokens: parsedPairs.sourceItems.map((si) => ({
              id: si.id,
              text: si.text,
              correctBucketId: si.correctTargetId || '',
              isExample: si.isExample,
            })),
          };
          rawSlide.format = 'buckets';
          rawSlide.layout = 'single_column';
          rawSlide.referenceContent = null;
          rawSlide.isGraded = true;
          return rawSlide;
        }

        // - Si el texto o subtítulo contiene premisas numeradas (1..N), extraerlas como 'targetSlots'.
        let premises = extractNumberedPremises(rawSlide.subtitle);
        if (premises.length < 2) premises = extractNumberedPremises(combinedText);

        if (premises.length >= 2) {
          const targetSlots = premises.map((p, idx) => ({
            id: `slot-${idx + 1}`,
            label: p.text,
          }));

          // - Convertir 'wordBank' en 'sourceItems' [{ id: 'src-k', text: wordBank[k] }].
          const itemsSource =
            wordBank.length >= premises.length
              ? wordBank.slice(0, premises.length)
              : wordBank.length > 0
              ? wordBank
              : premises.map((p) => p.text);

          const sourceItems = itemsSource.map((text, idx) => {
            const slotId = targetSlots[idx]?.id || `slot-${idx + 1}`;
            return {
              id: `src-${idx + 1}`,
              text,
              correctTargetId: slotId,
            };
          });

          const correctPairs: Record<string, string> = {};
          sourceItems.forEach((si, idx) => {
            const slotId = targetSlots[idx]?.id || `slot-${idx + 1}`;
            correctPairs[si.id] = slotId;
          });

          // - Transformar la interacción a type: 'buckets_matching', format: 'buckets', layout: 'single_column'.
          rawSlide.interaction = {
            id: it.id || `interaction-${rawSlide.id}`,
            type: 'buckets_matching',
            instruction:
              it.instruction ||
              rawSlide.subtitle ||
              rawSlide.title ||
              'Match the items:',
            targetSlots,
            sourceItems,
            correctPairs,
            buckets: targetSlots.map((ts) => ({
              id: ts.id,
              label: ts.label,
              items: [],
            })),
            tokens: sourceItems.map((si) => ({
              id: si.id,
              text: si.text,
              correctBucketId: si.correctTargetId,
            })),
          };
          rawSlide.format = 'buckets';
          rawSlide.layout = 'single_column';
          rawSlide.referenceContent = null;
          rawSlide.isGraded = true;
          return rawSlide;
        } else if (wordBank.length >= 2) {
          // Si no hay premisas numeradas pero wordBank tiene suficientes términos en matching
          const half = Math.floor(wordBank.length / 2);
          const targetSlots = wordBank.slice(0, half).map((w, idx) => ({
            id: `slot-${idx + 1}`,
            label: w,
          }));
          const sourceItems = wordBank.slice(half).map((w, idx) => ({
            id: `src-${idx + 1}`,
            text: w,
            correctTargetId: targetSlots[idx]?.id || `slot-${idx + 1}`,
          }));
          const correctPairs: Record<string, string> = {};
          sourceItems.forEach((si, idx) => {
            const slotId = targetSlots[idx]?.id || `slot-${idx + 1}`;
            correctPairs[si.id] = slotId;
          });

          rawSlide.interaction = {
            id: it.id || `interaction-${rawSlide.id}`,
            type: 'buckets_matching',
            instruction:
              it.instruction ||
              rawSlide.subtitle ||
              rawSlide.title ||
              'Match the items:',
            targetSlots,
            sourceItems,
            correctPairs,
            buckets: targetSlots.map((ts) => ({
              id: ts.id,
              label: ts.label,
              items: [],
            })),
            tokens: sourceItems.map((si) => ({
              id: si.id,
              text: si.text,
              correctBucketId: si.correctTargetId,
            })),
          };
          rawSlide.format = 'buckets';
          rawSlide.layout = 'single_column';
          rawSlide.referenceContent = null;
          rawSlide.isGraded = true;
          return rawSlide;
        }
      }

      // * Si no es matching sino fill_blanks, y 'listItems' no vino en el objeto pero hay texto con premisas,
      // sintetizar 'listItems' con su correspondiente acceptedAnswers para que cumpla el schema de Zod.
      let premises = extractNumberedPremises(rawSlide.subtitle);
      if (premises.length === 0) premises = extractNumberedPremises(combinedText);

      let synthesizedItems: any[] = [];
      if (premises.length > 0) {
        synthesizedItems = premises.map((p, idx) => {
          const ans = wordBank[idx] || '';
          let prompt = p.text;
          if (!prompt.includes('{{blank}}')) {
            prompt = `${p.num}. ${prompt} {{blank}}`;
          } else if (!/^\d+[\.\)]/.test(prompt)) {
            prompt = `${p.num}. ${prompt}`;
          }
          return {
            id: `item-${p.num}`,
            prompt,
            expectedAnswer: ans || undefined,
            acceptedAnswers: ans ? [ans] : [],
          };
        });
      } else if (wordBank.length > 0) {
        synthesizedItems = wordBank.map((wb, idx) => ({
          id: `item-${idx + 1}`,
          prompt: `${idx + 1}. {{blank}}`,
          expectedAnswer: wb,
          acceptedAnswers: [wb],
        }));
      } else {
        synthesizedItems = [
          {
            id: 'item-1',
            prompt: '1. {{blank}}',
            acceptedAnswers: [],
          },
        ];
      }

      it.listItems = synthesizedItems;
      it.items = synthesizedItems;
      it.layoutMode = it.layoutMode || 'list';
      rawSlide.format = 'fill_blanks';
      rawSlide.layout = rawSlide.referenceContent
        ? rawSlide.layout || 'split_50_50'
        : 'single_column';
      rawSlide.isGraded = true;
    } else {
      // Tiene listItems: asegurar layoutMode e items
      if (!it.items && it.listItems) {
        it.items = it.listItems;
      }
      it.layoutMode = it.layoutMode || 'list';
    }

    // Normalización Defensiva: Consignas de Corrección a Reescritura Completa
    normalizeCorrectionToRewriteDirective(rawSlide);
    return rawSlide;
  }

  // If slide already has another valid interaction, do not mutate unless forced
  if (rawSlide.interaction && !isForcedMatching) {
    return rawSlide;
  }

  // Do not perform matching contingency if text is cloze or slide is a pure reading/theory passage
  const slideText = `${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${(rawSlide.referenceContent as any)?.content || ''} ${rawSlide.contextBody || ''} ${(rawSlide.interaction as any)?.passageText || ''}`;
  if (
    /\{\{\s*gap-/i.test(slideText) ||
    rawSlide.format === 'cloze_multichoice' ||
    rawSlide.interaction?.type === 'cloze_multichoice' ||
    options?.forcedTargetType === 'cloze_multichoice'
  ) {
    return rawSlide;
  }

  // 2. Sequential answer key rescue from referenceContent:
  // Si una diapositiva llega sin 'interaction' (o interaction.type es indefinido)
  // pero 'referenceContent.content' contiene un solucionario secuencial (patrón '2 respuesta 3 respuesta...'):
  if (!rawSlide.interaction || !rawSlide.interaction.type) {
    const refText = (
      rawSlide.referenceContent?.content ||
      rawSlide.referenceContent?.body ||
      ''
    ).trim();

    if (refText) {
      const sequentialKeys = parseSequentialAnswerKeyFromText(refText);
      if (sequentialKeys && Object.keys(sequentialKeys).length >= 2) {
        // Retirar ese solucionario de referenceContent para que no se muestre como texto visible de lectura
        rawSlide.referenceContent = null;
        if (rawSlide.contextBody) {
          delete rawSlide.contextBody;
        }

        const entries = Object.entries(sequentialKeys);
        const matchingPairs = parseMatchingPairsFromText(refText);

        const isMatchingDirective =
          Boolean(matchingPairs && matchingPairs.targetSlots.length >= 2) ||
          isForcedMatching ||
          entries.some(([, val]) => /[-–—]|->|=>|=|:\s+/.test(val)) ||
          /\b(?:match|column|opposites|halves|empareja|relaciona)\b/i.test(
            `${rawSlide.title || ''} ${rawSlide.subtitle || ''}`
          );

        if (isMatchingDirective) {
          // Construir buckets_matching
          if (matchingPairs && matchingPairs.targetSlots.length >= 2) {
            rawSlide.interaction = {
              type: 'buckets_matching',
              id: rawSlide.interaction?.id || `interaction-${rawSlide.id}`,
              instruction:
                matchingPairs.instruction ||
                rawSlide.subtitle ||
                rawSlide.title ||
                'Match the items:',
              targetSlots: matchingPairs.targetSlots,
              sourceItems: matchingPairs.sourceItems,
              correctPairs: matchingPairs.correctPairs,
              buckets: matchingPairs.targetSlots.map((ts) => ({
                id: ts.id,
                label: ts.label,
                items: [],
              })),
              tokens: matchingPairs.sourceItems.map((si) => ({
                id: si.id,
                text: si.text,
                correctBucketId: si.correctTargetId || '',
                isExample: si.isExample,
              })),
            };
          } else {
            const targetSlots: TargetSlot[] = [];
            const sourceItems: SourceItem[] = [];
            const correctPairs: Record<string, string> = {};

            entries.forEach(([num, val]) => {
              const slotId = `slot-${num}`;
              const srcId = `src-${num}`;

              const pairMatch = val.match(/^([^\-–—:=]+?)\s*(?:[-–—]|->|=>|=|:\s+)\s*(.+)$/);
              if (pairMatch) {
                const left = pairMatch[1].trim();
                const right = pairMatch[2].trim();
                targetSlots.push({ id: slotId, label: left });
                sourceItems.push({ id: srcId, text: right, correctTargetId: slotId });
              } else {
                targetSlots.push({ id: slotId, label: `Item ${num}` });
                sourceItems.push({ id: srcId, text: val, correctTargetId: slotId });
              }
              correctPairs[srcId] = slotId;
            });

            rawSlide.interaction = {
              id: rawSlide.interaction?.id || `interaction-${rawSlide.id}`,
              type: 'buckets_matching',
              instruction: rawSlide.subtitle || rawSlide.title || 'Match the items:',
              targetSlots,
              sourceItems,
              correctPairs,
              buckets: targetSlots.map((ts) => ({ id: ts.id, label: ts.label, items: [] })),
              tokens: sourceItems.map((si) => ({
                id: si.id,
                text: si.text,
                correctBucketId: si.correctTargetId || '',
                isExample: si.isExample,
              })),
            };
          }
          rawSlide.format = 'buckets';
          rawSlide.layout = 'single_column';
          rawSlide.isGraded = true;
          return rawSlide;
        } else {
          // Construir fill_blanks (input_fields)
          const listItems = entries.map(([num, val]) => {
            let prompt = `${num}. {{blank}}`;
            if (rawSlide.subtitle) {
              const pMatch = rawSlide.subtitle.match(
                new RegExp(`(?:^|\\n)\\s*${num}[\\.\\)]?\\s*([^\\n]+)`)
              );
              if (pMatch && pMatch[1].trim().length > 3) {
                const rawP = pMatch[1].trim();
                prompt = rawP.includes('{{blank}}') ? `${num}. ${rawP}` : `${num}. ${rawP} {{blank}}`;
              }
            }
            return {
              id: `item-${num}`,
              prompt,
              expectedAnswer: val,
              acceptedAnswers: [val],
            };
          });

          rawSlide.interaction = {
            id: rawSlide.interaction?.id || `interaction-${rawSlide.id}`,
            type: 'input_fields',
            layoutMode: 'list',
            instruction:
              rawSlide.subtitle ||
              rawSlide.title ||
              'Complete the sentences with the correct words:',
            wordBank: entries.map(([, val]) => val),
            listItems,
            items: listItems,
          };
          rawSlide.format = 'fill_blanks';
          rawSlide.layout = 'single_column';
          rawSlide.isGraded = true;
          return rawSlide;
        }
      }
    }
  }

  // Do not mutate reference slides if not forced
  if (rawSlide.referenceContent && !isForcedMatching) {
    return rawSlide;
  }

  // 2. Agnostic contingency mechanism:
  // If interaction is null or missing, inspect subtitle and raw texts for matching patterns
  // (e.g. '1 A - B', 'k item : match')
  const textCandidates = [
    rawSlide.subtitle,
    (rawSlide as any)._rawInstructionText,
  ].filter(Boolean) as string[];

  for (const text of textCandidates) {
    const parsed = parseMatchingPairsFromText(text);
    if (parsed && parsed.targetSlots.length >= 2) {
      rawSlide.interaction = {
        type: 'buckets_matching',
        id: rawSlide.interaction?.id || `interaction-${rawSlide.id}`,
        instruction:
          parsed.instruction ||
          rawSlide.subtitle ||
          rawSlide.title ||
          'Match the items:',
        targetSlots: parsed.targetSlots,
        sourceItems: parsed.sourceItems,
        correctPairs: parsed.correctPairs,
        buckets: parsed.targetSlots.map((ts) => ({
          id: ts.id,
          label: ts.label,
          items: [],
        })),
        tokens: parsed.sourceItems.map((si) => ({
          id: si.id,
          text: si.text,
          correctBucketId: si.correctTargetId || '',
          isExample: si.isExample,
        })),
      };
      rawSlide.format = 'buckets';
      rawSlide.layout = 'single_column';
      rawSlide.referenceContent = null;
      if (rawSlide.contextBody && parseMatchingPairsFromText(rawSlide.contextBody)) {
        delete rawSlide.contextBody;
      }
      if (rawSlide.subtitle && parseMatchingPairsFromText(rawSlide.subtitle)) {
        rawSlide.subtitle = parsed.instruction || undefined;
      }
      break;
    }
  }

  if (isForcedMatching && (!rawSlide.interaction || rawSlide.interaction.type !== 'buckets_matching')) {
    rawSlide.format = 'buckets';
    rawSlide.layout = 'single_column';
    rawSlide.referenceContent = null;
  }

  return rawSlide;
}
