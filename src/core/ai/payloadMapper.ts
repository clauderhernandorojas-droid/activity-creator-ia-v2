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
  Slide,
  InputFieldListItem
} from '../../types/schema';
import { generateGrammarVariants } from '../evaluators/fillBlankValidator';

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
 * Pure 1:1 Universal Mapper for Input Fields (Fill in Blanks / Matching Tables)
 */
export function mapBlockToInputFields(block: ExtractedBlock): InputFieldsBlock {
  const parsed = block.parsedData || {};

  // Pure 1:1 extraction of Word Bank
  const wordBank: string[] | undefined = Array.isArray(parsed.wordBank) && parsed.wordBank.length > 0
    ? parsed.wordBank.map((w: any) => String(w).trim()).filter(Boolean)
    : undefined;

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

  return {
    type: 'input_fields',
    id: generateId('inter-inp'),
    instruction: parsed.instruction || parsed.title || 'Escribe la respuesta correcta en cada espacio:',
    layoutMode: 'list',
    wordBank,
    listItems,
    tableHeaders: [],
    tableRows: [],
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

  const content = String(
    parsed.referenceContent ||
    parsed.content ||
    block.rawText ||
    ''
  ).trim();

  return {
    type: 'text',
    id: generateId('ref-txt'),
    title: parsed.title || 'Lectura / Notas de Referencia',
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
  const hasReadingContent = Boolean(
    (parsed.referenceContent && String(parsed.referenceContent).trim().length > 0) ||
    (parsed.content && String(parsed.content).trim().length > 0)
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
 * Serializes any active Slide's interaction and reference back into a typed ExtractedBlock.
 */
export function slideToExtractedBlock(slide: Slide): ExtractedBlock {
  const inter = slide.interaction;
  const ref = slide.referenceContent;

  const title = slide.title || (ref && 'title' in ref ? ref.title : '') || 'Actividad Didáctica';
  const instruction = inter?.instruction || slide.subtitle || 'Instrucciones de la actividad';

  let items: any[] = [];
  let wordBank: string[] | undefined;
  let buckets: string[] | undefined;
  let headers: string[] | undefined;
  let rows: string[][] | undefined;
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
        items = inter.listItems.map((i) => ({
          prompt: i.prompt,
          expectedAnswer: i.expectedAnswer || i.acceptedAnswers[0] || '',
          acceptedAnswers: i.acceptedAnswers,
          isExample: Boolean(i.isExample),
          explanation: i.explanation || i.hint
        }));
        break;

      case 'selection':
        items = (inter.questions || []).map((q) => {
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

  const rawTextParts = [
    title,
    instruction,
    referenceContent,
    ...items.map((i) => i.prompt || i.text || '')
  ].filter(Boolean);

  return {
    id: `converted-block-${Date.now()}`,
    detectedType: inter?.type === 'buckets_matching' ? 'vocabulary' : 'numbered_list',
    confidence: 1.0,
    rawText: rawTextParts.join('\n\n'),
    parsedData: {
      title,
      instruction,
      referenceContent,
      wordBank,
      buckets,
      items,
      headers,
      rows,
      content: referenceContent
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
      : (slide.referenceContent || mapped.reference || null),
    interaction: isTargetReference
      ? null
      : (mapped.interaction || null)
  };
}
