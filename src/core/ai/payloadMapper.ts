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
  BucketToken,
  TargetSlot,
  SourceItem,
  Slide
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
/**
 * Universal Zero-Hardcoding Mapper for Buckets & Universal Matching
 */
export function mapBlockToBuckets(block: ExtractedBlock): BucketsMatchingBlock {
  const parsed = block.parsedData || {};

  // 1. EXTRACT TARGET SLOTS / BUCKETS DYNAMICALLY (1:1 STRICT TRANSFORMER)
  let targetSlots: TargetSlot[] = [];

  // A. If already structured targetSlots:
  if (Array.isArray(parsed.targetSlots) && parsed.targetSlots.length > 0) {
    targetSlots = parsed.targetSlots
      .map((ts: any, idx: number) => {
        const label = typeof ts === 'string' ? ts.trim() : String(ts.label || ts.name || ts.title || '').trim();
        return {
          id: typeof ts === 'object' && ts.id ? String(ts.id) : `slot-${slugify(label)}-${idx}`,
          label,
          description: typeof ts === 'object' && ts.description ? String(ts.description) : undefined,
          color: typeof ts === 'object' && ts.color ? ts.color : BUCKET_COLORS[idx % BUCKET_COLORS.length]
        };
      })
      .filter((ts: TargetSlot) => ts.label.length > 0);
  }

  // B. Explicit buckets / categories:
  if (targetSlots.length === 0) {
    let rawCategories: string[] = [];
    if (Array.isArray(parsed.buckets) && parsed.buckets.length > 0) {
      rawCategories = parsed.buckets
        .map((b: any) => (typeof b === 'string' ? b.trim() : String(b.label || b.name || '').trim()))
        .filter(Boolean);
    } else if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
      rawCategories = parsed.categories.map((c: any) => String(c).trim()).filter(Boolean);
    } else if (Array.isArray(parsed.suggestedBuckets) && parsed.suggestedBuckets.length > 0) {
      rawCategories = parsed.suggestedBuckets.map((c: any) => String(c).trim()).filter(Boolean);
    }

    if (rawCategories.length > 0) {
      targetSlots = rawCategories.map((cat, idx) => ({
        id: `slot-${slugify(cat)}-${idx}`,
        label: cat,
        description: cat,
        color: BUCKET_COLORS[idx % BUCKET_COLORS.length]
      }));
    }
  }

  // C. If exercise associates elements with paragraphs of a linked reading text:
  // Dynamically map slots to match the paragraph identifiers (1, 2, 3, 4...)
  if (targetSlots.length === 0 && Array.isArray(parsed.paragraphs) && parsed.paragraphs.length > 0) {
    targetSlots = parsed.paragraphs.map((p: any, idx: number) => {
      const pId = typeof p === 'object' && p.id ? String(p.id) : String(idx + 1);
      const label = typeof p === 'string'
        ? `Párrafo ${idx + 1}`
        : (p.label || `Párrafo ${pId}`);
      return {
        id: `slot-p-${pId}`,
        label,
        description: typeof p === 'object' && p.text ? p.text.substring(0, 50) + '...' : undefined,
        color: BUCKET_COLORS[idx % BUCKET_COLORS.length]
      };
    });
  }

  // D. Extract categories mentioned in instruction or raw text if still empty:
  if (targetSlots.length === 0) {
    let extractedTextCats: string[] = [];
    if (parsed.instruction) {
      extractedTextCats = extractCategoriesFromText(parsed.instruction);
    }
    if (extractedTextCats.length === 0 && block.rawText) {
      extractedTextCats = extractCategoriesFromText(block.rawText);
    }
    if (extractedTextCats.length === 0 && block.rawText) {
      const lines = block.rawText.split('\n').map((l) => l.trim()).filter(Boolean);
      const catHeaderLine = lines.find((l) => /^(categories|prepositions|buckets|groups):\s*/i.test(l));
      if (catHeaderLine) {
        const rest = catHeaderLine.replace(/^(categories|prepositions|buckets|groups):\s*/i, '');
        extractedTextCats = rest.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
      }
    }
    if (extractedTextCats.length > 0) {
      targetSlots = extractedTextCats.map((cat, idx) => ({
        id: `slot-${slugify(cat)}-${idx}`,
        label: cat,
        description: cat,
        color: BUCKET_COLORS[idx % BUCKET_COLORS.length]
      }));
    }
  }

  // 2. EXTRACT SOURCE ITEMS / TOKENS DYNAMICALLY (ZERO HARDCODING)
  let rawItems: Array<{ text: string; target?: string }> = [];

  // Helper to extract lines from rawText as candidate tokens
  const extractTokensFromRawTextLines = (): Array<{ text: string; target?: string }> => {
    if (!block.rawText) return [];
    const rawCategoryLabels = targetSlots.map((ts) => ts.label.toLowerCase());
    const lines = block.rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((line) => {
        if (!line) return false;
        // Ignore lines that are the title
        if (parsed.title && line.toLowerCase().includes(parsed.title.toLowerCase())) return false;
        // Ignore lines that are exercise instruction statements
        if (/^(vocabulary:|exercise|\d+\s*[a-z]?\s*are these|write the letters|complete the|classify each|match the)/i.test(line)) return false;
        // Ignore lines that merely define category lists
        if (rawCategoryLabels.some((c) => c === line.toLowerCase())) return false;
        return true;
      });

    return lines
      .map((line) => {
        // Strip leading numbering or bullet (e.g. "1. ", "1 ", "• ", "- ")
        const clean = line.replace(/^(\d+[\s.)-]+|[a-z][\s.)-]+|[-*•]\s*)/i, '').trim();

        // Check for parenthesized category or paragraph target: "spend time with someone (F)" or "(1)"
        const matchParen = clean.match(/^(.*?)\s*\(([A-Za-z0-9\s]+)\)$/);
        if (matchParen) {
          return {
            text: matchParen[1].trim(),
            target: matchParen[2].trim()
          };
        }

        // Check for delimiter: "apply - FOR" or "Heading A - Paragraph 1"
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

  if (Array.isArray(parsed.sourceItems) && parsed.sourceItems.length > 0) {
    rawItems = parsed.sourceItems
      .map((it: any) => ({
        text: typeof it === 'string' ? it.trim() : String(it.text || it.name || '').trim(),
        target: typeof it === 'object' ? String(it.target || it.correctTargetId || it.answer || '').trim() : undefined
      }))
      .filter((t) => t.text.length > 0);
  } else if (Array.isArray(parsed.tokens) && parsed.tokens.length > 0) {
    rawItems = parsed.tokens
      .map((t: any) => ({
        text: typeof t === 'string' ? t.trim() : String(t.text || t.word || t.token || '').trim(),
        target: typeof t === 'object' ? String(t.target || t.category || t.bucket || t.answer || '').trim() : undefined
      }))
      .filter((t) => t.text.length > 0);
  } else if (Array.isArray(parsed.items) && parsed.items.length > 0) {
    rawItems = parsed.items
      .map((item: any) => ({
        text: typeof item === 'string' ? item.trim() : String(item.text || item.prompt || item.phrase || '').trim(),
        target: typeof item === 'object' ? String(item.target || item.category || item.bucket || item.answer || '').trim() : undefined
      }))
      .filter((t) => t.text.length > 0);
  }

  // Extract from rawText if tokens were empty
  const textLineTokens = extractTokensFromRawTextLines();
  if ((rawItems.length <= 1 && textLineTokens.length > 1) || rawItems.length === 0) {
    rawItems = textLineTokens;
  }

  // If targetSlots were empty but tokens specified targets, derive target slots strictly from targets
  if (targetSlots.length === 0 && rawItems.some((t) => t.target)) {
    const uniqueTargets = Array.from(new Set(rawItems.map((t) => t.target).filter(Boolean))) as string[];
    uniqueTargets.forEach((ut, idx) => {
      targetSlots.push({
        id: `slot-${slugify(ut)}-${idx}`,
        label: ut,
        description: ut,
        color: BUCKET_COLORS[idx % BUCKET_COLORS.length]
      });
    });
  }

  // STRICT PURGE: If still no targetSlots exist, DO NOT inject fake ['Categoría A', 'Categoría B']!
  // The transformer remains 1:1 strict.

  // 3. MAP ITEMS TO TARGET SLOTS WITHOUT FICTITIOUS ASSIGNMENTS
  const tokens: BucketToken[] = rawItems.map((t) => {
    let matchedSlot: TargetSlot | undefined;

    if (t.target && targetSlots.length > 0) {
      const targetLower = t.target.toLowerCase();
      // Match exact label, parenthesized code, paragraph number, or substring
      matchedSlot = targetSlots.find((slot) => {
        const sLabelLower = slot.label.toLowerCase();
        const parenCode = slot.label.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
        const numMatch = slot.label.match(/\d+/)?.[0];
        return (
          sLabelLower === targetLower ||
          parenCode === targetLower ||
          (numMatch && numMatch === targetLower) ||
          slot.id.toLowerCase() === targetLower ||
          sLabelLower.startsWith(targetLower) ||
          targetLower.startsWith(sLabelLower) ||
          sLabelLower.includes(targetLower) ||
          targetLower.includes(sLabelLower)
        );
      });
    }

    return {
      id: generateId('tok'),
      text: t.text,
      correctBucketId: matchedSlot ? matchedSlot.id : '',
      hint: matchedSlot ? matchedSlot.label : undefined
    };
  });

  const sourceItems: SourceItem[] = tokens.map((t) => ({
    id: t.id,
    text: t.text,
    correctTargetId: t.correctBucketId || undefined,
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
    instruction: parsed.instruction || 'Relaciona cada elemento con su destino correspondiente:',
    buckets: targetSlots,
    tokens,
    targetSlots,
    sourceItems,
    correctPairs: Object.keys(correctPairs).length > 0 ? correctPairs : undefined
  };
}

/**
 * Universal Zero-Hardcoding Mapper for Input Fields (Fill in Blanks)
 */
export function mapBlockToInputFields(block: ExtractedBlock): InputFieldsBlock {
  const parsed = block.parsedData || {};

  let listItems: Array<{
    id: string;
    prompt: string;
    expectedAnswer: string;
    acceptedAnswers: string[];
    prefix?: string;
    hint?: string;
    explanation?: string;
  }> = [];

  const extractItemCanonicalAndVariants = (rawItem: any, fallbackPrompt = '') => {
    let canonical = '';
    if (typeof rawItem === 'object' && rawItem !== null) {
      if (typeof rawItem.expectedAnswer === 'string' && rawItem.expectedAnswer.trim()) {
        canonical = rawItem.expectedAnswer.trim();
      } else if (typeof rawItem.answer === 'string' && rawItem.answer.trim()) {
        canonical = rawItem.answer.trim();
      } else if (typeof rawItem.correctAnswer === 'string' && rawItem.correctAnswer.trim()) {
        canonical = rawItem.correctAnswer.trim();
      } else if (Array.isArray(rawItem.acceptedAnswers) && rawItem.acceptedAnswers.length > 0) {
        const first = String(rawItem.acceptedAnswers[0]).trim();
        if (first) canonical = first;
      }
    }

    const promptText = typeof rawItem === 'object' && rawItem !== null
      ? String(rawItem.text || rawItem.prompt || fallbackPrompt).trim()
      : String(rawItem || fallbackPrompt).trim();

    // Derive answer from prompt markers like [XYZ] or => XYZ
    if (!canonical) {
      const bracketMatch = promptText.match(/\[(?:correct|answer|key)?\s*:?\s*([^\]]+)\]/i);
      if (bracketMatch) {
        canonical = bracketMatch[1].trim();
      } else {
        const arrowMatch = promptText.match(/(?:=>|->|=)\s*([a-zA-Z0-9\s'-]+)$/);
        if (arrowMatch) {
          canonical = arrowMatch[1].trim();
        }
      }
    }

    // Verb hint in parentheses: e.g. "She _______ (live) in London"
    if (!canonical) {
      const parenMatch = promptText.match(/\(([^)]+)\)/);
      if (parenMatch && parenMatch[1].trim().length < 30 && !parenMatch[1].toLowerCase().includes('párrafo')) {
        canonical = parenMatch[1].trim();
      }
    }

    // Fallback: Never leave canonical empty
    if (!canonical) {
      if (typeof rawItem === 'object' && rawItem?.hint && typeof rawItem.hint === 'string' && rawItem.hint.trim()) {
        canonical = rawItem.hint.trim();
      } else {
        canonical = 'Respuesta según texto';
      }
    }

    // Extract variants
    let variants: string[] = [];
    if (typeof rawItem === 'object' && rawItem !== null && Array.isArray(rawItem.acceptedAnswers) && rawItem.acceptedAnswers.length > 0) {
      variants = rawItem.acceptedAnswers.map((a: any) => String(a).trim()).filter(Boolean);
    } else if (typeof rawItem === 'object' && rawItem !== null && rawItem.answer) {
      variants = [String(rawItem.answer).trim()];
    }

    if (!variants.includes(canonical)) {
      variants.unshift(canonical);
    }

    if (variants.length === 0) {
      variants = [canonical];
    }

    const hint = typeof rawItem === 'object' && rawItem !== null
      ? (rawItem.hint || rawItem.explanation || undefined)
      : undefined;

    return {
      prompt: promptText,
      expectedAnswer: canonical,
      acceptedAnswers: variants,
      hint,
      prefix: typeof rawItem === 'object' && rawItem !== null ? rawItem.prefix : undefined
    };
  };

  if (Array.isArray(parsed.items) && parsed.items.length > 0) {
    listItems = parsed.items
      .map((item: any) => {
        const extracted = extractItemCanonicalAndVariants(item);
        return {
          id: generateId('item'),
          prompt: extracted.prompt,
          expectedAnswer: extracted.expectedAnswer,
          acceptedAnswers: extracted.acceptedAnswers,
          prefix: extracted.prefix,
          hint: extracted.hint
        };
      })
      .filter((item) => item.prompt.length > 0);
  } else if (block.rawText) {
    const lines = block.rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        if (parsed.title && l.toLowerCase().includes(parsed.title.toLowerCase())) return false;
        if (parsed.instruction && l.toLowerCase().includes(parsed.instruction.toLowerCase())) return false;
        return true;
      });

    listItems = lines.map((line) => {
      const extracted = extractItemCanonicalAndVariants(null, line);
      return {
        id: generateId('item'),
        prompt: line,
        expectedAnswer: extracted.expectedAnswer,
        acceptedAnswers: extracted.acceptedAnswers,
        hint: extracted.hint
      };
    });
  }

  return {
    type: 'input_fields',
    id: generateId('inter-inp'),
    instruction: parsed.instruction || 'Escribe la respuesta correcta en cada espacio:',
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
    const questions = parsed.questions
      .map((q: any) => ({
        id: generateId('q'),
        prompt: String(q.prompt || q.question || '').trim(),
        mode: q.mode || (q.options?.filter((o: any) => o.isCorrect)?.length > 1 ? 'multiple_choice' : 'single_choice'),
        options: (q.options || []).map((opt: any) => ({
          id: generateId('opt'),
          text: String(opt.text || opt.label || '').trim(),
          isCorrect: typeof opt.isCorrect === 'boolean' ? opt.isCorrect : undefined,
          feedback: opt.feedback
        }))
      }))
      .filter((q: any) => q.prompt.length > 0);

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

  let textContent = parsed.content || '';
  if (!textContent && Array.isArray(parsed.paragraphs) && parsed.paragraphs.length > 0) {
    textContent = parsed.paragraphs
      .map((p: any) => (typeof p === 'string' ? p : `${p.label ? `${p.label}\n` : ''}${p.text}`))
      .join('\n\n');
  }
  if (!textContent) {
    textContent = block.rawText || '';
  }

  const activeImages: string[] = Array.isArray(parsed.images) && parsed.images.length > 0
    ? parsed.images
    : (parsed.imageUrl ? [parsed.imageUrl] : []);

  return {
    type: 'text',
    id: generateId('ref-txt'),
    title: parsed.title || 'Lectura de Referencia',
    content: textContent,
    category: parsed.category || 'reading',
    ...(activeImages.length > 0 ? { imageUrl: activeImages[0], images: activeImages } : {})
  };
}

/**
 * Universal Dispatcher: Transforms any ExtractedBlock into the chosen role with ZERO hardcoding.
 * When the block contains reading or table context alongside an activity, it seamlessly preserves BOTH.
 */
export function mapBlockToRole(
  block: ExtractedBlock,
  role: PedagogicalRole
): { reference?: ReferenceBlock; interaction?: InteractionBlock } {
  const parsed = block.parsedData || {};
  const hasReadingContent = Boolean(
    parsed.content ||
    parsed.readingPassage ||
    (Array.isArray(parsed.paragraphs) && parsed.paragraphs.length > 0)
  );

  const hasTableContent = Boolean(
    Array.isArray(parsed.headers) &&
    Array.isArray(parsed.rows) &&
    parsed.rows.length > 0
  );

  const defaultReference = hasReadingContent
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
 * Synthesizes a unified ExtractedBlock from any existing Slide's active interaction or reference.
 * Preserves all prompts, text lines, instructions, and titles without data loss.
 */
export function slideToExtractedBlock(slide: Slide): ExtractedBlock {
  const inter = slide.interaction;
  const ref = slide.referenceContent;

  const title = slide.title || (ref && 'title' in ref ? ref.title : '') || 'Actividad Didáctica';
  const instruction = inter?.instruction || slide.subtitle || 'Instrucciones de la actividad';

  let items: string[] = [];
  let structuredItems: any[] = [];
  let buckets: string[] = [];
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  if (inter) {
    switch (inter.type) {
      case 'input_fields':
        if (inter.listItems && inter.listItems.length > 0) {
          items = inter.listItems.map((i) => i.prompt);
          structuredItems = inter.listItems.map((i) => ({
            text: i.prompt,
            expectedAnswer: i.expectedAnswer || i.acceptedAnswers[0] || 'Respuesta canónica',
            acceptedAnswers: i.acceptedAnswers && i.acceptedAnswers.length > 0 ? i.acceptedAnswers : [i.expectedAnswer || 'Respuesta canónica'],
            hint: i.hint,
            explanation: i.explanation
          }));
        } else if (inter.tableRows && inter.tableRows.length > 0) {
          tableHeaders = inter.tableHeaders || [];
          tableRows = inter.tableRows.map((r) => r.map((c) => c.text));
          items = tableRows.map((r) => r.join(' | '));
        } else if (inter.paragraphTemplate) {
          items = inter.paragraphTemplate.split('\n').filter(Boolean);
        }
        break;

      case 'selection':
        if (inter.options && inter.options.length > 0) {
          items = inter.options.map((o) => o.text);
        } else if (inter.questions && inter.questions.length > 0) {
          items = inter.questions.map((q) => q.prompt);
        }
        break;

      case 'buckets_matching':
        buckets = (inter.targetSlots || inter.buckets || []).map((b) => b.label);
        items = (inter.sourceItems || inter.tokens || []).map((t) => t.text);
        break;

      case 'sequence':
        items = inter.items.map((it) => (it.speaker ? `${it.speaker}: ${it.text}` : it.text));
        break;
    }
  } else if (ref) {
    if (ref.type === 'text') {
      items = ref.content.split('\n').map((l) => l.trim()).filter(Boolean);
    } else if (ref.type === 'table_reference') {
      tableHeaders = ref.headers || [];
      tableRows = ref.rows || [];
      items = ref.rows.map((r) => r.join(' | '));
    }
  }

  const rawText = [
    title,
    instruction,
    ...items
  ].filter(Boolean).join('\n');

  return {
    id: `converted-block-${Date.now()}`,
    detectedType: 'vocabulary',
    confidence: 1.0,
    rawText,
    parsedData: {
      title,
      instruction,
      items: structuredItems.length > 0 ? structuredItems : items,
      buckets: buckets.length > 0 ? buckets : undefined,
      targetSlots: (inter?.type === 'buckets_matching' && inter.targetSlots) ? inter.targetSlots : undefined,
      sourceItems: (inter?.type === 'buckets_matching' && inter.sourceItems) ? inter.sourceItems : undefined,
      headers: tableHeaders.length > 0 ? tableHeaders : undefined,
      rows: tableRows.length > 0 ? tableRows : undefined,
      content: ref && ref.type === 'text' ? ref.content : items.join('\n'),
      imageUrl: (ref && ref.type === 'text')
        ? (ref.imageUrl || (ref.images && ref.images.length > 0 ? ref.images[0] : undefined))
        : undefined,
      images: (ref && ref.type === 'text')
        ? (ref.images && ref.images.length > 0 ? ref.images : (ref.imageUrl ? [ref.imageUrl] : undefined))
        : undefined
    }
  };
}

/**
 * Dynamically converts a Slide's archetype on-the-fly without losing extracted data.
 */
export function convertSlideToRole(slide: Slide, targetRole: PedagogicalRole): Slide {
  const block = slideToExtractedBlock(slide);
  const mapped = mapBlockToRole(block, targetRole);

  const isTargetReference = targetRole === 'reference_text' || targetRole === 'reference_table';

  return {
    ...slide,
    referenceContent: isTargetReference
      ? mapped.reference || null
      : slide.referenceContent,
    interaction: isTargetReference
      ? null
      : mapped.interaction || null
  };
}

