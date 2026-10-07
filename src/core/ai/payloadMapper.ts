import type {
  ExtractedBlock,
  ReferenceBlock,
  ReferenceTextBlock,
  ReferenceTableBlock,
  InteractionBlock,
  InputFieldsBlock,
  InputFieldTableCell,
  SelectionBlock,
  SelectionOption,
  BucketsMatchingBlock,
  SequenceBlock,
  BucketToken,
  TargetSlot,
  SourceItem,
  Slide,
  InputFieldListItem
} from '../../types/schema';
import { generateGrammarVariants } from '../evaluators/fillBlankValidator';
import { isDuplicateReferenceContent } from '../text/textDeduplication';
import { stripMetaComments, stripLeadingDuplicateTitle } from './digitizeBook';

export type PedagogicalRole = 
  | 'interaction_inputs' 
  | 'interaction_selection' 
  | 'interaction_buckets' 
  | 'interaction_sequence' 
  | 'reference_text' 
  | 'reference_table';

const BUCKET_COLORS = [
  '#4f46e5', // Indigo
  '#059669', // Emerald
  '#7c3aed', // Purple
  '#d97706', // Amber
  '#dc2626', // Rose
  '#0284c7', // Sky
  '#ea580c', // Orange
  '#0d9488'  // Teal
];

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'item';
}

/**
 * Pure 1:1 Universal Mapper for Input Fields (Fill in Blanks / Matching Tables / 2D Grids)
 */
export function mapBlockToInputFields(block: ExtractedBlock): InputFieldsBlock {
  const parsed = block.parsedData || {};

  // Pure 1:1 extraction of Word Bank
  const wordBank: string[] | undefined = Array.isArray(parsed.wordBank) && parsed.wordBank.length > 0
    ? parsed.wordBank.map((w: any) => String(w).trim()).filter(Boolean)
    : undefined;

  const rawTableHeaders = Array.isArray(parsed.tableHeaders)
    ? parsed.tableHeaders
    : (Array.isArray(parsed.headers) ? parsed.headers : []);
  const rawTableRows = Array.isArray(parsed.tableRows)
    ? parsed.tableRows
    : (Array.isArray(parsed.rows) ? parsed.rows : []);

  const hasTableRows = rawTableRows.length > 0;
  const isTableLayout = Boolean(
    parsed.layoutMode === 'table' ||
    hasTableRows
  );

  let tableHeaders: string[] = [];
  let tableRows: InputFieldTableCell[][] = [];

  if (hasTableRows) {
    tableHeaders = rawTableHeaders.map((h: any) => String(h).trim()).filter(Boolean);

    // If headers are missing, auto-create generic Column headers based on max row length
    if (tableHeaders.length === 0) {
      const maxCols = Math.max(...rawTableRows.map((r: any) => (Array.isArray(r) ? r.length : 0)));
      for (let c = 0; c < maxCols; c++) {
        tableHeaders.push(`Columna ${c + 1}`);
      }
    }

    tableRows = rawTableRows.map((row: any[], rIdx: number) => {
      if (!Array.isArray(row)) return [];
      return row.map((cell: any, cIdx: number) => {
        const isInput = Boolean(cell?.isInput);
        const text = String(cell?.text || '').trim();
        const expectedAnswer = String(cell?.expectedAnswer || (isInput && text ? text : '')).trim();
        let acceptedAnswers: string[] = [];
        if (Array.isArray(cell?.acceptedAnswers) && cell.acceptedAnswers.length > 0) {
          acceptedAnswers = cell.acceptedAnswers.map((a: any) => String(a).trim()).filter(Boolean);
        } else if (expectedAnswer) {
          acceptedAnswers = [expectedAnswer];
        }

        if (expectedAnswer && !acceptedAnswers.includes(expectedAnswer)) {
          acceptedAnswers.unshift(expectedAnswer);
        }

        // Expand standard grammar variants (contractions, spelling)
        const variantSet = new Set<string>(acceptedAnswers);
        acceptedAnswers.forEach((a) => {
          generateGrammarVariants(a).forEach((v) => variantSet.add(v));
        });

        const isExample = Boolean(cell?.isExample);
        const hint = cell?.hint || cell?.explanation ? String(cell.hint || cell.explanation).trim() : undefined;

        return {
          text,
          isInput,
          inputId: isInput ? `cell-${rIdx}-${cIdx}` : undefined,
          acceptedAnswers: Array.from(variantSet),
          expectedAnswer: expectedAnswer || (acceptedAnswers[0] ?? ''),
          isExample,
          hint,
        };
      });
    });
  }

  const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : [];

  // Pure 1:1 transformation of items
  const listItems: InputFieldListItem[] = rawItems.map((item: any, idx: number) => {
    const rawPrompt = typeof item === 'object' && item !== null
      ? String(item.prompt || item.text || '').trim()
      : String(item).trim();
    const explanationText = typeof item === 'object' && item !== null
      ? String(item.explanation || item.hint || '').trim()
      : '';
    const isPureNumber = /^(?:item\s*)?\d+[.)]?$/i.test(rawPrompt) || rawPrompt === '';
    const prompt = isPureNumber && explanationText
      ? (rawPrompt ? `${rawPrompt} _______ : ${explanationText}` : `${idx + 1}. _______ : ${explanationText}`)
      : (rawPrompt || `Item ${idx + 1}`);

    const expectedAnswer = typeof item === 'object' && item !== null
      ? String(item.expectedAnswer || item.answer || '').trim()
      : '';

    let acceptedAnswers: string[] = [];
    if (typeof item === 'object' && item !== null && Array.isArray(item.acceptedAnswers) && item.acceptedAnswers.length > 0) {
      acceptedAnswers = item.acceptedAnswers.map((a: any) => String(a).trim()).filter(Boolean);
    } else if (expectedAnswer) {
      acceptedAnswers = [expectedAnswer];
    }

    if (expectedAnswer && !acceptedAnswers.includes(expectedAnswer)) {
      acceptedAnswers.unshift(expectedAnswer);
    }

    // Expand standard grammar variants (contractions, spelling)
    const variantSet = new Set<string>(acceptedAnswers);
    acceptedAnswers.forEach((a) => {
      generateGrammarVariants(a).forEach((v) => variantSet.add(v));
    });

    const isExample = typeof item === 'object' && item !== null
      ? Boolean(item.isExample)
      : false;

    const explanation = typeof item === 'object' && item !== null
      ? (item.explanation || item.hint || undefined)
      : undefined;

    return {
      id: generateId('item'),
      prompt,
      expectedAnswer: expectedAnswer || (acceptedAnswers[0] ?? ''),
      acceptedAnswers: Array.from(variantSet),
      isExample,
      hint: explanation,
      explanation,
      prefix: typeof item === 'object' && item !== null ? item.prefix : undefined,
    };
  });

  // Synthesize fallback listItems from table input cells if items was not provided
  // to guarantee no downstream components treat the block as empty
  if (listItems.length === 0 && tableRows.length > 0) {
    tableRows.forEach((row, rIdx) => {
      row.forEach((cell, cIdx) => {
        if (cell.isInput) {
          const colHeader = tableHeaders[cIdx] ? `[${tableHeaders[cIdx]}] ` : '';
          const rowGuide = row.find((c) => !c.isInput && c.text)?.text;
          const prompt = rowGuide ? `${rowGuide} → ${colHeader}_______` : `Fila ${rIdx + 1}, Col ${cIdx + 1} _______`;
          listItems.push({
            id: cell.inputId || `cell-${rIdx}-${cIdx}`,
            prompt,
            expectedAnswer: cell.expectedAnswer || '',
            acceptedAnswers: cell.acceptedAnswers,
            isExample: cell.isExample,
            hint: cell.hint,
            explanation: cell.hint,
          });
        }
      });
    });
  }

  return {
    type: 'input_fields',
    id: generateId('inter-inp'),
    instruction: parsed.instruction || parsed.title || 'Escribe la respuesta correcta en cada espacio:',
    layoutMode: isTableLayout && tableRows.length > 0 ? 'table' : 'list',
    wordBank,
    listItems,
    tableHeaders,
    tableRows,
    paragraphTemplate: '',
    paragraphInputs: {}
  };
}

/**
 * Pure 1:1 Universal Mapper for Buckets / Universal Matching
 */
export function mapBlockToBuckets(block: ExtractedBlock): BucketsMatchingBlock {
  const parsed = block.parsedData || {};

  // Extract target slots from buckets or targetSlots
  const rawBuckets: any[] = Array.isArray(parsed.buckets) && parsed.buckets.length > 0
    ? parsed.buckets
    : (Array.isArray(parsed.targetSlots) && parsed.targetSlots.length > 0
        ? parsed.targetSlots
        : []);

  // If no explicit buckets/targetSlots, infer from items' expectedAnswer
  if (rawBuckets.length === 0 && Array.isArray(parsed.items) && parsed.items.length > 0) {
    const inferred = Array.from(
      new Set(
        parsed.items
          .map((it: any) => typeof it === 'object' && it ? String(it.expectedAnswer || it.target || '').trim() : '')
          .filter(Boolean)
      )
    );
    if (inferred.length > 0) {
      rawBuckets.push(...inferred);
    }
  }

  // Fallback: if rawBuckets is still empty, and wordBank was provided without items
  if (
    rawBuckets.length === 0 &&
    Array.isArray(parsed.wordBank) &&
    parsed.wordBank.length > 0 &&
    (!parsed.items || parsed.items.length === 0)
  ) {
    rawBuckets.push(...parsed.wordBank);
  }

  const targetSlots: TargetSlot[] = rawBuckets.map((cat: any, idx: number) => {
    const label = typeof cat === 'string' ? cat.trim() : String(cat.label || cat.name || `Categoría ${idx + 1}`).trim();
    return {
      id: `slot-${slugify(label)}-${idx}`,
      label,
      description: typeof cat === 'object' && cat ? cat.description : label,
      color: (typeof cat === 'object' && cat && cat.color) || BUCKET_COLORS[idx % BUCKET_COLORS.length]
    };
  });

  const findSlot = (targetLabel: string) => {
    if (!targetLabel) return undefined;
    const lower = targetLabel.trim().toLowerCase();
    return (
      targetSlots.find((s) => s.label.toLowerCase() === lower || s.id.toLowerCase() === lower) ||
      targetSlots.find((s) => lower.includes(s.label.toLowerCase()) || s.label.toLowerCase().includes(lower))
    );
  };

  const rawItems: any[] = Array.isArray(parsed.items)
    ? parsed.items
    : (Array.isArray(parsed.tokens) ? parsed.tokens : []);

  const tokens: BucketToken[] = [];
  const seenTexts = new Set<string>();

  // 1. Map tokens directly 1:1 from items
  rawItems.forEach((item: any, idx: number) => {
    const text = typeof item === 'object' && item !== null
      ? String(item.prompt || item.text || `Elemento ${idx + 1}`).trim()
      : String(item).trim();

    if (!text) return;

    const targetLabel = typeof item === 'object' && item !== null
      ? String(item.expectedAnswer || item.target || '').trim()
      : '';

    const isExample = typeof item === 'object' && item !== null ? Boolean(item.isExample) : false;
    const matchedSlot = findSlot(targetLabel) || targetSlots[0];

    tokens.push({
      id: generateId('tok'),
      text,
      correctBucketId: matchedSlot ? matchedSlot.id : '',
      isExample,
      hint: item.explanation || (matchedSlot ? matchedSlot.label : undefined)
    });

    seenTexts.add(text.toLowerCase());
  });

  // 2. Reconcile terms from wordBank if terms were provided in the bank
  if (Array.isArray(parsed.wordBank) && parsed.wordBank.length > 0) {
    parsed.wordBank.forEach((wbItem: any) => {
      const rawWb = String(wbItem).trim();
      if (!rawWb) return;

      let termText = rawWb;
      let termTarget = '';

      const parenMatch = rawWb.match(/^(.+?)\s*(?:\((.+?)\)|[-—–:>]+\s*(.+))$/);
      if (parenMatch) {
        termText = parenMatch[1].trim();
        termTarget = (parenMatch[2] || parenMatch[3] || '').trim();
      }

      if (!seenTexts.has(termText.toLowerCase())) {
        const matchingItem = rawItems.find((it: any) => {
          const itText = typeof it === 'object' && it ? String(it.prompt || it.text || '') : String(it);
          return itText.trim().toLowerCase() === termText.toLowerCase();
        });

        const finalTarget = termTarget || (matchingItem ? String(matchingItem.expectedAnswer || matchingItem.target || '').trim() : '');
        const matchedSlot = findSlot(finalTarget) || targetSlots[0];
        const isExample = matchingItem ? Boolean(matchingItem.isExample) : false;

        tokens.push({
          id: generateId('tok'),
          text: termText,
          correctBucketId: matchedSlot ? matchedSlot.id : '',
          isExample,
          hint: matchedSlot ? matchedSlot.label : undefined
        });

        seenTexts.add(termText.toLowerCase());
      }
    });
  }

  const sourceItems: SourceItem[] = tokens.map((t) => ({
    id: t.id,
    text: t.text,
    correctTargetId: t.correctBucketId || undefined,
    isExample: t.isExample,
    hint: t.hint
  }));

  const correctPairs: Record<string, string> = {};
  tokens.forEach((t) => {
    if (t.correctBucketId) {
      correctPairs[t.id] = t.correctBucketId;
    }
  });

  return {
    type: 'buckets_matching',
    id: generateId('inter-buc'),
    instruction: parsed.instruction || parsed.title || 'Relaciona cada elemento con su destino correspondiente:',
    buckets: targetSlots,
    tokens,
    targetSlots,
    sourceItems,
    correctPairs: Object.keys(correctPairs).length > 0 ? correctPairs : undefined
  };
}

/**
 * Pure 1:1 Universal Mapper for Selection / Multiple Choice
 */
export function mapBlockToSelection(block: ExtractedBlock): SelectionBlock {
  const parsed = block.parsedData || {};

  // Case 1: Structured questions already present
  if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
    const questions = parsed.questions.map((q: any) => {
      const options: SelectionOption[] = (q.options || []).map((opt: any) => {
        const text = typeof opt === 'string' ? opt.trim() : String(opt.text || opt.label || '').trim();
        const isCorrect = typeof opt === 'object' && opt !== null ? Boolean(opt.isCorrect) : false;
        return {
          id: generateId('opt'),
          text,
          isCorrect,
          feedback: typeof opt === 'object' ? opt.feedback : undefined
        };
      });

      return {
        id: generateId('q'),
        prompt: String(q.prompt || q.question || '').trim(),
        mode: (q.mode || 'single_choice') as 'single_choice' | 'multiple_choice' | 'dropdown',
        options
      };
    });

    return {
      type: 'selection',
      id: generateId('inter-sel'),
      instruction: parsed.instruction || parsed.title || 'Elige la opción correcta para cada enunciado:',
      questions
    };
  }

  // Case 2: Structured items with candidate options
  const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : [];

  if (rawItems.length > 0) {
    const questions = rawItems.map((item: any, idx: number) => {
      const prompt = String(item.prompt || item.text || `Pregunta ${idx + 1}`).trim();
      const expected = String(item.expectedAnswer || '').trim().toLowerCase();

      const candidateOptions: string[] = Array.isArray(item.options) && item.options.length > 0
        ? item.options.map((o: any) => String(o).trim())
        : (Array.isArray(item.acceptedAnswers) && item.acceptedAnswers.length > 1
          ? item.acceptedAnswers.map((a: any) => String(a).trim())
          : [String(item.expectedAnswer || '').trim()]);

      const options: SelectionOption[] = candidateOptions.map((optText) => {
        const isCorrect = optText.trim().toLowerCase() === expected;
        return {
          id: generateId('opt'),
          text: optText,
          isCorrect,
          feedback: isCorrect ? (item.explanation || 'Opción correcta.') : undefined
        };
      });

      // Ensure at least one is resolved as correct
      if (!options.some((o) => o.isCorrect) && options.length > 0) {
        options[0].isCorrect = true;
      }

      return {
        id: generateId('q'),
        prompt,
        mode: 'single_choice' as const,
        options
      };
    });

    return {
      type: 'selection',
      id: generateId('inter-sel'),
      instruction: parsed.instruction || parsed.title || 'Elige la opción correcta para cada enunciado:',
      questions
    };
  }

  // Fallback: Empty selection block
  return {
    type: 'selection',
    id: generateId('inter-sel'),
    instruction: parsed.instruction || 'Selecciona las opciones correctas:',
    questions: []
  };
}

/**
 * Pure 1:1 Universal Mapper for Sequence
 */
export function mapBlockToSequence(block: ExtractedBlock): SequenceBlock {
  const parsed = block.parsedData || {};
  const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : [];

  const items = rawItems.map((it: any, i: number) => ({
    id: generateId('seq'),
    text: String(it.prompt || it.text || it.line || '').trim(),
    correctOrder: typeof it.order === 'number' ? it.order : i + 1,
    speaker: it.speaker
  }));

  return {
    type: 'sequence',
    id: generateId('inter-seq'),
    instruction: parsed.instruction || 'Ordena los elementos en la secuencia lógica correcta:',
    items
  };
}

/**
 * Pure 1:1 Universal Mapper for Reference Table
 */
export function mapBlockToReferenceTable(block: ExtractedBlock): ReferenceTableBlock {
  const parsed = block.parsedData || {};

  const headers: string[] = Array.isArray(parsed.headers) ? parsed.headers : [];
  const rows: string[][] = Array.isArray(parsed.rows) ? parsed.rows : [];

  return {
    type: 'table_reference',
    id: generateId('ref-tbl'),
    title: parsed.title || 'Cuadro Gramatical / Referencia',
    headers,
    rows,
    caption: parsed.caption || parsed.referenceContent || undefined
  };
}

/**
 * Pure 1:1 Universal Mapper for Reference Text
 */
export function mapBlockToReferenceText(block: ExtractedBlock): ReferenceTextBlock {
  const parsed = block.parsedData || {};

  let rawContent = parsed.referenceContent || parsed.content;
  if (Array.isArray(rawContent)) {
    rawContent = rawContent.map((s) => String(s).trim()).filter(Boolean).join('\n\n');
  } else if (!rawContent && Array.isArray(parsed.paragraphs) && parsed.paragraphs.length > 0) {
    rawContent = parsed.paragraphs.map((s: any) => String(s).trim()).filter(Boolean).join('\n\n');
  } else if (!rawContent && (!parsed.items || parsed.items.length === 0)) {
    // Only use rawText if this block has NO interactive items (i.e. it's truly a pure reading block)
    rawContent = block.rawText || '';
  }

  // If this is a reference/speaking card, consolidate complementary support phrases or vocabulary
  if (parsed.interactionType === 'reference' || block.detectedType === 'paragraph') {
    const existing = String(rawContent || '').trim();
    const supportPhrases = Array.isArray(parsed.items)
      ? parsed.items
          .map((it: any) => String(it.prompt || it.text || '').replace(/_{2,}/g, '').trim())
          .filter((p: string) => p && p.length > 3 && !existing.includes(p))
      : [];
    const supportWords = Array.isArray(parsed.wordBank)
      ? parsed.wordBank
          .map((w: any) => String(w).trim())
          .filter((w: string) => w && w.length > 1 && !existing.includes(w))
      : [];

    const sections: string[] = [];
    if (existing) {
      sections.push(existing);
    }
    if (supportPhrases.length > 0) {
      sections.push(`Useful phrases / Support sentences:\n${supportPhrases.map((p: string) => `• ${p}`).join('\n')}`);
    } else if (supportWords.length > 0) {
      sections.push(`Useful vocabulary:\n${supportWords.map((w: string) => `• ${w}`).join('\n')}`);
    }

    if (sections.length > 0) {
      rawContent = sections.join('\n\n');
    }
  }

  const slideTitle = String(parsed.title || '').trim();
  const content = stripLeadingDuplicateTitle(stripMetaComments(String(rawContent || '').trim()), slideTitle);

  // For speaking/reference activities or pure reference slides, avoid repeating the main slide title inside the card
  const isPureReference = parsed.interactionType === 'reference' || block.detectedType === 'paragraph';
  const title = isPureReference ? '' : (parsed.title || 'Lectura / Notas de Referencia');

  return {
    type: 'text',
    id: generateId('ref-txt'),
    title,
    content,
    category: 'reading'
  };
}

/**
 * Universal Dispatcher: Transforms any ExtractedBlock into the chosen role with pure 1:1 mappings.
 * When the block contains reading or guidance context alongside an exercise, it seamlessly preserves BOTH.
 */
export function mapBlockToRole(
  block: ExtractedBlock,
  role: PedagogicalRole
): { reference?: ReferenceBlock; interaction?: InteractionBlock } {
  const parsed = block.parsedData || {};
  const rawRefText = String(parsed.referenceContent || parsed.content || '').trim();
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const isDuplicate = parsed.interactionType === 'reference'
    ? false
    : isDuplicateReferenceContent(rawRefText, items);

  const hasReadingContent = Boolean(
    !isDuplicate && rawRefText.length > 0
  );

  const hasTableContent = Boolean(
    Array.isArray(parsed.headers) &&
    Array.isArray(parsed.rows) &&
    parsed.rows.length > 0
  );

  const defaultReference: ReferenceBlock | undefined = hasReadingContent
    ? mapBlockToReferenceText(block)
    : hasTableContent
    ? mapBlockToReferenceTable(block)
    : undefined;

  switch (role) {
    case 'reference_text':
      return { reference: mapBlockToReferenceText(block) };
    case 'reference_table':
      return { reference: mapBlockToReferenceTable(block) };
    case 'interaction_inputs':
      return { interaction: mapBlockToInputFields(block), reference: defaultReference };
    case 'interaction_selection':
      return { interaction: mapBlockToSelection(block), reference: defaultReference };
    case 'interaction_buckets':
      return { interaction: mapBlockToBuckets(block), reference: defaultReference };
    case 'interaction_sequence':
      return { interaction: mapBlockToSequence(block), reference: defaultReference };
  }
}

/**
 * Reverse mapping: Parses plain reference text into interactive items for input_fields
 * to guarantee that converting from reference_text never produces listItems: [].
 */
export function parseTextToInteractiveItems(text: string): InputFieldListItem[] {
  if (!text || !text.trim()) return [];

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const items: InputFieldListItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect bullet or number: "1. ", "1) ", "A. ", "- ", etc.
    const numberedMatch = line.match(/^(?:(?:\(?\d+[.)]?|[a-zA-Z][.)])\s+)(.*)$/);
    const content = numberedMatch ? numberedMatch[1].trim() : line;

    // Check if line contains a blank
    const hasBlank = /_{2,}|\[\s*\]|\(\s*\)/.test(content);

    // Check for definition or answer indicator: "Prompt - Answer" or "Prompt : Answer"
    const dashMatch = content.match(/^([^:\-–—]+)\s*[:\-–—]\s*(.+)$/);
    // Check for answer hint in parentheses at end: "She went (go)"
    const parenMatch = content.match(/(.*?)\s*\(([^)]+)\)\s*$/);

    let prompt = line;
    let expectedAnswer = '';

    if (hasBlank) {
      prompt = line;
      const wordInParen = line.match(/\(([^)]+)\)/);
      if (wordInParen) {
        expectedAnswer = wordInParen[1].trim();
      }
    } else if (parenMatch) {
      prompt = `${numberedMatch ? `${line.split(/\s+/)[0]} ` : ''}${parenMatch[1].trim()} _______`;
      expectedAnswer = parenMatch[2].trim();
    } else if (dashMatch && !numberedMatch) {
      prompt = `${dashMatch[1].trim()} _______`;
      expectedAnswer = dashMatch[2].trim();
    } else if (numberedMatch) {
      prompt = content.includes('___') ? line : `${line} _______`;
    } else {
      prompt = `${line} _______`;
    }

    const acceptedAnswers = expectedAnswer
      ? Array.from(new Set([expectedAnswer, ...generateGrammarVariants(expectedAnswer)]))
      : [];

    items.push({
      id: generateId('item'),
      prompt,
      expectedAnswer,
      acceptedAnswers,
      isExample: i === 0 && Boolean(expectedAnswer),
    });
  }

  return items;
}

/**
 * Serializes any active Slide's interaction and reference back into a typed ExtractedBlock.
 */
export function slideToExtractedBlock(slide: Slide): ExtractedBlock {
  const inter = slide.interaction || slide.cachedInteraction;
  const ref = slide.referenceContent;

  const title = slide.title || (ref && 'title' in ref ? ref.title : '') || 'Actividad Didáctica';
  const instruction = inter?.instruction || slide.subtitle || 'Instrucciones de la actividad';

  let items: any[] = [];
  let wordBank: string[] | undefined;
  let buckets: string[] | undefined;
  let headers: string[] | undefined;
  let rows: string[][] | undefined;
  let tableHeaders: string[] | undefined;
  let tableRows: any[][] | undefined;
  let referenceContent: string | undefined;

  if (ref && ref.type === 'text') {
    referenceContent = ref.content;
  } else if (ref && ref.type === 'table_reference') {
    headers = ref.headers;
    rows = ref.rows;
  }

  if (inter) {
    switch (inter.type) {
      case 'input_fields':
        wordBank = inter.wordBank;
        if (inter.layoutMode === 'table') {
          tableHeaders = inter.tableHeaders;
          tableRows = inter.tableRows.map((r) => r.map((c) => ({
            text: c.text,
            isInput: c.isInput,
            expectedAnswer: c.expectedAnswer,
            acceptedAnswers: c.acceptedAnswers,
            isExample: Boolean(c.isExample),
            hint: c.hint,
          })));
        }
        items = inter.listItems.map((i) => ({
          prompt: i.prompt,
          expectedAnswer: i.expectedAnswer || i.acceptedAnswers[0] || '',
          acceptedAnswers: i.acceptedAnswers,
          isExample: Boolean(i.isExample),
          explanation: i.explanation || i.hint
        }));
        break;

      case 'selection':
        if (Array.isArray(inter.questions) && inter.questions.length > 0) {
          items = inter.questions.map((q) => {
            const correctOpt = q.options.find((o) => o.isCorrect);
            return {
              prompt: q.prompt,
              expectedAnswer: correctOpt?.text || q.options[0]?.text || '',
              acceptedAnswers: correctOpt ? [correctOpt.text] : [],
              options: q.options.map((o) => o.text),
              isExample: false,
              explanation: correctOpt?.feedback
            };
          });
        } else if (Array.isArray(inter.options) && inter.options.length > 0) {
          items = inter.options.map((opt) => ({
            prompt: opt.text,
            expectedAnswer: opt.isCorrect ? opt.text : '',
            acceptedAnswers: opt.isCorrect ? [opt.text] : [],
            options: [opt.text],
            isExample: false,
            explanation: opt.feedback
          }));
        }
        break;

      case 'buckets_matching':
        buckets = (inter.targetSlots || inter.buckets || []).map((b) => b.label);
        items = (inter.sourceItems || inter.tokens || []).map((t) => {
          const targetId = (t as any).correctTargetId || (t as any).correctBucketId;
          const targetSlot = (inter.targetSlots || inter.buckets || []).find((s) => s.id === targetId);
          return {
            prompt: t.text,
            expectedAnswer: targetSlot?.label || '',
            acceptedAnswers: targetSlot ? [targetSlot.label] : [],
            isExample: Boolean((t as any).isExample),
            explanation: t.hint
          };
        });
        break;

      case 'sequence':
        items = inter.items.map((it) => ({
          prompt: it.speaker ? `${it.speaker}: ${it.text}` : it.text,
          expectedAnswer: String(it.correctOrder),
          acceptedAnswers: [String(it.correctOrder)],
          order: it.correctOrder,
          speaker: it.speaker,
          isExample: false
        }));
        break;
    }
  }

  const detectedType = inter?.type === 'buckets_matching'
    ? 'vocabulary'
    : inter?.type === 'input_fields' && inter.layoutMode === 'table'
    ? 'table'
    : 'numbered_list';

  return {
    id: `converted-block-${Date.now()}`,
    detectedType,
    confidence: 1.0,
    rawText: items.length > 0
      ? items.map((i) => i.prompt || '').join('\n\n')
      : (referenceContent || ''),
    parsedData: {
      title,
      instruction,
      referenceContent,
      wordBank,
      buckets,
      items,
      headers,
      rows,
      tableHeaders,
      tableRows,
      content: referenceContent
    }
  };
}

/**
 * Dynamically converts a Slide's archetype on-the-fly without losing extracted data.
 * Orthogonality Rule: Reference content and Interaction content are independent channels.
 * Converting the interaction never pollutes or erases referenceContent, and switching
 * to reference preserves active interaction in cachedInteraction.
 */
export function convertSlideToRole(slide: Slide, targetRole: PedagogicalRole): Slide {
  const isTargetReference = targetRole === 'reference_text' || targetRole === 'reference_table';
  const currentInteraction = slide.interaction || slide.cachedInteraction || null;

  // =========================================================================
  // CASE 1: TARGET IS REFERENCE (reference_text or reference_table)
  // =========================================================================
  if (isTargetReference) {
    // Preserve current interaction in cachedInteraction so it can be restored completely
    const nextCached = slide.interaction || slide.cachedInteraction || null;

    let nextReference = slide.referenceContent;

    // If slide does NOT have referenceContent yet, create a clean one
    if (!nextReference) {
      if (targetRole === 'reference_table') {
        if (currentInteraction && currentInteraction.type === 'input_fields' && currentInteraction.layoutMode === 'table') {
          nextReference = {
            type: 'table_reference',
            id: generateId('ref-tbl'),
            title: slide.title || 'Cuadro de Referencia',
            headers: currentInteraction.tableHeaders || ['Columna 1', 'Columna 2'],
            rows: currentInteraction.tableRows.map((r) => r.map((c) => c.text || c.expectedAnswer || ''))
          };
        } else {
          nextReference = {
            type: 'table_reference',
            id: generateId('ref-tbl'),
            title: slide.title || 'Cuadro de Referencia',
            headers: ['Columna 1', 'Columna 2'],
            rows: [['', '']]
          };
        }
      } else {
        // Clean reference text without polluting questions
        nextReference = {
          type: 'text',
          id: generateId('ref-txt'),
          title: slide.title || 'Lectura / Notas de Referencia',
          content: '',
          category: 'reading'
        };
      }
    }

    return {
      ...slide,
      referenceContent: nextReference,
      interaction: null,
      cachedInteraction: nextCached
    };
  }

  // =========================================================================
  // CASE 2: TARGET IS INTERACTIVE (inputs, selection, buckets, sequence)
  // =========================================================================
  
  // Rule: referenceContent is ORTHOGONAL to interaction.
  // We NEVER touch or overwrite slide.referenceContent!
  const nextReference = slide.referenceContent || null;

  let nextInteraction: InteractionBlock | null = null;

  // Subcase 2A: We already have an active or cached interaction
  if (currentInteraction) {
    const isSameType = (
      (targetRole === 'interaction_inputs' && currentInteraction.type === 'input_fields') ||
      (targetRole === 'interaction_selection' && currentInteraction.type === 'selection') ||
      (targetRole === 'interaction_buckets' && currentInteraction.type === 'buckets_matching') ||
      (targetRole === 'interaction_sequence' && currentInteraction.type === 'sequence')
    );

    if (isSameType) {
      nextInteraction = currentInteraction;
    } else {
      // Convert currentInteraction to targetRole without touching referenceContent
      const block = slideToExtractedBlock({
        ...slide,
        interaction: currentInteraction,
        referenceContent: null
      });
      const mapped = mapBlockToRole(block, targetRole);
      nextInteraction = mapped.interaction || null;
    }
  } else {
    // Subcase 2B: No interaction existed yet (slide was purely reference)
    // Run recovery parsing on slide.referenceContent so listItems is NEVER empty!
    if (slide.referenceContent && slide.referenceContent.type === 'text') {
      const items = parseTextToInteractiveItems(slide.referenceContent.content);
      const block: ExtractedBlock = {
        id: `recovered-${Date.now()}`,
        detectedType: 'numbered_list',
        confidence: 1.0,
        rawText: slide.referenceContent.content,
        parsedData: {
          title: slide.title || 'Actividad Didáctica',
          instruction: slide.subtitle || 'Completa la actividad:',
          items
        }
      };
      const mapped = mapBlockToRole(block, targetRole);
      nextInteraction = mapped.interaction || null;
    } else if (slide.referenceContent && slide.referenceContent.type === 'table_reference') {
      const block: ExtractedBlock = {
        id: `recovered-${Date.now()}`,
        detectedType: 'table',
        confidence: 1.0,
        rawText: '',
        parsedData: {
          title: slide.title || 'Actividad Didáctica',
          instruction: slide.subtitle || 'Completa la tabla:',
          headers: slide.referenceContent.headers,
          rows: slide.referenceContent.rows,
          tableHeaders: slide.referenceContent.headers,
          tableRows: slide.referenceContent.rows.map((row, rIdx) =>
            row.map((cell, cIdx) => ({
              text: cell,
              isInput: cIdx > 0,
              expectedAnswer: cIdx > 0 ? cell : undefined,
              acceptedAnswers: cIdx > 0 ? [cell] : [],
              isExample: rIdx === 0 && cIdx > 0,
              inputId: cIdx > 0 ? `cell-${rIdx}-${cIdx}` : undefined
            }))
          )
        }
      };
      const mapped = mapBlockToRole(block, targetRole);
      nextInteraction = mapped.interaction || null;
    }
  }

  return {
    ...slide,
    referenceContent: nextReference,
    interaction: nextInteraction,
    cachedInteraction: nextInteraction || slide.cachedInteraction || null
  };
}
