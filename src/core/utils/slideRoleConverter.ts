import type {
  Slide,
  InteractionBlock,
  InputFieldsBlock,
  SelectionBlock,
  BucketsMatchingBlock,
  SequenceBlock,
  WritingBlock,
  StructuredReferenceBlock
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
 * Converts an existing Slide to a target pedagogical role cleanly on Canvas.
 * Preserves orthogonality between referenceContent and interaction.
 */
export function convertSlideToRole(slide: Slide, targetRole: PedagogicalRole): Slide {
  const isTargetReference = targetRole === 'reference_text' || targetRole === 'reference_table';
  const currentInteraction = slide.interaction || slide.cachedInteraction || null;

  // CASE 1: TARGET IS REFERENCE
  if (isTargetReference) {
    const nextCached = slide.interaction || slide.cachedInteraction || null;
    let nextReference = slide.referenceContent;

    if (!nextReference) {
      if (targetRole === 'reference_table') {
        const refTable: StructuredReferenceBlock = {
          type: 'reference_table',
          id: generateId('ref-tbl'),
          title: slide.title || 'Cuadro de Referencia',
          instruction: 'Consulta las columnas:',
          columns: [
            { header: 'Columna 1', items: ['Elemento 1', 'Elemento 2'] },
            { header: 'Columna 2', items: ['Elemento A', 'Elemento B'] }
          ]
        };
        nextReference = refTable;
      } else {
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

  // CASE 2: TARGET IS INTERACTIVE
  const nextReference = slide.referenceContent || null;
  let nextInteraction: InteractionBlock | null = null;

  if (currentInteraction) {
    const isSameType = (
      (targetRole === 'interaction_inputs' && currentInteraction.type === 'input_fields') ||
      (targetRole === 'interaction_selection' && currentInteraction.type === 'selection') ||
      (targetRole === 'interaction_buckets' && currentInteraction.type === 'buckets_matching') ||
      (targetRole === 'interaction_sequence' && currentInteraction.type === 'sequence') ||
      (targetRole === 'interaction_writing' && currentInteraction.type === 'writing')
    );

    if (isSameType) {
      nextInteraction = currentInteraction;
    } else {
      // Re-initialize cleanly into target role template
      nextInteraction = createInitialInteraction(targetRole, slide.subtitle || slide.title);
    }
  } else {
    nextInteraction = createInitialInteraction(targetRole, slide.subtitle || slide.title);
  }

  return {
    ...slide,
    referenceContent: nextReference,
    interaction: nextInteraction,
    cachedInteraction: nextInteraction || slide.cachedInteraction || null,
    layout: nextReference && nextInteraction ? 'split_50_50' : 'single_column'
  };
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
