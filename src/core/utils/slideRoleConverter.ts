import type {
  Slide,
  InteractionBlock,
  InputFieldsBlock,
  SelectionBlock,
  BucketsMatchingBlock,
  SequenceBlock,
  WritingBlock,
  StructuredReferenceBlock,
  ReferenceTextBlock,
  ReferenceTableBlock,
  ReferenceBlock
} from '../../types/schema';

export type PedagogicalRole = 
  | 'interaction_inputs' 
  | 'interaction_selection' 
  | 'interaction_buckets' 
  | 'interaction_sequence' 
  | 'interaction_writing' 
  | 'reference_text' 
  | 'reference_table';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Resolves the active pedagogical role currently represented on a slide.
 */
export function getCurrentRole(slide: Slide): PedagogicalRole {
  if (slide.interaction) {
    switch (slide.interaction.type) {
      case 'input_fields':
        return 'interaction_inputs';
      case 'selection':
        return 'interaction_selection';
      case 'buckets_matching':
        return 'interaction_buckets';
      case 'sequence':
        return 'interaction_sequence';
      case 'writing':
        return 'interaction_writing';
      case 'cloze_multichoice':
        return 'interaction_selection';
    }
  }
  if (slide.referenceContent) {
    if (slide.referenceContent.type === 'reference_table' || slide.referenceContent.type === 'table_reference') {
      return 'reference_table';
    }
    return 'reference_text';
  }
  return 'interaction_inputs';
}

/**
 * Converts a table reference block to formatted Markdown text, preserving all columns, rows, rules, and tips.
 */
function tableToMarkdownText(ref: StructuredReferenceBlock | ReferenceTableBlock, slideTitle?: string): string {
  const parts: string[] = [];

  const title = ref.title && ref.title !== slideTitle ? ref.title.trim() : '';
  if (title) parts.push(`### ${title}`);

  if ('instruction' in ref && ref.instruction && ref.instruction.trim()) {
    parts.push(ref.instruction.trim());
  }

  if (ref.body && ref.body.trim()) {
    parts.push(ref.body.trim());
  }

  if ('columns' in ref && Array.isArray(ref.columns) && ref.columns.length > 0) {
    (ref.columns as Array<{ header: string; items?: string[] }>).forEach((col) => {
      const colParts: string[] = [`**${col.header}**:`];
      (col.items || []).forEach((item: string) => {
        if (item && item.trim()) colParts.push(`• ${item.trim()}`);
      });
      parts.push(colParts.join('\n'));
    });
  } else if ('headers' in ref && Array.isArray(ref.headers) && ref.headers.length > 0) {
    const tableRef = ref as ReferenceTableBlock;
    const headers = tableRef.headers;
    const headerLine = `| ${headers.join(' | ')} |`;
    const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const rowLines = (tableRef.rows || []).map((row: string[]) => `| ${row.join(' | ')} |`);
    parts.push([headerLine, separatorLine, ...rowLines].join('\n'));
  }

  if (ref.caption && ref.caption.trim()) {
    parts.push(`> 💡 Tip: ${ref.caption.trim()}`);
  }

  return parts.join('\n\n');
}

/**
 * Converts a text reference block to a structured reference table block, preserving all body text and parsing structured items.
 */
function textToReferenceTable(ref: ReferenceTextBlock, slideTitle?: string): StructuredReferenceBlock {
  const text = (ref.content || ref.body || '').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const columns: { header: string; items: string[] }[] = [];
  let currentHeader = 'Puntos Clave';
  let currentItems: string[] = [];

  for (const line of lines) {
    if (line.startsWith('### ') || line.startsWith('## ') || line.endsWith(':')) {
      if (currentItems.length > 0) {
        columns.push({ header: currentHeader, items: currentItems });
        currentItems = [];
      }
      currentHeader = line.replace(/^[#\s]+/, '').replace(/:$/, '').trim() || 'Categoría';
    } else {
      const cleanItem = line.replace(/^[•\-\*\d\.\)]+\s*/, '').trim();
      if (cleanItem) {
        currentItems.push(cleanItem);
      }
    }
  }

  if (currentItems.length > 0 || columns.length === 0) {
    columns.push({
      header: currentHeader,
      items: currentItems.length > 0 ? currentItems : ['Información de referencia']
    });
  }

  return {
    type: 'reference_table',
    id: generateId('ref-tbl'),
    title: ref.title || slideTitle || 'Cuadro de Referencia',
    instruction: 'Consulta la información estructurada:',
    columns,
    body: text,
  };
}

/**
 * Converts an existing Slide to a target pedagogical role cleanly on Canvas.
 * Uses rolePayloadCache to preserve original payloads across view toggles without data loss or re-extraction.
 */
export function convertSlideToRole(slide: Slide, targetRole: PedagogicalRole): Slide {
  const currentRole = getCurrentRole(slide);
  if (currentRole === targetRole) {
    return slide;
  }

  const isTargetReference = targetRole === 'reference_text' || targetRole === 'reference_table';
  const roleCache: Record<string, any> = { ...(slide.rolePayloadCache || {}) };

  // 1. Save current payload into cache to preserve user edits and extracted data
  if (currentRole === 'reference_text' || currentRole === 'reference_table') {
    if (slide.referenceContent) {
      roleCache[currentRole] = slide.referenceContent;
    }
  } else {
    if (slide.interaction) {
      roleCache[currentRole] = slide.interaction;
    }
  }

  // CASE 1: TARGET IS REFERENCE ('reference_text' o 'reference_table')
  if (isTargetReference) {
    const nextCached = slide.interaction || slide.cachedInteraction || null;
    let nextReference: ReferenceBlock | null = null;

    if (roleCache[targetRole]) {
      // Restore cached version of this reference archetype
      nextReference = roleCache[targetRole];
    } else if (targetRole === 'reference_text') {
      if (slide.referenceContent && (slide.referenceContent.type === 'reference_table' || slide.referenceContent.type === 'table_reference')) {
        const markdown = tableToMarkdownText(slide.referenceContent as any, slide.title);
        const refText: ReferenceTextBlock = {
          type: 'text',
          id: generateId('ref-txt'),
          title: slide.referenceContent.title || slide.title || 'Lectura / Notas de Referencia',
          content: markdown,
          body: slide.referenceContent.body || markdown,
          category: 'grammar_note',
        };
        nextReference = refText;
      } else {
        nextReference = {
          type: 'text',
          id: generateId('ref-txt'),
          title: slide.title || 'Lectura / Notas de Referencia',
          content: '',
          category: 'reading',
        };
      }
    } else if (targetRole === 'reference_table') {
      if (slide.referenceContent && slide.referenceContent.type === 'text') {
        nextReference = textToReferenceTable(slide.referenceContent, slide.title);
      } else {
        const refTable: StructuredReferenceBlock = {
          type: 'reference_table',
          id: generateId('ref-tbl'),
          title: slide.title || 'Cuadro de Referencia',
          instruction: 'Consulta las columnas:',
          columns: [
            { header: 'Columna 1', items: ['Elemento 1', 'Elemento 2'] },
            { header: 'Columna 2', items: ['Elemento A', 'Elemento B'] },
          ],
        };
        nextReference = refTable;
      }
    }

    if (nextReference) {
      roleCache[targetRole] = nextReference;
    }

    return {
      ...slide,
      referenceContent: nextReference,
      interaction: null,
      cachedInteraction: nextCached,
      rolePayloadCache: roleCache,
      layout: 'single_column',
    };
  }

  // CASE 2: TARGET IS INTERACTIVE
  const nextReference = slide.referenceContent || null;
  let nextInteraction: InteractionBlock | null = null;

  if (roleCache[targetRole]) {
    // Restore cached version of this interaction archetype
    nextInteraction = roleCache[targetRole];
  } else {
    const currentInteraction = slide.interaction || slide.cachedInteraction || null;
    nextInteraction = transformOrCreateInteraction(targetRole, currentInteraction, slide.subtitle || slide.title);
  }

  if (nextInteraction) {
    roleCache[targetRole] = nextInteraction;
  }

  const isBucket = nextInteraction?.type === 'buckets_matching';
  const effectiveReference = isBucket ? null : nextReference;
  const effectiveLayout = isBucket ? 'single_column' : (effectiveReference && nextInteraction ? 'split_50_50' : 'single_column');

  return {
    ...slide,
    referenceContent: effectiveReference,
    interaction: nextInteraction,
    cachedInteraction: nextInteraction || slide.cachedInteraction || null,
    rolePayloadCache: roleCache,
    layout: effectiveLayout,
  };
}

/**
 * Transforms an existing interaction into the target archetype preserving items, or creates a clean initial block.
 */
function transformOrCreateInteraction(
  targetRole: PedagogicalRole,
  source: InteractionBlock | null,
  instructionText: string
): InteractionBlock {
  const instruction = source?.instruction || instructionText || 'Completa la actividad:';

  if (!source) {
    return createInitialInteraction(targetRole, instruction);
  }

  switch (targetRole) {
    case 'interaction_selection': {
      if (source.type === 'input_fields' && Array.isArray(source.listItems) && source.listItems.length > 0) {
        return {
          type: 'selection',
          id: generateId('int-sel'),
          instruction,
          questions: source.listItems.map((item, idx) => ({
            id: generateId(`q-${idx}`),
            prompt: item.prompt || 'Elige la opción correcta:',
            mode: 'single_choice',
            options: [
              { id: generateId('opt-1'), text: item.expectedAnswer || 'Opción Correcta', isCorrect: true },
              { id: generateId('opt-2'), text: 'Opción Alternativa', isCorrect: false },
            ],
          })),
        };
      }
      return createInitialInteraction(targetRole, instruction);
    }

    case 'interaction_inputs': {
      if (source.type === 'selection' && Array.isArray(source.questions) && source.questions.length > 0) {
        return {
          type: 'input_fields',
          id: generateId('int-inp'),
          instruction,
          layoutMode: 'list',
          listItems: source.questions.map((q, idx) => {
            const correctOpt = q.options?.find((o) => o.isCorrect)?.text || '';
            return {
              id: generateId(`item-${idx}`),
              prompt: q.prompt || `${idx + 1}. Completa la oración:`,
              expectedAnswer: correctOpt,
              acceptedAnswers: correctOpt ? [correctOpt] : [],
            };
          }),
          tableHeaders: [],
          tableRows: [],
          paragraphTemplate: '',
          paragraphInputs: {},
        };
      }
      return createInitialInteraction(targetRole, instruction);
    }

    case 'interaction_sequence': {
      if (source.type === 'input_fields' && Array.isArray(source.listItems) && source.listItems.length > 0) {
        return {
          type: 'sequence',
          id: generateId('int-seq'),
          instruction,
          items: source.listItems.map((item, idx) => ({
            id: generateId(`item-${idx}`),
            text: item.prompt.replace(/^\d+[\.\)]\s*/, '') || `Paso ${idx + 1}`,
            correctOrder: idx + 1,
          })),
        };
      }
      return createInitialInteraction(targetRole, instruction);
    }

    case 'interaction_buckets': {
      if (source.type === 'input_fields' && Array.isArray(source.listItems) && source.listItems.length > 0) {
        return {
          type: 'buckets_matching',
          id: generateId('int-bkt'),
          instruction,
          buckets: [
            { id: 'b1', label: 'Categoría A', color: '#4f46e5' },
            { id: 'b2', label: 'Categoría B', color: '#059669' },
          ],
          tokens: source.listItems.slice(0, 4).map((item, idx) => ({
            id: generateId(`tok-${idx}`),
            text: item.expectedAnswer || item.prompt.slice(0, 20),
            correctBucketId: idx % 2 === 0 ? 'b1' : 'b2',
          })),
        };
      }
      return createInitialInteraction(targetRole, instruction);
    }

    case 'interaction_writing': {
      const prompt = source.type === 'writing' ? source.prompt : instruction;
      return {
        type: 'writing',
        id: generateId('int-wrt'),
        instruction,
        prompt: prompt || 'Escribe tu respuesta aquí...',
        guidelines: ['Escribe oraciones completas', 'Revisa ortografía y gramática'],
        placeholder: 'Escribe tu respuesta aquí...',
      };
    }

    default:
      return createInitialInteraction(targetRole, instruction);
  }
}

function createInitialInteraction(role: PedagogicalRole, instructionText: string): InteractionBlock {
  const instruction = instructionText || 'Completa la actividad:';

  switch (role) {
    case 'interaction_selection': {
      const sel: SelectionBlock = {
        type: 'selection',
        id: generateId('int-sel'),
        instruction,
        questions: [
          {
            id: generateId('q'),
            prompt: 'Elige la opción correcta:',
            mode: 'single_choice',
            options: [
              { id: generateId('opt'), text: 'Opción A', isCorrect: true },
              { id: generateId('opt'), text: 'Opción B', isCorrect: false }
            ]
          }
        ]
      };
      return sel;
    }
    case 'interaction_buckets': {
      const bkt: BucketsMatchingBlock = {
        type: 'buckets_matching',
        id: generateId('int-bkt'),
        instruction,
        buckets: [
          { id: 'b1', label: 'Categoría A', color: '#4f46e5' },
          { id: 'b2', label: 'Categoría B', color: '#059669' }
        ],
        tokens: [
          { id: generateId('tok'), text: 'Elemento 1', correctBucketId: 'b1' },
          { id: generateId('tok'), text: 'Elemento 2', correctBucketId: 'b2' }
        ]
      };
      return bkt;
    }
    case 'interaction_sequence': {
      const seq: SequenceBlock = {
        type: 'sequence',
        id: generateId('int-seq'),
        instruction,
        items: [
          { id: generateId('item'), text: 'Primer paso / oración', correctOrder: 1 },
          { id: generateId('item'), text: 'Segundo paso / oración', correctOrder: 2 }
        ]
      };
      return seq;
    }
    case 'interaction_writing': {
      const wrt: WritingBlock = {
        type: 'writing',
        id: generateId('int-wrt'),
        instruction,
        prompt: 'Redacta tu respuesta aquí...',
        guidelines: ['Escribe oraciones completas', 'Revisa ortografía y gramática'],
        placeholder: 'Escribe tu respuesta aquí...'
      };
      return wrt;
    }
    case 'interaction_inputs':
    default: {
      const inp: InputFieldsBlock = {
        type: 'input_fields',
        id: generateId('int-inp'),
        instruction,
        layoutMode: 'list',
        listItems: [
          {
            id: generateId('item'),
            prompt: '1. Completa la oración _______ con la forma correcta.',
            expectedAnswer: 'aquí',
            acceptedAnswers: ['aquí']
          }
        ],
        tableHeaders: [],
        tableRows: [],
        paragraphTemplate: '',
        paragraphInputs: {}
      };
      return inp;
    }
  }
}

