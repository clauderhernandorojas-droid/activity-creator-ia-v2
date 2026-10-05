import type {
  ExtractedBlock,
  ReferenceBlock,
  ReferenceTextBlock,
  ReferenceTableBlock,
  InteractionBlock,
  InputFieldsBlock,
  SelectionBlock,
  SelectionOption,
  BucketsMatchingBlock,
  SequenceBlock,
  BucketTarget,
  BucketToken
} from '../../types/schema';

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
 * Extracts categories from instruction or text when not explicitly parsed.
 * Handles patterns like "about family (F), work (W), free time (FT), or study (S)"
 * or "FOR, IN, TO, WITH".
 */
export function extractCategoriesFromText(text: string): string[] {
  if (!text) return [];

  // 1. Look for phrases with code parentheses: "family (F), work (W), free time (FT)..."
  const parenMatches = Array.from(text.matchAll(/([A-Za-z\s]+)\(([A-Za-z0-9]+)\)/g));
  if (parenMatches.length >= 2) {
    const categories = parenMatches
      .map((m) => `${m[1].trim()} (${m[2].trim()})`)
      .filter((c) => c.length > 2 && c.length < 35);
    if (categories.length >= 2) return categories;
  }

  // 2. Look for phrases introduced by "about", "into", "under", "categories:", etc.
  const introMatch = text.match(/(?:about|under|into|with|for|categories:?)\s+([^.?!]+)/i);
  if (introMatch) {
    const listPart = introMatch[1];
    const parts = listPart
      .split(/,|\bor\b|\band\b/i)
      .map((s) => s.trim().replace(/[.?!]$/, ''))
      .filter((s) => s.length > 1 && s.length < 35);
    if (parts.length >= 2 && parts.length <= 8) {
      return parts;
    }
  }

  // 3. Look for uppercase comma-separated tokens like "FOR, IN, TO, WITH"
  const upperMatch = text.match(/\b([A-Z]{2,10}(?:,\s*[A-Z]{2,10})*(?:\s*(?:or|and)\s*[A-Z]{2,10}))\b/);
  if (upperMatch) {
    const parts = upperMatch[1]
      .split(/,|\bor\b|\band\b/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) return parts;
  }

  return [];
}

/**
 * Universal Zero-Hardcoding Mapper for Buckets Matching
 */
export function mapBlockToBuckets(block: ExtractedBlock): BucketsMatchingBlock {
  const parsed = block.parsedData || {};

  // 1. EXTRACT BUCKET CATEGORIES DYNAMICALLY
  let rawCategories: string[] = [];
  if (Array.isArray(parsed.buckets) && parsed.buckets.length > 0) {
    rawCategories = parsed.buckets
      .map((b: any) => (typeof b === 'string' ? b.trim() : String(b.label || b.name || '').trim()))
      .filter(Boolean);
  } else if (Array.isArray(parsed.suggestedBuckets) && parsed.suggestedBuckets.length > 0) {
    rawCategories = parsed.suggestedBuckets.map((c: any) => String(c).trim()).filter(Boolean);
  } else if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
    rawCategories = parsed.categories.map((c: any) => String(c).trim()).filter(Boolean);
  }

  // If no categories in parsedData, extract from instruction or rawText
  if (rawCategories.length === 0) {
    if (parsed.instruction) {
      rawCategories = extractCategoriesFromText(parsed.instruction);
    }
    if (rawCategories.length === 0 && block.rawText) {
      rawCategories = extractCategoriesFromText(block.rawText);
    }
    if (rawCategories.length === 0 && block.rawText) {
      const lines = block.rawText.split('\n').map((l) => l.trim()).filter(Boolean);
      const catHeaderLine = lines.find((l) => /^(categories|prepositions|buckets|groups):\s*/i.test(l));
      if (catHeaderLine) {
        const rest = catHeaderLine.replace(/^(categories|prepositions|buckets|groups):\s*/i, '');
        rawCategories = rest.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
      }
    }
  }

  const buckets: BucketTarget[] = rawCategories.map((cat, idx) => ({
    id: `b-${slugify(cat)}-${idx}`,
    label: cat,
    description: `Category: ${cat}`,
    color: BUCKET_COLORS[idx % BUCKET_COLORS.length]
  }));

  // 2. EXTRACT TOKENS DYNAMICALLY (ZERO HARDCODING)
  let rawTokens: Array<{ text: string; target?: string }> = [];

  // Helper to extract lines from rawText as candidate tokens
  const extractTokensFromRawTextLines = (): Array<{ text: string; target?: string }> => {
    if (!block.rawText) return [];
    const lines = block.rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((line) => {
        if (!line) return false;
        // Ignore lines that are the title
        if (parsed.title && line.toLowerCase().includes(parsed.title.toLowerCase())) return false;
        // Ignore lines that are exercise instruction statements
        if (/^(vocabulary:|exercise|\d+\s*[a-z]?\s*are these|write the letters|complete the|classify each)/i.test(line)) return false;
        // Ignore lines that merely define category lists
        if (rawCategories.some((c) => c.toLowerCase() === line.toLowerCase())) return false;
        return true;
      });

    return lines
      .map((line) => {
        // Strip leading numbering or bullet (e.g. "1. ", "1 ", "• ", "- ")
        let clean = line.replace(/^(\d+[\s.)-]+|[a-z][\s.)-]+|[-*•]\s*)/i, '').trim();

        // Check for parenthesized category: "spend time with someone (F)" or "(FT)"
        const matchParen = clean.match(/^(.*?)\s*\(([A-Za-z0-9\s]+)\)$/);
        if (matchParen) {
          return {
            text: matchParen[1].trim(),
            target: matchParen[2].trim()
          };
        }

        // Check for delimiter: "apply - FOR" or "apply: FOR"
        const matchDelimiter = clean.match(/^(.*?)\s*[:\-–—]\s*([A-Za-z0-9\s]+)$/);
        if (matchDelimiter) {
          return {
            text: matchDelimiter[1].trim(),
            target: matchDelimiter[2].trim()
          };
        }

        return { text: clean };
      })
      .filter((t) => t.text.length > 0);
  };

  if (Array.isArray(parsed.tokens) && parsed.tokens.length > 0) {
    rawTokens = parsed.tokens
      .map((t: any) => ({
        text: typeof t === 'string' ? t.trim() : String(t.text || t.word || t.token || '').trim(),
        target: typeof t === 'object' ? String(t.target || t.category || t.bucket || '').trim() : undefined
      }))
      .filter((t) => t.text.length > 0);
  } else if (Array.isArray(parsed.items) && parsed.items.length > 0) {
    rawTokens = parsed.items
      .map((item: any) => ({
        text: typeof item === 'string' ? item.trim() : String(item.text || item.prompt || item.phrase || '').trim(),
        target: typeof item === 'object' ? String(item.target || item.category || item.bucket || item.answer || '').trim() : undefined
      }))
      .filter((t) => t.text.length > 0);
  }

  // ROBUSTNESS RULE: Never create a slide with only 1 token if rawText has multiple lines!
  const textLineTokens = extractTokensFromRawTextLines();
  if ((rawTokens.length <= 1 && textLineTokens.length > 1) || rawTokens.length === 0) {
    rawTokens = textLineTokens;
  }

  // If buckets were empty but tokens had targets, derive buckets from targets!
  if (buckets.length === 0 && rawTokens.some((t) => t.target)) {
    const uniqueTargets = Array.from(new Set(rawTokens.map((t) => t.target).filter(Boolean))) as string[];
    uniqueTargets.forEach((ut, idx) => {
      buckets.push({
        id: `b-${slugify(ut)}-${idx}`,
        label: ut,
        description: `Category: ${ut}`,
        color: BUCKET_COLORS[idx % BUCKET_COLORS.length]
      });
    });
  }

  // 3. MAP TO BUCKET TOKENS WITH AUTOMATIC TARGET MATCHING
  const tokens: BucketToken[] = rawTokens.map((t, idx) => {
    let matchedBucket: BucketTarget | undefined;

    if (t.target && buckets.length > 0) {
      const targetLower = t.target.toLowerCase();
      // Match exact label, parenthesized code (e.g. 'F' in 'Family (F)'), prefix, or substring
      matchedBucket = buckets.find((b) => {
        const bLabelLower = b.label.toLowerCase();
        const parenCode = b.label.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
        return (
          bLabelLower === targetLower ||
          parenCode === targetLower ||
          bLabelLower.startsWith(targetLower) ||
          targetLower.startsWith(bLabelLower) ||
          bLabelLower.includes(targetLower) ||
          targetLower.includes(bLabelLower)
        );
      });
    }

    // If no explicit match found and buckets exist, distribute evenly across buckets
    if (!matchedBucket && buckets.length > 0) {
      matchedBucket = buckets[idx % buckets.length];
    }

    return {
      id: generateId('tok'),
      text: t.text,
      correctBucketId: matchedBucket ? matchedBucket.id : '',
      hint: matchedBucket ? `Category: ${matchedBucket.label}` : undefined
    };
  });

  return {
    type: 'buckets_matching',
    id: generateId('inter-buc'),
    instruction: parsed.instruction || 'Classify each word into its respective bucket category:',
    buckets,
    tokens
  };
}

/**
 * Universal Zero-Hardcoding Mapper for Input Fields (Fill in Blanks)
 */
export function mapBlockToInputFields(block: ExtractedBlock): InputFieldsBlock {
  const parsed = block.parsedData || {};

  let listItems: Array<{ id: string; prompt: string; acceptedAnswers: string[]; prefix?: string; hint?: string }> = [];

  if (Array.isArray(parsed.items) && parsed.items.length > 0) {
    listItems = parsed.items.map((item: any, idx: number) => ({
      id: generateId('item'),
      prompt: String(item.text || item.prompt || `Exercise ${idx + 1}`).trim(),
      acceptedAnswers: item.acceptedAnswers || (item.answer ? [String(item.answer).trim()] : []),
      prefix: item.prefix || `Q${idx + 1}: `,
      hint: item.hint
    }));
  } else if (block.rawText) {
    const lines = block.rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    listItems = lines.map((line, idx) => {
      // Look for blank markers or parenthesized hints
      return {
        id: generateId('item'),
        prompt: line,
        acceptedAnswers: [],
        prefix: `Q${idx + 1}: `
      };
    });
  }

  return {
    type: 'input_fields',
    id: generateId('inter-inp'),
    instruction: parsed.instruction || 'Type the correct answer in the blanks provided:',
    layoutMode: 'list',
    listItems,
    tableHeaders: [],
    tableRows: [],
    paragraphTemplate: '',
    paragraphInputs: {}
  };
}

/**
 * Universal Zero-Hardcoding Mapper for Selection (Quiz Mode or Flat Selection List)
 */
export function mapBlockToSelection(block: ExtractedBlock): SelectionBlock {
  const parsed = block.parsedData || {};

  // Case 1: Payload explicitly contains closed question/options pairs
  const hasExplicitQuestions =
    Array.isArray(parsed.questions) &&
    parsed.questions.length > 0 &&
    parsed.questions.some((q: any) => Array.isArray(q.options) && q.options.length > 0);

  if (hasExplicitQuestions) {
    const questions = parsed.questions.map((q: any, qi: number) => ({
      id: generateId('q'),
      prompt: String(q.prompt || q.question || `Pregunta ${qi + 1}`).trim(),
      mode: q.mode || (q.options?.filter((o: any) => o.isCorrect)?.length > 1 ? 'multiple_choice' : 'single_choice'),
      options: (q.options || []).map((opt: any) => ({
        id: generateId('opt'),
        text: String(opt.text || opt.label || '').trim(),
        isCorrect: typeof opt.isCorrect === 'boolean' ? opt.isCorrect : undefined,
        feedback: opt.feedback
      }))
    }));

    return {
      type: 'selection',
      id: generateId('inter-sel'),
      instruction: parsed.instruction || 'Elige la opción correcta para cada enunciado:',
      questions
    };
  }

  // Case 2: Flat list of items, phrases, tokens, or text lines (ZERO MOCKS, ZERO HARDCODING)
  let flatItems: string[] = [];

  if (Array.isArray(parsed.options) && parsed.options.length > 0) {
    flatItems = parsed.options
      .map((opt: any) => (typeof opt === 'string' ? opt.trim() : String(opt.text || opt.label || '').trim()))
      .filter(Boolean);
  } else if (Array.isArray(parsed.items) && parsed.items.length > 0) {
    flatItems = parsed.items
      .map((it: any) => (typeof it === 'string' ? it.trim() : String(it.text || it.prompt || it.phrase || it.word || '').trim()))
      .filter(Boolean);
  } else if (Array.isArray(parsed.tokens) && parsed.tokens.length > 0) {
    flatItems = parsed.tokens
      .map((t: any) => (typeof t === 'string' ? t.trim() : String(t.text || t.word || '').trim()))
      .filter(Boolean);
  } else if (block.rawText) {
    const lines = block.rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((line) => {
        if (!line) return false;
        if (parsed.title && line.toLowerCase().includes(parsed.title.toLowerCase())) return false;
        if (/^(vocabulary:|exercise|\d+\s*[a-z]?\s*choose|select all|read and mark)/i.test(line)) return false;
        return true;
      });

    flatItems = lines
      .map((l) => l.replace(/^(\d+[\s.)-]+|[a-z][\s.)-]+|[-*•]\s*)/i, '').trim())
      .filter(Boolean);
  }

  const options: SelectionOption[] = flatItems.map((text) => ({
    id: generateId('opt'),
    text
    // Note: isCorrect is left undefined because no artificial correct answers are forced!
  }));

  return {
    type: 'selection',
    id: generateId('inter-sel'),
    instruction: parsed.instruction || parsed.title || 'Selecciona los elementos correspondientes:',
    allowMultiple: true,
    options,
    questions: []
  };
}

/**
 * Universal Zero-Hardcoding Mapper for Sequence Dialogue Reordering
 */
export function mapBlockToSequence(block: ExtractedBlock): SequenceBlock {
  const parsed = block.parsedData || {};

  let items: any[] = [];

  if (Array.isArray(parsed.items) && parsed.items.length > 0) {
    items = parsed.items.map((it: any, i: number) => ({
      id: generateId('seq'),
      text: String(it.text || it.line || '').trim(),
      correctOrder: typeof it.order === 'number' ? it.order : i + 1,
      speaker: it.speaker
    }));
  } else if (block.rawText) {
    const lines = block.rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    items = lines.map((line, i) => {
      const matchSpeaker = line.match(/^([A-Za-z\s]+):\s*(.*)$/);
      return {
        id: generateId('seq'),
        text: matchSpeaker ? matchSpeaker[2].trim() : line.replace(/^[\w\d][).]\s*/, '').trim(),
        correctOrder: i + 1,
        speaker: matchSpeaker ? matchSpeaker[1].trim() : undefined
      };
    });
  }

  return {
    type: 'sequence',
    id: generateId('inter-seq'),
    instruction: parsed.instruction || 'Drag and reorder the lines to assemble a natural conversation flow:',
    items
  };
}

/**
 * Universal Zero-Hardcoding Mapper for Reference Table
 */
export function mapBlockToReferenceTable(block: ExtractedBlock): ReferenceTableBlock {
  const parsed = block.parsedData || {};

  let headers: string[] = Array.isArray(parsed.headers) ? parsed.headers : [];
  let rows: string[][] = Array.isArray(parsed.rows) ? parsed.rows : [];

  // If table wasn't pre-parsed into headers/rows but rawText has pipe separators:
  if (headers.length === 0 && rows.length === 0 && block.rawText && block.rawText.includes('|')) {
    const lines = block.rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    const tableLines = lines.filter((l) => l.includes('|'));
    if (tableLines.length > 0) {
      headers = tableLines[0].split('|').map((c) => c.trim()).filter(Boolean);
      rows = tableLines.slice(1)
        .filter((l) => !/^[|\s:-]+$/.test(l)) // skip markdown divider row
        .map((l) => l.split('|').map((c) => c.trim()).filter((_, idx, arr) => !(idx === 0 && arr[idx] === '') && !(idx === arr.length - 1 && arr[idx] === '')));
    }
  }

  return {
    type: 'table_reference',
    id: generateId('ref-tbl'),
    title: parsed.title || 'Cuadro Gramatical',
    headers,
    rows,
    caption: parsed.caption || 'Source: Digitized Coursebook'
  };
}

/**
 * Universal Zero-Hardcoding Mapper for Reference Text
 */
export function mapBlockToReferenceText(block: ExtractedBlock): ReferenceTextBlock {
  const parsed = block.parsedData || {};

  return {
    type: 'text',
    id: generateId('ref-txt'),
    title: parsed.title || 'Lectura de Referencia',
    content: parsed.content || block.rawText || '',
    category: parsed.category || 'reading'
  };
}

/**
 * Universal Dispatcher: Transforms any ExtractedBlock into the chosen role with ZERO hardcoding.
 */
export function mapBlockToRole(
  block: ExtractedBlock,
  role: PedagogicalRole
): { reference?: ReferenceBlock; interaction?: InteractionBlock } {
  switch (role) {
    case 'reference_text':
      return { reference: mapBlockToReferenceText(block) };
    case 'reference_table':
      return { reference: mapBlockToReferenceTable(block) };
    case 'interaction_inputs':
      return { interaction: mapBlockToInputFields(block) };
    case 'interaction_selection':
      return { interaction: mapBlockToSelection(block) };
    case 'interaction_buckets':
      return { interaction: mapBlockToBuckets(block) };
    case 'interaction_sequence':
      return { interaction: mapBlockToSequence(block) };
  }
}
