import { 
  type ExtractedBlock, 
  type ExtractedStructuredPayload,
  type Slide,
  SlideSchema
} from '../../types/schema';
import { GoogleGenAI } from '@google/genai';
import {
  isDuplicateReferenceContent,
  isSyntheticPedagogicalText,
  isConcatenationOfItems,
  stripEditorialPrefix,
  stripOrphanTypographicalMarkers,
} from '../text/textDeduplication';

export type ManualTemplateType = 'input_fields' | 'buckets' | 'selection' | 'reference_table' | 'table_grid' | 'writing';

export type ForcedTargetArchetype = 
  | 'input_fields' 
  | 'selection' 
  | 'buckets_matching' 
  | 'sequence' 
  | 'writing' 
  | 'reference_text' 
  | 'reference_table'
  | 'grammar_reference';

export function roleToForcedTargetType(role: string): ForcedTargetArchetype {
  switch (role) {
    case 'interaction_inputs':
      return 'input_fields';
    case 'interaction_selection':
      return 'selection';
    case 'interaction_buckets':
      return 'buckets_matching';
    case 'interaction_sequence':
      return 'sequence';
    case 'interaction_writing':
      return 'writing';
    case 'reference_table':
      return 'reference_table';
    case 'reference_text':
    default:
      return 'reference_text';
  }
}

export function hasDataForRole(
  data: { referenceContent?: any; interaction?: any; rolePayloadCache?: Record<string, any> },
  targetRole: string
): boolean {
  if (data.rolePayloadCache && data.rolePayloadCache[targetRole]) {
    return true;
  }
  if (targetRole === 'reference_text') {
    return Boolean(
      data.referenceContent?.type === 'text' && 
      (Boolean(data.referenceContent.content?.trim()) || Boolean(data.referenceContent.body?.trim()))
    );
  }
  if (targetRole === 'reference_table') {
    if (!data.referenceContent) return false;
    if (data.referenceContent.type === 'reference_table') {
      return (Array.isArray(data.referenceContent.columns) && data.referenceContent.columns.length > 0) || Boolean(data.referenceContent.body?.trim());
    }
    if (data.referenceContent.type === 'table_reference') {
      return (
        (Array.isArray(data.referenceContent.headers) && data.referenceContent.headers.length > 0) ||
        (Array.isArray(data.referenceContent.rows) && data.referenceContent.rows.length > 0) ||
        Boolean(data.referenceContent.body?.trim())
      );
    }
    return false;
  }
  if (!data.interaction) return false;
  switch (targetRole) {
    case 'interaction_inputs':
      return data.interaction.type === 'input_fields' && (
        (Array.isArray(data.interaction.listItems) && data.interaction.listItems.length > 0) ||
        (Array.isArray(data.interaction.tableRows) && data.interaction.tableRows.length > 0)
      );
    case 'interaction_selection':
      return data.interaction.type === 'selection' && 
        Array.isArray(data.interaction.questions) && 
        data.interaction.questions.length > 0;
    case 'interaction_buckets':
      return data.interaction.type === 'buckets_matching' && (
        (Array.isArray(data.interaction.buckets) && data.interaction.buckets.length > 0) ||
        (Array.isArray(data.interaction.tokens) && data.interaction.tokens.length > 0)
      );
    case 'interaction_sequence':
      return data.interaction.type === 'sequence' && 
        Array.isArray(data.interaction.items) && 
        data.interaction.items.length > 0;
    case 'interaction_writing':
      return data.interaction.type === 'writing' && Boolean(data.interaction.prompt?.trim());
    default:
      return false;
  }
}

export const MANUAL_TEMPLATES: Record<ManualTemplateType, {
  label: string;
  detectedType: ExtractedBlock['detectedType'];
  rawText: string;
  parsedData: Record<string, any>;
}> = {
  input_fields: {
    label: 'Fill in blanks (Rellenar espacios)',
    detectedType: 'numbered_list',
    rawText: `Exercise: Complete the sentences with the correct verb form:
1. She _______ (live) in London for three years.
2. We _______ (already / see) that documentary.
3. They _______ (not finish) their homework yet.`,
    parsedData: {
      title: 'Manual: Fill in the Blanks',
      instruction: 'Complete the sentences with the correct verb form:',
      wordBank: [],
      interactionType: 'fill_blanks',
      items: [
        {
          prompt: '1. She _______ (live) in London for three years.',
          expectedAnswer: 'has lived',
          acceptedAnswers: ['has lived', 'has been living', 'lived'],
          isExample: false,
          explanation: 'Present perfect (affirmative)'
        },
        {
          prompt: '2. We _______ (already / see) that documentary.',
          expectedAnswer: 'have already seen',
          acceptedAnswers: ['have already seen', 'already saw', 'have seen'],
          isExample: false,
          explanation: 'Present perfect with already'
        },
        {
          prompt: '3. They _______ (not finish) their homework yet.',
          expectedAnswer: "haven't finished",
          acceptedAnswers: ["haven't finished", 'have not finished', 'did not finish'],
          isExample: false,
          explanation: 'Present perfect (negative)'
        }
      ]
    }
  },
  buckets: {
    label: 'Buckets (Clasificación por categorías)',
    detectedType: 'vocabulary',
    rawText: `Dependent Prepositions Classification:
Categorize each verb under its matching preposition:
- apply (FOR)
- apologize (FOR)
- succeed (IN)
- participate (IN)
- belong (TO)
- listen (TO)
- agree (WITH)
- deal (WITH)`,
    parsedData: {
      title: 'Manual: Prepositions Classification',
      instruction: 'Categorize each verb under its matching preposition:',
      wordBank: [],
      interactionType: 'buckets',
      buckets: ['FOR', 'IN', 'TO', 'WITH'],
      items: [
        { prompt: 'apply', expectedAnswer: 'FOR', acceptedAnswers: ['FOR'], isExample: false, explanation: 'Dependent preposition: apply for' },
        { prompt: 'apologize', expectedAnswer: 'FOR', acceptedAnswers: ['FOR'], isExample: false, explanation: 'Dependent preposition: apologize for' },
        { prompt: 'succeed', expectedAnswer: 'IN', acceptedAnswers: ['IN'], isExample: false, explanation: 'Dependent preposition: succeed in' },
        { prompt: 'participate', expectedAnswer: 'IN', acceptedAnswers: ['IN'], isExample: false, explanation: 'Dependent preposition: participate in' },
        { prompt: 'belong', expectedAnswer: 'TO', acceptedAnswers: ['TO'], isExample: false, explanation: 'Dependent preposition: belong to' },
        { prompt: 'listen', expectedAnswer: 'TO', acceptedAnswers: ['TO'], isExample: false, explanation: 'Dependent preposition: listen to' },
        { prompt: 'agree', expectedAnswer: 'WITH', acceptedAnswers: ['WITH'], isExample: false, explanation: 'Dependent preposition: agree with' },
        { prompt: 'deal', expectedAnswer: 'WITH', acceptedAnswers: ['WITH'], isExample: false, explanation: 'Dependent preposition: deal with' }
      ]
    }
  },
  selection: {
    label: 'Selection (Opción múltiple / Selección)',
    detectedType: 'numbered_list',
    rawText: `Multiple Choice Grammar Quiz:
1. Choose the grammatically accurate statement:
A) She is living here since 2018.
B) She has lived here since 2018. [Correct]
C) She lives here since 2018.`,
    parsedData: {
      title: 'Manual: Grammar Accuracy Selection',
      instruction: 'Choose the grammatically accurate statement:',
      wordBank: [],
      interactionType: 'multiple_choice',
      items: [
        {
          prompt: 'Which sentence correctly expresses an action started in the past and continuing now?',
          expectedAnswer: 'She has lived here since 2018.',
          acceptedAnswers: ['She has lived here since 2018.'],
          options: [
            'She has lived here since 2018.',
            'She is living here since 2018.',
            'She lives here since 2018.'
          ],
          isExample: false,
          explanation: 'Present perfect with "since" conveys continuing duration.'
        }
      ]
    }
  },
  reference_table: {
    label: 'Reference Table (Cuadro gramatical / Tabla)',
    detectedType: 'table',
    rawText: `Grammar Reference Table:
Tense | Time Marker | Example
Past Simple | yesterday, in 2020, 2 days ago | I visited Rome last year.
Present Perfect | already, yet, ever, never, so far | I have visited Rome twice.`,
    parsedData: {
      title: 'Manual: Tense Contrast Reference Table',
      referenceContent: 'Rule: Use Past Simple for completed past time and Present Perfect for unfinished or unspecified time.',
      headers: ['Tense', 'Time Marker', 'Example'],
      rows: [
        ['Past Simple', 'yesterday, in 2020, 2 days ago', 'I visited Rome last year.'],
        ['Present Perfect', 'already, yet, ever, never, so far', 'I have visited Rome twice.']
      ],
      tableData: [
        { header: 'Past Simple', items: ['yesterday', 'in 2020', '2 days ago', 'I visited Rome last year.'] },
        { header: 'Present Perfect', items: ['already', 'yet', 'ever', 'never', 'I have visited Rome twice.'] }
      ],
      columns: [
        { header: 'Past Simple', items: ['yesterday', 'in 2020', '2 days ago', 'I visited Rome last year.'] },
        { header: 'Present Perfect', items: ['already', 'yet', 'ever', 'never', 'I have visited Rome twice.'] }
      ]
    }
  },
  table_grid: {
    label: 'Interactive Table (Tabla / Cuadrícula interactiva)',
    detectedType: 'table',
    rawText: `Complete the table with the correct question words:
Question Word | Meaning / Use | Example
Who | Asking about a person | Who is that?
Where | Asking about a place | Where do you live?
When | Asking about time | When is the exam?
What | Asking about things | What is your name?`,
    parsedData: {
      title: 'Manual: Question Words Interactive Grid',
      instruction: 'Complete the table with the correct question words from the box:',
      wordBank: ['Who', 'Where', 'When', 'What', 'Why', 'Which'],
      interactionType: 'fill_blanks',
      tableHeaders: ['Question Word', 'Meaning / Use', 'Example'],
      tableRows: [
        [
          { text: 'Who', isInput: true, expectedAnswer: 'Who', acceptedAnswers: ['Who'], isExample: true },
          { text: 'Asking about a person', isInput: false, isExample: false },
          { text: 'Who is that?', isInput: false, isExample: false }
        ],
        [
          { text: '', isInput: true, expectedAnswer: 'Where', acceptedAnswers: ['Where'], isExample: false },
          { text: 'Asking about a place', isInput: false, isExample: false },
          { text: 'Where do you live?', isInput: false, isExample: false }
        ],
        [
          { text: '', isInput: true, expectedAnswer: 'When', acceptedAnswers: ['When'], isExample: false },
          { text: 'Asking about time', isInput: false, isExample: false },
          { text: 'When is the exam?', isInput: false, isExample: false }
        ],
        [
          { text: '', isInput: true, expectedAnswer: 'What', acceptedAnswers: ['What'], isExample: false },
          { text: 'Asking about things', isInput: false, isExample: false },
          { text: 'What is your name?', isInput: false, isExample: false }
        ]
      ]
    }
  },
  writing: {
    label: 'Writing (Producción escrita)',
    detectedType: 'paragraph',
    rawText: `Writing Task: Write a short profile about someone you admire.
Guidelines:
- Mention their occupation and daily routine.
- Use at least three descriptive adjectives.
- Check punctuation and spelling.`,
    parsedData: {
      title: 'Writing: Profile of an Inspiring Person',
      instruction: 'Write a short profile about someone you admire following the guidelines:',
      prompt: 'Write a profile (40-100 words) describing their occupation, routine, and why you admire them.',
      guidelines: [
        'Mention their occupation and daily routine.',
        'Use at least three descriptive adjectives.',
        'Check punctuation and spelling.'
      ],
      minWords: 40,
      maxWords: 100,
      wordBank: [],
      interactionType: 'writing',
      isGraded: false,
      items: []
    }
  }
};

/**
 * Creates an ExtractedBlock from a manual template.
 */
export function createManualBlock(templateType: ManualTemplateType): ExtractedBlock {
  const template = MANUAL_TEMPLATES[templateType];
  return {
    id: `manual-${templateType}-${Date.now()}`,
    rawText: template.rawText,
    detectedType: template.detectedType,
    confidence: 1.0,
    parsedData: JSON.parse(JSON.stringify(template.parsedData))
  };
}

/**
 * Consolidates multiple extracted blocks into ONE single holistic pedagogical block.
 */
export function consolidateBlocks(blocks: ExtractedBlock[], sourceUrl?: string): ExtractedBlock {
  if (blocks.length === 0) {
    return {
      id: `consolidated-${Date.now()}`,
      rawText: '',
      detectedType: 'vocabulary',
      confidence: 1.0,
      sourceImageSnippetUrl: sourceUrl,
      parsedData: {}
    };
  }

  if (blocks.length === 1) {
    const single = blocks[0];
    const singleImages = Array.isArray(single.sourceImages) && single.sourceImages.length > 0
      ? single.sourceImages
      : (sourceUrl ? [sourceUrl] : (single.sourceImageSnippetUrl ? [single.sourceImageSnippetUrl] : []));
    return {
      ...single,
      sourceImageSnippetUrl: sourceUrl || single.sourceImageSnippetUrl,
      sourceImages: singleImages.length > 0 ? singleImages : undefined,
      parsedData: {
        ...(single.parsedData || {}),
        images: singleImages.length > 0 ? singleImages : undefined,
        imageUrl: singleImages[0] || undefined,
      }
    };
  }

  const rawText = blocks
    .map((b) => b.rawText.trim())
    .filter(Boolean)
    .join('\n\n');

  let detectedType: ExtractedBlock['detectedType'] = 'numbered_list';
  if (blocks.some((b) => b.detectedType === 'vocabulary')) {
    detectedType = 'vocabulary';
  } else if (blocks.some((b) => b.detectedType === 'table')) {
    detectedType = 'table';
  }

  const primary = blocks[0].parsedData || {};
  const mergedItems: any[] = [];
  const mergedWordBank: string[] = [];
  const allImages: string[] = [];

  if (sourceUrl) allImages.push(sourceUrl);

  for (const b of blocks) {
    const pd = b.parsedData || {};
    if (Array.isArray(pd.items)) mergedItems.push(...pd.items);
    if (Array.isArray(pd.wordBank)) {
      pd.wordBank.forEach((w: string) => {
        if (!mergedWordBank.includes(w)) mergedWordBank.push(w);
      });
    }
    if (Array.isArray(b.sourceImages)) {
      b.sourceImages.forEach((img) => {
        if (img && !allImages.includes(img)) allImages.push(img);
      });
    } else if (b.sourceImageSnippetUrl && !allImages.includes(b.sourceImageSnippetUrl)) {
      allImages.push(b.sourceImageSnippetUrl);
    }
    if (Array.isArray(pd.images)) {
      pd.images.forEach((img: string) => {
        if (img && !allImages.includes(img)) allImages.push(img);
      });
    }
  }

  const mergedInstruction = blocks.map((b) => b.parsedData?.instruction).filter(Boolean).join(' ') || primary.instruction || '';
  const mergedTitle = blocks.map((b) => b.parsedData?.title).filter(Boolean)[0] || primary.title || '';
  const mergedVerificationAudioUrl = blocks.map((b) => b.parsedData?.verificationAudioUrl).filter(Boolean)[0] || primary.verificationAudioUrl;
  const mergedAudioLabel = blocks.map((b) => b.parsedData?.audioLabel).filter(Boolean)[0] || primary.audioLabel;
  const mergedFollowUpPrompt = blocks.map((b) => b.parsedData?.followUpPrompt).filter(Boolean)[0] || primary.followUpPrompt;

  const mergedParsed: Record<string, any> = {
    ...primary,
    ...(mergedInstruction ? { instruction: mergedInstruction } : {}),
    ...(mergedTitle ? { title: mergedTitle } : {}),
    ...(mergedVerificationAudioUrl ? { verificationAudioUrl: mergedVerificationAudioUrl } : {}),
    ...(mergedAudioLabel ? { audioLabel: mergedAudioLabel } : {}),
    ...(mergedFollowUpPrompt ? { followUpPrompt: mergedFollowUpPrompt } : {}),
    items: mergedItems.length > 0 ? mergedItems : primary.items,
    wordBank: mergedWordBank.length > 0 ? mergedWordBank : primary.wordBank,
    tableHeaders: primary.tableHeaders,
    tableRows: primary.tableRows,
    images: allImages.length > 0 ? allImages : undefined,
    imageUrl: allImages[0] || undefined,
  };

  return {
    id: `consolidated-${Date.now()}`,
    rawText,
    detectedType,
    confidence: Math.max(...blocks.map((b) => b.confidence || 0.9)),
    sourceImageSnippetUrl: sourceUrl || allImages[0],
    sourceImages: allImages.length > 0 ? allImages : undefined,
    parsedData: mergedParsed
  };
}

/**
 * Strict Structured Output schema (JSON Schema) for Google Gemini SDK and OpenRouter.
 * Direct 1:1 alignment with Slide, ReferenceBlock, and InteractionBlock in schema.ts.
 */
export const STRUCTURED_SLIDE_SCHEMA = {
  type: 'object',
  properties: {
    slides: {
      type: 'array',
      description: 'List of pedagogically structured slides extracted from the textbook clippings.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique identifier (e.g. "slide-1")' },
          title: { type: 'string', description: 'Concise formal activity title (e.g. "Speaking: Personal Information", "Grammar: Past Simple")' },
          subtitle: { type: 'string', description: 'Brief pedagogical subtitle or directive (e.g. "Work in pairs. Ask and answer")' },
          layout: {
            type: 'string',
            enum: ['single_column', 'split_50_50', 'header_stacked'],
            description: 'split_50_50 when referenceContent is present; single_column when referenceContent is null (e.g. self-sufficient tables/grids where all content is within the table).'
          },
          isGraded: {
            type: 'boolean',
            description: 'false for open discussions, surveys, personal reflections, opinions or speaking/writing without fixed answers. true for objectively evaluable exercises.'
          },
          contextBody: {
            type: 'string',
            description: 'Literal contextual explanations, rules, bullet points, or TIPS accompanying the main structured element.'
          },
          notes: { type: 'string', description: 'Optional teaching or editorial notes' },
          referenceContent: {
            type: 'object',
            description: 'Passive consultation material: literal reading passage, dialogue, grammar rule table, or vocabulary collocation chart. MUST be null if no independent passive reading text is printed in the clipping, or in self-sufficient table/grid exercises where solved examples belong to table cells.',
            properties: {
              type: {
                type: 'string',
                enum: ['text', 'reference_table', 'table_reference', 'media'],
                description: 'Discriminator for reference block.'
              },
              id: { type: 'string', description: 'Unique ID (e.g. "ref-1")' },
              title: { type: 'string', description: 'Title of the reading passage or reference chart' },
              content: {
                type: 'string',
                description: 'Literal text of continuous reading passage, story, or dialogue. Preserve paragraphs with double line breaks (\\n\\n). NEVER fragment continuous articles into columns.'
              },
              category: {
                type: 'string',
                enum: ['reading', 'grammar_note', 'instructions', 'dialogue'],
                description: 'Category of reference text.'
              },
              instruction: { type: 'string', description: 'Instruction for reference table if applicable' },
              columns: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    header: { type: 'string' },
                    items: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['header', 'items']
                },
                description: 'Columns of parallel comparative data, vocabulary lists, or grammar categories. Use ONLY for tabular lists, NEVER for continuous narrative reading articles.'
              },
              headers: {
                type: 'array',
                items: { type: 'string' },
                description: 'Column headers for table_reference'
              },
              rows: {
                type: 'array',
                items: {
                  type: 'array',
                  items: { type: 'string' }
                },
                description: '2D row cells for table_reference'
              },
              caption: { type: 'string', description: 'Optional footnote, tip or caveat note' },
              body: {
                type: 'string',
                description: 'Literal explanatory notes, grammar rules, tips, bullet points or surrounding narrative commentary that accompanies this reference table or passage.'
              },
              verificationAudioUrl: { type: 'string' },
              audioLabel: { type: 'string' },
              followUpPrompt: { type: 'string' }
            },
            required: ['type', 'id']
          },
          interaction: {
            type: 'object',
            description: 'Active interactive exercise evaluated by student. MUST be null if slide is pure reference or speaking card with offline conversation.',
            properties: {
              type: {
                type: 'string',
                enum: ['input_fields', 'selection', 'buckets_matching', 'sequence', 'writing'],
                description: 'Discriminator for the interaction primitive.'
              },
              id: { type: 'string', description: 'Unique ID (e.g. "int-1")' },
              instruction: {
                type: 'string',
                description: 'The explicit pedagogical directive or task prompt read by the student. MUST NEVER BE EMPTY.'
              },
              verificationAudioUrl: { type: 'string', description: 'URL or path to verification audio track if mentioned (e.g. "/audio/R1.2.mp3")' },
              audioLabel: { type: 'string', description: 'Track code or label (e.g. "R1.2", "CD1 Track 5")' },
              followUpPrompt: { type: 'string', description: 'Communicative follow-up directive, speaking practice, or peer discussion task' },
              // input_fields
              layoutMode: {
                type: 'string',
                enum: ['list', 'table', 'inline_paragraph'],
                description: 'Layout mode for input_fields. Use "table" for 2D fill-in grids, "list" for numbered sentences.'
              },
              wordBank: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional pool of words or options for cloze completion'
              },
              listItems: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    prompt: { type: 'string', description: 'The sentence or question containing the blank or prompt' },
                    prefix: { type: 'string' },
                    suffix: { type: 'string' },
                    expectedAnswer: { type: 'string', description: 'Canonical solved answer' },
                    acceptedAnswers: { type: 'array', items: { type: 'string' }, description: 'All acceptable variants including contractions' },
                    hint: { type: 'string' },
                    explanation: { type: 'string' },
                    isExample: { type: 'boolean', description: 'true if item was already solved as a sample in the textbook' }
                  },
                  required: ['id', 'prompt', 'acceptedAnswers']
                }
              },
              tableHeaders: {
                type: 'array',
                items: { type: 'string' },
                description: 'Headers for 2D table layout'
              },
              tableRows: {
                type: 'array',
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string' },
                      isInput: { type: 'boolean' },
                      inputId: { type: 'string' },
                      expectedAnswer: { type: 'string' },
                      acceptedAnswers: { type: 'array', items: { type: 'string' } },
                      isExample: { type: 'boolean' },
                      hint: { type: 'string' }
                    },
                    required: ['text', 'isInput']
                  }
                }
              },
              paragraphTemplate: { type: 'string' },
              paragraphInputs: { type: 'object' },
              // selection
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    prompt: {
                      type: 'string',
                      description: "Contextual statement or sentence containing a '{{blank}}' placeholder where the user selection must fit."
                    },
                    question: {
                      type: 'string',
                      description: "Contextual statement or sentence containing a '{{blank}}' placeholder where the user selection must fit."
                    },
                    contextText: { type: 'string' },
                    mode: { type: 'string', enum: ['single_choice', 'multiple_choice', 'dropdown'] },
                    isExample: { type: 'boolean', description: 'true if this question/item is a solved textbook example' },
                    allowMultiple: { type: 'boolean', description: 'true if multiple options can be chosen with checkboxes' },
                    options: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          text: { type: 'string' },
                          isCorrect: { type: 'boolean' },
                          feedback: { type: 'string' },
                          isExample: { type: 'boolean', description: 'true if this option is already marked or circled as a solved textbook model/sample' }
                        },
                        required: ['id', 'text']
                      }
                    }
                  },
                  required: ['id', 'prompt', 'mode', 'options']
                }
              },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    text: { type: 'string', description: 'Full intact text of candidate option or item to mark' },
                    isCorrect: { type: 'boolean', description: 'true if this candidate should be checked/selected' },
                    feedback: { type: 'string' },
                    isExample: { type: 'boolean', description: 'true if this option is already marked or circled as a solved textbook model/sample' }
                  },
                  required: ['id', 'text']
                },
                description: 'Flat list of candidate options for checklist or multi-selection tasks (e.g. "Tick the phrases", "Which sentences are true?")'
              },
              allowMultiple: { type: 'boolean' },
              // buckets_matching
              buckets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string', description: 'Bucket/target label preserving verbatim textbook visual identifiers (e.g. "Paragraph 1", "Section A")' },
                    description: { type: 'string' },
                    color: { type: 'string' }
                  },
                  required: ['id', 'label']
                }
              },
              tokens: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    text: { type: 'string', description: 'Token text preserving verbatim textbook visual identifiers (e.g. "a. Heading title", "1. Word")' },
                    correctBucketId: { type: 'string' },
                    isExample: { type: 'boolean' },
                    hint: { type: 'string' }
                  },
                  required: ['id', 'text', 'correctBucketId']
                }
              },
              targetSlots: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string' }
                  },
                  required: ['id', 'label']
                }
              },
              sourceItems: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    text: { type: 'string' },
                    correctTargetId: { type: 'string' },
                    isExample: { type: 'boolean' }
                  },
                  required: ['id', 'text']
                }
              },
              // sequence
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    text: { type: 'string' },
                    correctOrder: { type: 'integer' },
                    speaker: { type: 'string' },
                    hint: { type: 'string' }
                  },
                  required: ['id', 'text', 'correctOrder']
                }
              },
              // writing
              prompt: { type: 'string', description: 'Central guiding prompt or question for open production/analysis' },
              guidelines: { type: 'array', items: { type: 'string' }, description: 'Guiding checklist, steps or rubric points' },
              minWords: { type: 'integer' },
              maxWords: { type: 'integer' },
              placeholder: { type: 'string' },
              evaluationRubric: { type: 'string' }
            },
            required: ['type', 'id', 'instruction']
          }
        },
        required: ['id', 'title', 'layout']
      }
    }
  },
  required: ['slides']
};

/** Backward compatibility alias */
export const STRUCTURED_EXTRACTION_SCHEMA = STRUCTURED_SLIDE_SCHEMA;

/**
 * Custom error thrown when Vision API output fails schema validation.
 */
export class SchemaValidationError extends Error {
  public issues: any[];
  public rawPayload: any;

  constructor(message: string, issues: any[], rawPayload: any) {
    super(message);
    this.name = 'SchemaValidationError';
    this.issues = issues;
    this.rawPayload = rawPayload;
  }
}

/**
 * Sanitizes referenceContent prior to SlideSchema validation.
 * Normalizes listening tracks, media types, and missing URLs, or removes invalid blocks
 * cleanly to prevent fatal rejection of the slide.
 */
export function sanitizeReferenceContent(rawRef: any, idx: number): any {
  if (!rawRef || typeof rawRef !== 'object') {
    return null;
  }

  const ref = { ...rawRef };
  if (!ref.id) {
    ref.id = `ref-${Date.now()}-${idx}`;
  }

  // 1. Identify and normalize type
  let type = typeof ref.type === 'string' ? ref.type.toLowerCase().trim() : '';

  // Handle type aliases
  if (type === 'reference_text') type = 'text';
  if (type === 'columns') type = 'reference_table';
  if (type === 'listening' || type === 'audio' || type === 'image') {
    if (!ref.mediaType) {
      ref.mediaType = type === 'image' ? 'image' : 'audio';
    }
    type = 'media';
  }

  // Auto-detect type if missing
  if (!type) {
    if (ref.content !== undefined || ref.body !== undefined) type = 'text';
    else if (ref.rows !== undefined || ref.headers !== undefined) type = 'table_reference';
    else if (ref.columns !== undefined) type = 'reference_table';
    else if (ref.mediaType !== undefined || ref.url !== undefined || ref.transcript !== undefined) type = 'media';
    else return null;
  }

  ref.type = type;

  // 2. Normalization according to target block type
  if (type === 'media') {
    let mType = typeof ref.mediaType === 'string' ? ref.mediaType.toLowerCase().trim() : '';
    if (mType === 'listening' || mType === 'sound' || mType === 'track') {
      mType = 'audio';
    } else if (mType === 'picture' || mType === 'photo' || mType === 'img') {
      mType = 'image';
    } else if (mType !== 'audio' && mType !== 'image') {
      const textToScan = `${ref.title || ''} ${ref.transcript || ''} ${ref.url || ''}`;
      if (/\b(?:audio|listening|listen|track|cd|r\d+\.?\d*)\b/i.test(textToScan)) {
        mType = 'audio';
      } else if (/\b(?:image|photo|picture|diagram|figura)\b/i.test(textToScan)) {
        mType = 'image';
      } else {
        mType = 'audio';
      }
    }
    ref.mediaType = mType;

    let url = typeof ref.url === 'string' ? ref.url.trim() : '';
    if (!url) {
      if (ref.mediaType === 'audio') {
        url = 'placeholder:audio-track';
      } else {
        if (!ref.title && !ref.transcript) {
          return null;
        }
        url = '';
      }
    }
    ref.url = url;

    if (!ref.url && !ref.title && !ref.transcript) {
      return null;
    }

    return ref;
  }

  if (type === 'text') {
    if ((typeof ref.content !== 'string' || !ref.content.trim()) && typeof ref.body === 'string' && ref.body.trim()) {
      ref.content = ref.body.trim();
    }
    if ((typeof ref.body !== 'string' || !ref.body.trim()) && typeof ref.content === 'string' && ref.content.trim()) {
      ref.body = ref.content.trim();
    }
    if (typeof ref.content !== 'string' || !ref.content.trim()) {
      if (typeof ref.title === 'string' && ref.title.trim()) {
        ref.content = ref.title.trim();
        ref.body = ref.title.trim();
      } else {
        return null;
      }
    }
    if (!ref.category || !['reading', 'grammar_note', 'instructions', 'dialogue'].includes(ref.category)) {
      if (ref.category === 'grammar_reference' || ref.category === 'grammar_rules' || ref.category === 'theory') {
        ref.category = 'grammar_note';
      } else if (ref.category === 'reading_passage' || ref.category === 'passage' || ref.category === 'article') {
        ref.category = 'reading';
      } else if (ref.category === 'conversation') {
        ref.category = 'dialogue';
      } else {
        ref.category = 'grammar_note';
      }
    }
    return ref;
  }

  if (type === 'table_reference') {
    if (!Array.isArray(ref.headers)) ref.headers = [];
    if (!Array.isArray(ref.rows)) ref.rows = [];
    if (typeof ref.body === 'string') ref.body = ref.body.trim();
    if (typeof ref.instruction === 'string') ref.instruction = ref.instruction.trim();
    if (typeof ref.caption === 'string') ref.caption = ref.caption.trim();
    if (!ref.body && typeof ref.content === 'string' && ref.content.trim()) {
      ref.body = ref.content.trim();
    }
    if (ref.headers.length === 0 && ref.rows.length === 0 && !ref.body) {
      return null;
    }
    return ref;
  }

  if (type === 'reference_table') {
    if (!Array.isArray(ref.columns)) ref.columns = [];
    if (!ref.title) ref.title = 'Tabla de Referencia';
    if (typeof ref.body === 'string') ref.body = ref.body.trim();
    if (typeof ref.instruction === 'string') ref.instruction = ref.instruction.trim();
    if (typeof ref.caption === 'string') ref.caption = ref.caption.trim();
    if (!ref.body && typeof ref.content === 'string' && ref.content.trim()) {
      ref.body = ref.content.trim();
    }
    if (ref.columns.length === 0 && !ref.body) {
      return null;
    }
    return ref;
  }

  return null;
}

/**
 * Palabras clave que denotan producción abierta, justificación o redacción reflexiva.
 * Si están presentes, la consigna NUNCA debe considerarse una disyunción cerrada simplista.
 */
export const OPEN_WRITING_EXCLUSION_REGEX =
  /\b(why|explain|give reasons?|describe|write|paragraph|opinion|discuss|tell)\b/i;

/**
 * Detects whether an interrogative prompt is a concise, purely conceptual Alternative/Disjunctive Question (CCQ)
 * (e.g. "Do/Is/Are ... [Option A] or [Option B]?") and extracts the discrete options.
 *
 * CRITERIOS DE EXCLUSIÓN INCONDICIONAL:
 * - Si contiene palabras clave de producción abierta (why, explain, give reasons, describe, write, paragraph, opinion, discuss, tell).
 * - Si supera el umbral descriptivo de 20 palabras.
 * - Si las opciones candidatas no son contrastes breves (máx 3 palabras por opción).
 */
export function extractDisjunctiveAlternatives(text: string): { prompt: string; options: string[] } | null {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  // Criterio 1: Descartar consignas descriptivas extensas (> 20 palabras)
  if (trimmed.split(/\s+/).length > 20) return null;

  // Criterio 2: Exclusión incondicional por verbos/pautas de producción abierta
  if (OPEN_WRITING_EXCLUSION_REGEX.test(trimmed)) return null;

  // Must match an auxiliary/modal question containing 'or' and ending with '?'
  const auxMatch = trimmed.match(
    /\b(Do|Does|Did|Is|Are|Was|Were|Can|Could|Should|Would|Will|Has|Have|Had)\b([^?]*\bor\b[^?]*)\?/i
  );

  if (!auxMatch) return null;

  const matchedQuestion = auxMatch[0].trim();
  if (matchedQuestion.split(/\s+/).length > 20) return null;
  if (OPEN_WRITING_EXCLUSION_REGEX.test(matchedQuestion)) return null;

  const questionBody = auxMatch[2]; // between auxiliary and '?'
  const orParts = questionBody.split(/\s+or\s+/i);
  if (orParts.length !== 2) return null;

  const cleanQuotesAndPunct = (s: string) => s.replace(/['"“”‘’]/g, '').replace(/[?.!,;:]+$/, '').trim();
  const stripLeadingTokens = (s: string) => s.replace(/^(?:(?:the|a|an|to|in|at|on|about|of)\s+)+/gi, '').trim();

  const rawRight = cleanQuotesAndPunct(orParts[1]);
  if (!rawRight) return null;

  const candidateB = stripLeadingTokens(rawRight);
  const rightWords = candidateB.split(/\s+/);
  if (rightWords.length > 3) return null; // CCQs discretos: máximo 3 palabras por opción

  const rawLeft = cleanQuotesAndPunct(orParts[0]);
  const leftTokens = rawLeft.split(/\s+/).filter(Boolean);
  if (leftTokens.length === 0) return null;

  const numTokens = Math.min(Math.max(rightWords.length, 1), 3);
  const leftCandidateRaw = leftTokens.slice(-numTokens).join(' ');
  const candidateA = stripLeadingTokens(leftCandidateRaw);

  if (!candidateA || !candidateB) return null;

  const finalA = candidateA.toLowerCase().replace(/^[([\]+|[)\]]+$/g, '').trim();
  const finalB = candidateB.toLowerCase().replace(/^[([\]+|[)\]]+$/g, '').trim();

  if (!finalA || !finalB || finalA === finalB) return null;

  if (OPEN_WRITING_EXCLUSION_REGEX.test(finalA) || OPEN_WRITING_EXCLUSION_REGEX.test(finalB)) {
    return null;
  }

  return {
    prompt: matchedQuestion,
    options: [finalA, finalB],
  };
}

/**
 * Limpia el texto de una pregunta o enunciado de selección:
 * - Elimina tokens espurios de completación como '[ ? ]', '[?]', etc.
 * - Si es una pregunta directa, elimina marcadores de hueco como '{{blank}}', '[blank]' o '___'.
 * - Si referenceText está presente y fue duplicado dentro del prompt, lo remueve para evitar redundancia.
 */
export function cleanSelectionPrompt(rawPrompt: string, referenceText?: string): string {
  if (!rawPrompt || typeof rawPrompt !== 'string') return '';

  let cleaned = rawPrompt.trim();

  // 1. Remover duplicación del panel de lectura/referencia si el prompt lo incluyó
  if (referenceText && typeof referenceText === 'string') {
    const trimmedRef = referenceText.trim();
    if (trimmedRef && cleaned.includes(trimmedRef)) {
      cleaned = cleaned.replace(trimmedRef, '').trim();
    } else if (cleaned.includes('\n\n')) {
      const parts = cleaned.split('\n\n');
      const lastPart = parts[parts.length - 1].trim();
      if (lastPart.endsWith('?')) {
        cleaned = lastPart;
      }
    }
  }

  // 2. Remover tokens prohibidos de completación '[ ? ]' o '[?]'
  cleaned = cleaned
    .replace(/\[\s*\?\s*\]/g, '')
    .replace(/\[\s*&\w+;\s*\?\s*&\w+;\s*\]/g, '');

  // 3. Si es una pregunta directa / interrogativa, remover '{{blank}}', '[blank]' o '___'
  if (
    cleaned.includes('?') ||
    /\b(Do|Does|Did|Is|Are|Was|Were|Which|What|Who|Where|When|Why|How)\b/i.test(cleaned)
  ) {
    cleaned = cleaned
      .replace(/\{\{\s*blank\s*\}\}/gi, '')
      .replace(/\[\s*blank\s*\]/gi, '')
      .replace(/_{2,}/g, '');
  }

  // 4. Normalizar espacios en blanco y puntuación
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').trim();
  cleaned = cleaned.replace(/\s+\?$/, '?');

  return cleaned;
}

/**
 * Normalizes instruction phrasing on non-interactive slides to consultative/reading verbs,
 * avoiding resolutive action verbs (e.g. "Complete...", "Fill in...") when there are zero inputs.
 */
export function normalizeNonInteractiveInstruction(instruction?: string): string {
  if (!instruction || typeof instruction !== 'string') return 'Read and review the reference material:';
  const trimmed = instruction.trim();
  const resolutiveRegex = /^(?:complete|fill\s+in|fill\s+out|choose|select|write|circle|match|tick|check|subraya|completa|rellena|elige|selecciona|escribe)\b/i;
  if (resolutiveRegex.test(trimmed)) {
    return trimmed
      .replace(/^complete\s+the\s+table\b/i, 'Study the table')
      .replace(/^complete\s+the\s+chart\b/i, 'Study the chart')
      .replace(/^complete\s+the\s+sentences\b/i, 'Read the sentences')
      .replace(/^fill\s+in\s+the\s+blanks?\b/i, 'Review the rules and examples')
      .replace(/^fill\s+in\s+the\s+table\b/i, 'Study the table')
      .replace(/^choose\s+the\s+correct\s+answers?\b/i, 'Review the examples')
      .replace(/^write\b/i, 'Read')
      .replace(resolutiveRegex, 'Review');
  }
  return trimmed;
}

/**
 * Detects whether reference content is solely spurious metadata
 * (an exercise instruction, task directive, or single model/example sentence)
 * rather than an autonomous continuous reading or consultation text.
 */
export function isSpuriousReferenceMetadata(
  ref: any,
  interaction?: any,
  subtitle?: string,
  title?: string
): boolean {
  if (!ref) return false;
  if (ref.type !== 'text') return false;

  const content = (ref.body || ref.content || '').trim();
  if (!content) return true;

  // 1. Explicit instructions category or metadata title
  if (ref.category === 'instructions') {
    return true;
  }
  if (ref.title && /^(?:examples?|models?|instructions?|directions?|consigna)\b/i.test(ref.title.trim())) {
    return true;
  }

  // 2. Identity or duplication with activity instructions, subtitle, or title
  const normalizeForComparison = (s: string) =>
    s.toLowerCase().replace(/[.,;:!?]/g, '').replace(/\s+/g, ' ').trim();

  const normContent = normalizeForComparison(content);
  const normSub = subtitle ? normalizeForComparison(subtitle) : '';
  const normInst = interaction?.instruction ? normalizeForComparison(interaction.instruction) : '';
  const normTitle = title ? normalizeForComparison(title) : '';

  if (normSub && (normContent === normSub || normSub.includes(normContent))) {
    return true;
  }
  if (normInst && (normContent === normInst || normInst.includes(normContent))) {
    return true;
  }
  if (normTitle && normContent === normTitle) {
    return true;
  }

  // 3. Solved demonstration or model sentence ("Example", "Model", "e.g.", "for example")
  if (/^(?:examples?|models?|samples?|demos?|e\.g\.|for example)\b[:\s]/i.test(content)) {
    const lines = content.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);
    const isMultiSpeakerDialogue = lines.length >= 3 && lines.every((l: string) => /^[A-Z][a-z]*\s*:\s*/.test(l));
    if (!isMultiSpeakerDialogue && (lines.length <= 3 || !content.includes('\n\n'))) {
      return true;
    }
  }

  // 4. Pure imperative exercise directions / consignas (e.g. "Complete the sentences...", "Choose the correct option...")
  const isDirectiveHeader = /^(?:instructions?|directions?|consigna|task)\b[:\s]/i.test(content);
  const startsWithImperativeVerb = /^(?:complete|fill in|choose|circle|select|underline|match|tick|write|read and complete|look and write|put the words|rewrite|listen and check|ask and answer|answer the questions|cross out)\b/i.test(content);
  if (isDirectiveHeader || startsWithImperativeVerb) {
    const lines = content.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);
    if (lines.length <= 3 && !content.includes('\n\n')) {
      return true;
    }
  }

  return false;
}

/**
 * Folds spurious metadata (instruction or solved example) into activity headers/items.
 */
export function foldSpuriousMetadata(text: string, slide: any): void {
  if (!text) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  const isExample = /^(?:examples?|models?|samples?|demos?|e\.g\.|for example)\b[:\s]/i.test(trimmed);

  if (slide.interaction) {
    const currentInst = slide.interaction.instruction ? slide.interaction.instruction.trim() : '';
    const isGenericInst = !currentInst || ['activity', 'practice', 'exercise', 'task'].includes(currentInst.toLowerCase());

    if (isGenericInst) {
      slide.interaction.instruction = trimmed;
    } else if (isExample) {
      if (!currentInst.toLowerCase().includes(trimmed.toLowerCase())) {
        slide.interaction.instruction = `${currentInst}\n${trimmed}`.trim();
      }
    } else {
      if (!currentInst.toLowerCase().includes(trimmed.toLowerCase())) {
        slide.interaction.instruction = trimmed;
      }
    }

    if (isExample && Array.isArray(slide.interaction.listItems) && slide.interaction.listItems.length > 0) {
      const firstItem = slide.interaction.listItems[0];
      const cleanEx = trimmed.replace(/^(?:examples?|models?|samples?|demos?|e\.g\.|for example)\b[:\s]*/i, '').trim().toLowerCase();
      if (firstItem && !firstItem.isExample) {
        const promptLower = (firstItem.prompt || '').toLowerCase();
        if (cleanEx && (promptLower.includes(cleanEx) || cleanEx.includes(promptLower))) {
          firstItem.isExample = true;
        }
      }
    }
  }

  if (!slide.subtitle && !isExample) {
    slide.subtitle = trimmed;
  }
}

/**
 * Validates raw model output strictly against canonical SlideSchema.
 * Throws explicit SchemaValidationError if validation fails.
 */
export function validateAndParseSlides(rawJsonText: string): Slide[] {
  const cleanJson = rawJsonText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  let parsedJson: any;
  try {
    parsedJson = JSON.parse(cleanJson);
  } catch (err: any) {
    throw new SchemaValidationError(`El modelo devolvió un JSON con sintaxis inválida: ${err.message}`, [], rawJsonText);
  }

  const rawSlides: any[] = Array.isArray(parsedJson?.slides)
    ? parsedJson.slides
    : Array.isArray(parsedJson)
    ? parsedJson
    : [parsedJson];

  if (rawSlides.length === 0) {
    throw new SchemaValidationError('El modelo devolvió un arreglo vacío de diapositivas', [], parsedJson);
  }

  const validatedSlides: Slide[] = [];

  for (let idx = 0; idx < rawSlides.length; idx++) {
    const rawSlide = rawSlides[idx];
    if (!rawSlide || typeof rawSlide !== 'object') {
      throw new SchemaValidationError(`La diapositiva en el índice ${idx} no es un objeto válido`, [], rawSlide);
    }

    if (!rawSlide.id) {
      rawSlide.id = `slide-${Date.now()}-${idx}`;
    }

    rawSlide.referenceContent = sanitizeReferenceContent(rawSlide.referenceContent, idx);

    // Harvest / Unify contextual narrative text (contextBody)
    const rawContextBody =
      rawSlide.contextBody ||
      rawSlide.referenceContent?.body ||
      (rawSlide.referenceContent?.type === 'text' ? rawSlide.referenceContent.content : undefined) ||
      undefined;

    if (rawContextBody && typeof rawContextBody === 'string' && rawContextBody.trim()) {
      rawSlide.contextBody = rawContextBody.trim();
      if (
        rawSlide.referenceContent &&
        (rawSlide.referenceContent.type === 'reference_table' || rawSlide.referenceContent.type === 'table_reference') &&
        !rawSlide.referenceContent.body
      ) {
        rawSlide.referenceContent.body = rawSlide.contextBody;
      }
    }

    if (rawSlide.interaction && typeof rawSlide.interaction === 'object') {
      if (!rawSlide.interaction.id) {
        rawSlide.interaction.id = `int-${Date.now()}-${idx}`;
      }

      // Regla de Detección Universal: preguntas alternativas/disyuntivas ("... A or B?") clasificadas erróneamente como writing
      if (rawSlide.interaction.type === 'writing') {
        const writing = rawSlide.interaction as any;

        // Criterio de Exclusión Incondicional: Si ya cuenta con rúbricas o parámetros de redacción auténtica, NUNCA mutar
        const hasWritingRubricOrGuidelines =
          (Array.isArray(writing.guidelines) && writing.guidelines.length > 0) ||
          (typeof writing.minWords === 'number' && writing.minWords > 0) ||
          (typeof writing.maxWords === 'number' && writing.maxWords > 0) ||
          Boolean(writing.evaluationRubric) ||
          Boolean(writing.criteria);

        if (!hasWritingRubricOrGuidelines) {
          const candidateTexts = [
            writing.prompt,
            writing.instruction,
          ].filter(Boolean);

          let disjunctive: ReturnType<typeof extractDisjunctiveAlternatives> = null;
          for (const txt of candidateTexts) {
            disjunctive = extractDisjunctiveAlternatives(txt);
            if (disjunctive) break;
          }

          if (disjunctive) {
            const rawExpected = (
              writing.expectedAnswer ||
              writing.correctAnswer ||
              ''
            )
              .toLowerCase()
              .trim();
            const isB = rawExpected && (rawExpected === disjunctive.options[1] || rawExpected.includes(disjunctive.options[1]));

            rawSlide.interaction = {
              id: rawSlide.interaction.id || `int-${Date.now()}-${idx}`,
              type: 'selection',
              instruction:
                writing.instruction ||
                rawSlide.subtitle ||
                rawSlide.title ||
                'Choose the correct answer:',
              verificationAudioUrl: writing.verificationAudioUrl,
              audioLabel: writing.audioLabel,
              followUpPrompt: writing.followUpPrompt,
              questions: [
                {
                  id: `q-${Date.now()}-${idx}`,
                  prompt: disjunctive.prompt,
                  question: disjunctive.prompt,
                  mode: 'single_choice',
                  options: disjunctive.options.map((opt, oIdx) => ({
                    id: `opt-${oIdx + 1}`,
                    text: opt,
                    isCorrect: isB ? oIdx === 1 : oIdx === 0,
                  })),
                },
              ],
            };
          }
        }
      }

      // Directiva Ontológica: Cajas teóricas y reglas explicativas puras no deben degradarse a writing
      if (rawSlide.interaction && rawSlide.interaction.type === 'writing') {
        const writing = rawSlide.interaction as any;
        const scan = `${writing.prompt || ''} ${writing.instruction || ''} ${rawSlide.title || ''} ${rawSlide.subtitle || ''}`.toLowerCase();
        
        // Detectar si pide un resumen artificial de reglas o es un encabezado teórico sin práctica
        const isSyntheticSummary = /\b(?:summariz|summary|summarise|write a summary|explain the rules|summarize the main rules|what did you understand)\b/i.test(scan);
        const isPureTheoryBox = /\b(?:grammar focus|language summary|real world|rule box|grammar reference|pronunciation note|grammar rules)\b/i.test(scan) &&
          (!Array.isArray(writing.guidelines) || writing.guidelines.length === 0 || !writing.minWords);

        if (isSyntheticSummary || isPureTheoryBox) {
          rawSlide.interaction = null;
          rawSlide.isGraded = false;
          if (!rawSlide.referenceContent) {
            const isPromptDirective = /\b(?:summariz|summary|summarise|write a summary|explain the rules|summarize the main rules|what did you understand)\b/i.test(writing.prompt || '');
            const isInstructionDirective = /\b(?:summariz|summary|summarise|write a summary|explain the rules|summarize the main rules|what did you understand)\b/i.test(writing.instruction || '');

            const rawBody = (writing.prompt && !isPromptDirective)
              ? writing.prompt
              : (writing.instruction && !isInstructionDirective)
              ? writing.instruction
              : (writing.prompt || writing.instruction || rawSlide.subtitle || rawSlide.title || 'Grammar Reference');

            rawSlide.referenceContent = {
              id: `ref-theory-${Date.now()}-${idx}`,
              type: 'text',
              category: 'grammar_note',
              title: rawSlide.title || 'Grammar Reference',
              content: rawBody,
            };
          }
          rawSlide.layout = 'single_column';
        }
      }

      if (rawSlide.interaction && rawSlide.interaction.type === 'selection' && Array.isArray(rawSlide.interaction.questions)) {
        const refText =
          rawSlide.referenceContent?.type === 'text'
            ? rawSlide.referenceContent.content
            : rawSlide.referenceContent?.type === 'media'
            ? rawSlide.referenceContent.transcript
            : '';

        for (const q of rawSlide.interaction.questions) {
          if (q && typeof q === 'object') {
            const statement = q.prompt || q.question || '';
            const cleanedStatement = cleanSelectionPrompt(statement, refText);
            q.prompt = cleanedStatement;
            q.question = cleanedStatement;

            if (!Array.isArray(q.options) || q.options.length === 0) {
              const disj = extractDisjunctiveAlternatives(cleanedStatement);
              if (disj) {
                q.options = disj.options.map((opt, oIdx) => ({
                  id: `opt-${oIdx + 1}`,
                  text: opt,
                  isCorrect: oIdx === 0,
                }));
              }
            }
          }
        }

        // Cohesión de Concept Checking Questions globales:
        // Si hay múltiples preguntas idénticas o redundantes sobre la misma regla general
        if (rawSlide.interaction.questions.length > 1) {
          const first = rawSlide.interaction.questions[0];
          const firstPrompt = (first.prompt || first.question || '').toLowerCase().trim();
          const disjFirst = extractDisjunctiveAlternatives(firstPrompt);

          const isRedundantGlobalCCQ = rawSlide.interaction.questions.every((q: any) => {
            const p = (q.prompt || q.question || '').toLowerCase().trim();
            if (p === firstPrompt) return true;
            if (disjFirst) {
              const disjP = extractDisjunctiveAlternatives(p);
              if (disjP && disjP.options.slice().sort().join('|') === disjFirst.options.slice().sort().join('|')) {
                return true;
              }
            }
            return false;
          });

          if (isRedundantGlobalCCQ) {
            rawSlide.interaction.questions = [first];
          }
        }
      }

      // Normalizar allowMultiple para interaction: selection
      if (rawSlide.interaction && rawSlide.interaction.type === 'selection') {
        if (typeof rawSlide.interaction.allowMultiple !== 'boolean') {
          const isMultiDirective = /select\s+all\b|which\s+(?:of\s+these|appear|sentences|statements|phrases)\b|find\s+the\s+(?:target|responses|phrases)\b|tick\s+(?:all|the\s+phrases|the\s+sentences)\b/i.test(
            `${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${rawSlide.interaction.instruction || ''}`
          );
          rawSlide.interaction.allowMultiple = isMultiDirective;
        }
      }

      // Normalizar layoutMode para input_fields si fue omitido por el modelo
      if (rawSlide.interaction && rawSlide.interaction.type === 'input_fields') {
        if (!rawSlide.interaction.layoutMode) {
          if (Array.isArray(rawSlide.interaction.tableRows) && rawSlide.interaction.tableRows.length > 0) {
            rawSlide.interaction.layoutMode = 'table';
          } else if (rawSlide.interaction.paragraphTemplate) {
            rawSlide.interaction.layoutMode = 'inline_paragraph';
          } else {
            rawSlide.interaction.layoutMode = 'list';
          }
        }

        if (Array.isArray(rawSlide.interaction.listItems)) {
          for (const item of rawSlide.interaction.listItems) {
            if (item && typeof item === 'object') {
              if (item.expectedAnswer && (!Array.isArray(item.acceptedAnswers) || item.acceptedAnswers.length === 0)) {
                item.acceptedAnswers = [item.expectedAnswer];
              }
            }
          }
        }
      }

      // En ejercicios de tipo tabla/cuadrícula interactiva:
      if (
        rawSlide.interaction &&
        rawSlide.interaction.type === 'input_fields' &&
        rawSlide.interaction.layoutMode === 'table' &&
        Array.isArray(rawSlide.interaction.tableRows)
      ) {
        if (rawSlide.referenceContent) {
          // Descartar tablas duplicadas o desacopladas indebidamente,
          // PERO preservar cualquier texto perimetral explicativo o notas marginales en 'referenceContent.body'
          if (
            rawSlide.referenceContent.type === 'table_reference' ||
            rawSlide.referenceContent.type === 'reference_table'
          ) {
            const perimetralText =
              rawSlide.referenceContent.body ||
              rawSlide.referenceContent.caption ||
              rawSlide.referenceContent.instruction ||
              rawSlide.contextBody ||
              '';
            if (perimetralText.trim()) {
              rawSlide.contextBody = perimetralText.trim();
              rawSlide.referenceContent = {
                id: `ref-perimetral-${Date.now()}-${idx}`,
                type: 'text',
                category: 'grammar_note',
                title: rawSlide.referenceContent.title || 'Grammar Note',
                content: perimetralText.trim(),
                body: perimetralText.trim(),
              };
            } else {
              rawSlide.referenceContent = null;
            }
          } else if (
            rawSlide.referenceContent.type === 'text' &&
            (typeof rawSlide.referenceContent.content === 'string' || typeof rawSlide.referenceContent.body === 'string')
          ) {
            // Verificar si el texto en referenceContent corresponde estrictamente a celdas de ejemplo copiadas de la tabla
            const refTextToScan = (rawSlide.referenceContent.content || rawSlide.referenceContent.body || '').trim();
            const refLines = refTextToScan
              .split('\n')
              .map((l: string) => l.trim().toLowerCase())
              .filter((l: string) => l.length > 2);

            const tableTexts: string[] = [];
            if (Array.isArray(rawSlide.interaction.tableHeaders)) {
              rawSlide.interaction.tableHeaders.forEach((h: any) => {
                if (typeof h === 'string' && h.trim()) tableTexts.push(h.trim().toLowerCase());
              });
            }
            rawSlide.interaction.tableRows.forEach((row: any) => {
              if (Array.isArray(row)) {
                row.forEach((cell: any) => {
                  if (typeof cell === 'string' && cell.trim()) tableTexts.push(cell.trim().toLowerCase());
                  else if (cell && typeof cell === 'object') {
                    if (cell.text && String(cell.text).trim()) tableTexts.push(String(cell.text).trim().toLowerCase());
                    if (cell.expectedAnswer && String(cell.expectedAnswer).trim()) tableTexts.push(String(cell.expectedAnswer).trim().toLowerCase());
                  }
                });
              }
            });

            const allLinesInTable =
              refLines.length > 0 &&
              refLines.every((line: string) =>
                tableTexts.some((t: string) => t.includes(line) || line.includes(t))
              );

            // Solo descartar si el texto de referencia NO aporta nada perimetral y era meramente copia de celdas
            if (allLinesInTable) {
              rawSlide.referenceContent = null;
              rawSlide.contextBody = undefined;
            }
          }
        }
      }

      // Consistencia semántica de estado no interactivo:
      // Si un bloque no posee elementos de entrada activos (cero inputs, cero blanks, celdas 100% informativas):
      if (rawSlide.interaction) {
        let isZeroInteractive = false;
        if (rawSlide.interaction.type === 'input_fields') {
          if (rawSlide.interaction.layoutMode === 'table') {
            const hasInteractiveCells = Array.isArray(rawSlide.interaction.tableRows) && rawSlide.interaction.tableRows.some((row: any) =>
              Array.isArray(row) && row.some((cell: any) => cell && typeof cell === 'object' && cell.isInput === true)
            );
            if (!hasInteractiveCells) isZeroInteractive = true;
          } else {
            const hasInteractiveItems = Array.isArray(rawSlide.interaction.listItems) && rawSlide.interaction.listItems.some((item: any) =>
              !item.isExample && Boolean(item.expectedAnswer?.trim() || (Array.isArray(item.acceptedAnswers) && item.acceptedAnswers.length > 0))
            );
            const hasParagraphInputs = Boolean(rawSlide.interaction.paragraphTemplate && Object.keys(rawSlide.interaction.paragraphInputs || {}).length > 0);
            if (!hasInteractiveItems && !hasParagraphInputs) isZeroInteractive = true;
          }
        } else if (rawSlide.interaction.type === 'selection') {
          const hasQuestions = (Array.isArray(rawSlide.interaction.questions) && rawSlide.interaction.questions.length > 0) ||
            (Array.isArray(rawSlide.interaction.options) && rawSlide.interaction.options.length > 0);
          if (!hasQuestions) isZeroInteractive = true;
        } else if (rawSlide.interaction.type === 'buckets_matching') {
          const hasTokens = (Array.isArray(rawSlide.interaction.tokens) && rawSlide.interaction.tokens.length > 0) ||
            (Array.isArray(rawSlide.interaction.sourceItems) && rawSlide.interaction.sourceItems.length > 0);
          if (!hasTokens) isZeroInteractive = true;
        } else if (rawSlide.interaction.type === 'sequence') {
          const hasItems = Array.isArray(rawSlide.interaction.items) && rawSlide.interaction.items.length > 0;
          if (!hasItems) isZeroInteractive = true;
        }

        if (isZeroInteractive) {
          rawSlide.isGraded = false;
          if (rawSlide.interaction.instruction) {
            const normalized = normalizeNonInteractiveInstruction(rawSlide.interaction.instruction);
            if (!rawSlide.subtitle || rawSlide.subtitle === rawSlide.interaction.instruction) {
              rawSlide.subtitle = normalized;
            }
          }
          if (rawSlide.subtitle) {
            rawSlide.subtitle = normalizeNonInteractiveInstruction(rawSlide.subtitle);
          }
          if (!rawSlide.referenceContent) {
            if (rawSlide.interaction.type === 'input_fields' && rawSlide.interaction.layoutMode === 'table') {
              rawSlide.referenceContent = {
                id: `ref-tbl-${Date.now()}-${idx}`,
                type: 'table_reference',
                title: rawSlide.title || 'Table Reference',
                headers: rawSlide.interaction.tableHeaders || [],
                rows: (rawSlide.interaction.tableRows || []).map((row: any[]) =>
                  row.map((cell: any) => (typeof cell === 'string' ? cell : cell?.text || ''))
                ),
              };
            } else if (rawSlide.interaction.type === 'input_fields' && Array.isArray(rawSlide.interaction.listItems)) {
              const textLines = rawSlide.interaction.listItems.map((it: any) => it.prompt || it.text || '').filter(Boolean).join('\n');
              rawSlide.referenceContent = {
                id: `ref-txt-${Date.now()}-${idx}`,
                type: 'text',
                category: 'grammar_note',
                title: rawSlide.title || 'Reference Note',
                content: textLines,
                body: textLines,
              };
            }
          }
          rawSlide.interaction = null;
          rawSlide.layout = 'single_column';
        }
      }
    } else {
      rawSlide.interaction = null;
    }

    // Detección y normalización ontológica de metadatos espurios en referenceContent:
    // Las oraciones modelo ("Example"), instrucciones y demostraciones pedagógicas resueltas
    // son metadatos de la actividad: DEBEN residir dentro del encabezado ('instruction' o el primer ítem con isExample),
    // NUNCA separarse como si fueran un bloque de lectura independiente ('referenceContent').
    if (rawSlide.referenceContent && isSpuriousReferenceMetadata(rawSlide.referenceContent, rawSlide.interaction, rawSlide.subtitle, rawSlide.title)) {
      const spuriousText = (rawSlide.referenceContent.body || rawSlide.referenceContent.content || '').trim();
      foldSpuriousMetadata(spuriousText, rawSlide);
      rawSlide.referenceContent = null;
      if (rawSlide.contextBody && (rawSlide.contextBody === spuriousText || spuriousText.includes(rawSlide.contextBody))) {
        rawSlide.contextBody = undefined;
      }
    }

    if (!rawSlide.interaction && rawSlide.subtitle) {
      rawSlide.subtitle = normalizeNonInteractiveInstruction(rawSlide.subtitle);
    }

    if (!rawSlide.referenceContent && rawSlide.contextBody && rawSlide.interaction) {
      if (isSpuriousReferenceMetadata({ type: 'text', content: rawSlide.contextBody }, rawSlide.interaction, rawSlide.subtitle, rawSlide.title)) {
        foldSpuriousMetadata(rawSlide.contextBody, rawSlide);
        rawSlide.contextBody = undefined;
      } else {
        rawSlide.referenceContent = {
          id: `ref-ctx-${Date.now()}-${idx}`,
          type: 'text',
          category: 'grammar_note',
          title: rawSlide.title || 'Reference Note',
          content: rawSlide.contextBody,
          body: rawSlide.contextBody,
        };
      }
    }

    // Principio ontológico de selección de Layout:
    // - 'split_50_50': Se utiliza ÚNICAMENTE cuando existe un texto continuo de consulta autónomo
    //   (un artículo, un audioscript, un diálogo completo, o tabla de consulta) que el estudiante
    //   necesita leer a la izquierda mientras interactúa a la derecha.
    // - 'single_column': Es el layout por defecto para cualquier ejercicio de oraciones, listas o
    //   reactivos donde el contenido sea autosuficiente, o cuando no hay interacción activa.
    rawSlide.layout = (rawSlide.referenceContent && rawSlide.interaction) ? 'split_50_50' : 'single_column';

    // Principio Universal de Densidad Máxima por Diapositiva (Slide Ergonomics & Cognitive Load):
    // Cuando una actividad interactiva se basa en un texto o diálogo de referencia (layout split_50_50):
    // - El texto de soporte en referenceContent / contextBody se mantiene íntegro al 100%.
    // - El panel interactivo se delimita a una muestra focalizada y representativa (máximo 8 reactivos)
    //   para evitar el desbordamiento vertical y la saturación cognitiva del estudiante.
    const hasReferenceSupport = Boolean(rawSlide.referenceContent || rawSlide.contextBody);
    if (hasReferenceSupport && rawSlide.interaction) {
      const MAX_ERGONOMIC_ITEMS = 8;
      if (rawSlide.interaction.type === 'input_fields' && Array.isArray(rawSlide.interaction.listItems)) {
        if (rawSlide.interaction.listItems.length > MAX_ERGONOMIC_ITEMS) {
          rawSlide.interaction.listItems = rawSlide.interaction.listItems.slice(0, MAX_ERGONOMIC_ITEMS);
        }
      } else if (rawSlide.interaction.type === 'selection') {
        if (Array.isArray(rawSlide.interaction.questions) && rawSlide.interaction.questions.length > MAX_ERGONOMIC_ITEMS) {
          rawSlide.interaction.questions = rawSlide.interaction.questions.slice(0, MAX_ERGONOMIC_ITEMS);
        }
        if (Array.isArray(rawSlide.interaction.options) && rawSlide.interaction.options.length > MAX_ERGONOMIC_ITEMS) {
          rawSlide.interaction.options = rawSlide.interaction.options.slice(0, MAX_ERGONOMIC_ITEMS);
        }
      } else if (rawSlide.interaction.type === 'buckets_matching') {
        if (Array.isArray(rawSlide.interaction.tokens) && rawSlide.interaction.tokens.length > MAX_ERGONOMIC_ITEMS) {
          rawSlide.interaction.tokens = rawSlide.interaction.tokens.slice(0, MAX_ERGONOMIC_ITEMS);
        }
        if (Array.isArray(rawSlide.interaction.sourceItems) && rawSlide.interaction.sourceItems.length > MAX_ERGONOMIC_ITEMS) {
          rawSlide.interaction.sourceItems = rawSlide.interaction.sourceItems.slice(0, MAX_ERGONOMIC_ITEMS);
        }
      } else if (rawSlide.interaction.type === 'sequence') {
        if (Array.isArray(rawSlide.interaction.items) && rawSlide.interaction.items.length > MAX_ERGONOMIC_ITEMS) {
          rawSlide.interaction.items = rawSlide.interaction.items.slice(0, MAX_ERGONOMIC_ITEMS);
        }
      }
    }

    const parseResult = SlideSchema.safeParse(rawSlide);

    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      const issuesFormatted = issues.map((iss) => `• [${iss.path.join('.')}]: ${iss.message}`).join('\n');
      console.error(`[digitizeBook] Error formal de validación SlideSchema en diapositiva ${idx}:\n`, issuesFormatted, rawSlide);

      throw new SchemaValidationError(
        `Error de validación formal de Slide: el modelo generó una estructura incompatible:\n${issuesFormatted}`,
        issues,
        rawSlide
      );
    }

    validatedSlides.push(parseResult.data);
  }

  console.log(
    '[digitizeBook] Raw parsed slides count:',
    validatedSlides.length,
    validatedSlides.map((s) => s.title || (s.interaction as any)?.instruction || s.subtitle)
  );

  return validatedSlides;
}

/**
 * Wraps a fully validated Slide into an ExtractedBlock for smooth transitional compatibility.
 */
export function slideToExtractedBlock(
  slide: Slide,
  primaryImage: string,
  imageList: string[]
): ExtractedBlock & Slide {
  const interaction = slide.interaction;
  const ref = slide.referenceContent;

  const detectedType: ExtractedBlock['detectedType'] =
    interaction?.type === 'buckets_matching'
      ? 'vocabulary'
      : ref?.type === 'reference_table' || ref?.type === 'table_reference' || (interaction?.type === 'input_fields' && interaction.layoutMode === 'table')
      ? 'table'
      : interaction?.type === 'writing' || (!interaction && Boolean(ref))
      ? 'paragraph'
      : 'numbered_list';

  const contextBody =
    slide.contextBody ||
    (ref && 'body' in ref ? (ref as any).body : undefined) ||
    (ref?.type === 'text' ? ref.content : undefined) ||
    slide.notes ||
    undefined;

  // Collect all textual elements agnostically to preserve both structured items and surrounding narrative
  const textParts: string[] = [
    slide.title,
    slide.subtitle,
    ref?.title,
    contextBody,
    interaction?.instruction,
  ].filter(Boolean) as string[];

  if (ref?.type === 'text' && ref.content && ref.content !== contextBody) {
    textParts.push(ref.content);
  }
  if (ref && 'columns' in ref && Array.isArray((ref as any).columns)) {
    (ref as any).columns.forEach((col: any) => {
      if (col.header) textParts.push(col.header);
      if (Array.isArray(col.items)) textParts.push(...col.items);
    });
  }
  if (ref && 'headers' in ref && Array.isArray((ref as any).headers)) {
    textParts.push(...(ref as any).headers);
  }
  if (ref && 'rows' in ref && Array.isArray((ref as any).rows)) {
    (ref as any).rows.forEach((row: any[]) => {
      if (Array.isArray(row)) textParts.push(...row.filter(Boolean));
    });
  }
  if (interaction?.type === 'input_fields') {
    if (Array.isArray(interaction.listItems)) {
      interaction.listItems.forEach((it) => {
        if (it.prompt) textParts.push(it.prompt);
        if (it.expectedAnswer) textParts.push(it.expectedAnswer);
      });
    }
    if (Array.isArray(interaction.tableHeaders)) {
      textParts.push(...interaction.tableHeaders);
    }
    if (Array.isArray(interaction.tableRows)) {
      interaction.tableRows.forEach((row) => {
        if (Array.isArray(row)) {
          row.forEach((cell: any) => {
            if (cell?.text) textParts.push(cell.text);
            if (cell?.expectedAnswer) textParts.push(cell.expectedAnswer);
          });
        }
      });
    }
  }

  const rawText = Array.from(new Set(textParts)).filter(Boolean).join('\n\n');

  return {
    ...slide,
    rawText: rawText || slide.title || '',
    detectedType,
    confidence: 1.0,
    sourceImageSnippetUrl: primaryImage || undefined,
    sourceImages: imageList.length > 0 ? imageList : undefined,
    contextBody,
    parsedData: {
      ...slide,
      title: slide.title,
      instruction: interaction?.instruction || slide.subtitle || '',
      isGraded: slide.isGraded !== undefined ? slide.isGraded : true,
      contextBody,
      referenceContent: ref?.type === 'text' ? ref.content : (contextBody || undefined),
      content: contextBody || (ref?.type === 'text' ? ref.content : undefined),
      interactionType: interaction?.type === 'input_fields' ? 'fill_blanks' : interaction?.type,
      items: interaction?.type === 'input_fields' ? interaction.listItems : undefined,
      allowMultiple: interaction?.type === 'selection' ? Boolean(interaction.allowMultiple) : undefined,
    },
  };
}

/**
 * Builds the strict, unambiguous pedagogical System Prompt enforcing native Slide structured outputs.
 */
function buildExtractionPrompt(imageCount: number, forcedTargetType?: ForcedTargetArchetype): string {
  return `You are an expert ELT (English Language Teaching) author, textbook editor, and master teacher.
You must analyze the provided ${imageCount} clipping(s) and emit directly a JSON object containing an array of "slides" matching the canonical ELT Slide schema.

ROOT RESPONSE FORMAT:
{
  "slides": [
    {
      "id": "slide-1",
      "title": "Concise formal activity title",
      "subtitle": "Pedagogical directive or subtitle",
      "layout": "split_50_50" or "single_column",
      "isGraded": true or false,
      "contextBody": "Optional literal explanatory narrative, grammar rules, tips, or bullet points accompanying the activity",
      "referenceContent": null or { ...ReferenceBlock... },
      "interaction": null or { ...InteractionBlock... }
    }
  ]
}

MULTI-SLIDE SEGMENTATION & CROSS-REFERENCING DIRECTIVES:
1. MULTI-SLIDE SEGMENTATION INVARIANT:
   - When the input image contains TWO OR MORE pedagogically independent and delimited activities (e.g., sequential numbering or labeling such as "1", "2" or "a", "b", or separate exercise headers/instructions):
     * The model MUST emit one distinct element in the "slides" array for EACH identified activity (e.g. [slide-1, slide-2, ...]).
     * It is STRICTLY FORBIDDEN to ignore visible activities or to arbitrarily merge separate, independent exercises into a single slide.
2. CROSS-REFERENCING RESOLUTION INVARIANT:
   - When an activity includes instructions or prompts that explicitly reference another section or exercise visible in the clipping (e.g., "in 1", "from the box above", "with the verbs above", "from the dialogue in 2a"):
     * The referenced information MUST act as active resolution context to exhaustively populate all candidate options, categories (buckets), tokens, or answer pairs of the dependent activity.
     * In the slide of the dependent activity, NEVER guess, hallucinate, or omit referenced elements that are clearly present in the capture; extract and populate them faithfully and exhaustively.
3. PRINCIPIO UNIVERSAL DE DENSIDAD MÁXIMA Y ERGONOMÍA (SLIDE ERGONOMICS & COGNITIVE LOAD):
   - Al digitalizar cualquier actividad interactiva basada en un texto o diálogo de referencia:
     * INTEGRIDAD DEL CONTENIDO DE SOPORTE: El texto de lectura o soporte DEBE mantenerse íntegro en el contenedor de referencia ('contextBody' / 'referenceContent'). Queda estrictamente prohibido recortar, resumir o mutilar el material de lectura de apoyo.
     * MUESTRA FOCALIZADA Y REPRESENTATIVA: El panel interactivo (preguntas, reactivos, selecciones o huecos) DEBE ser una muestra focalizada y representativa del objetivo pedagógico (máximo 4 a 8 reactivos clave), nunca un despiece exhaustivo línea por línea del texto de apoyo.
     * PROHIBICIÓN DE BATERÍAS MASIVAS: Queda estrictamente prohibido generar baterías masivas de reactivos que desborden visualmente la diapositiva o saturen el layout interactivo en dos columnas densas. Priorizar la síntesis pedagógica sobre la exhaustividad mecánica.

CANONICAL ARCHETYPES:
1. "referenceContent" (Passive consultation material) & ONTOLOGICAL LAYOUT SELECTION:
   - PRINCIPIO ONTOLÓGICO DE SELECCIÓN DE LAYOUT:
     * 'split_50_50': Se utiliza ÚNICAMENTE cuando existe un texto continuo de consulta autónomo (un artículo, un audioscript, un diálogo completo, o una tabla de consulta) que el estudiante necesita leer a la izquierda mientras interactúa a la derecha.
     * 'single_column': Es el layout por defecto para cualquier ejercicio de oraciones, listas o reactivos donde el contenido sea autosuficiente, así como para diapositivas puramente expositivas/teóricas sin elementos interactivos.
   - MODELADO DE EJEMPLOS E INSTRUCCIONES (METADATOS vs CONTENIDO AUTÓNOMO):
     * Las oraciones modelo ("Example"), las instrucciones y las demostraciones pedagógicas resueltas son metadatos de la actividad: DEBEN residir dentro del encabezado ('instruction', 'subtitle' o dentro del primer ítem con su campo de ejemplo resuelto isExample: true), NUNCA separarse como si fueran un bloque de lectura independiente ('referenceContent').
     * Queda estrictamente prohibido generar un bloque 'referenceContent' para alojar únicamente una consigna o un ejemplo de una oración. En tales casos, 'referenceContent' DEBE ser estrictamente null y el layout 'single_column'.
   - CUÁNDO NO GENERAR 'referenceContent' (EJERCICIOS AUTOSUFICIENTES):
     * Celdas de ejemplo dentro de tablas o diagramas: Si una tabla, cuadro o lista contiene ejemplos ya resueltos (e.g. en cursiva, azul o como fila modelo), esos valores pertenecen exclusivamente a la estructura interna del ejercicio (como celdas fijas no editables con isInput: false o isExample: true). NUNCA deben extraerse ni aislarse como 'referenceContent'.
     * En ejercicios de tipo tabla/cuadrícula donde todo el contenido está dentro de la misma tabla, el diseño de la diapositiva debe ser de una sola columna ('single_column') sin panel de lectura lateral ('referenceContent: null').
     * Ejercicios de oraciones aisladas, preguntas directas o listas de reactivos donde cada reactivo contiene toda la información necesaria: 'referenceContent' DEBE ser estrictamente null y layout 'single_column'.
   - ZERO TABLE DUPLICATION: If the activity is purely an interactive table (interaction.layoutMode: "table"), DO NOT duplicate the table inside referenceContent. In purely interactive table activities, referenceContent MUST be strictly null and layout MUST be "single_column".
   - CONTINUOUS READING TEXTS vs COLUMNS:
     * Use type: "text" for all reading articles, narrative stories, dialogues, or continuous texts divided into paragraphs. Use standard double line breaks (\n\n) between paragraphs. NEVER fragment a continuous reading text into independent vertical columns (even if formatted in newspaper columns on the original page!).
     * Use type: "reference_table" (columns) ONLY when the printed material consists of comparative data or parallel tabular lists organized in vertical categories (e.g. vocabulary categories, preposition lists).
   - CONSERVACIÓN INTEGRAL Y COMPOSICIÓN COEXISTENTE DE TEXTO PERIMETRAL:
     * Whenever a clipping contains structured elements (tables, grids, question lists) alongside explanatory paragraphs, rules, bullet points, or TIPS, the model MUST extract the structured element into its corresponding primitive AND preserve 100% of the surrounding narrative/rules into 'referenceContent.body' (or 'contextBody'). It is strictly prohibited to discard one in favor of the other.
     * En diapositivas con texto explicativo perimetral Y ejercicio estructurado interactivo, el layout DEBE ser 'split_50_50'.
   - CONSISTENCIA SEMÁNTICA DE ESTADO NO INTERACTIVO (CERO ELEMENTOS ACTIVOS):
     * Si un bloque o diapositiva no posee elementos de entrada activos (cero inputs, cero blanks, celdas 100% informativas con isInput: false):
       - La instrucción o enunciado ("instruction" / "title" / "subtitle") DEBE reflejar propósito de consulta o lectura (e.g. "Review...", "Read...", "Study..."), evitando rigurosamente verbos de acción resolutiva ("Complete...", "Fill in...", "Choose...").
       - Debe emitirse con 'isGraded: false' e 'interaction: null' para que el lienzo de presentación no active controles de envío de respuestas.
       - Si contiene una tabla o cuadro puramente informativo, estructurarlo en 'referenceContent' (type: 'reference_table' o 'table_reference') y layout 'single_column'.
   - STRICT FIDELITY: Strictly transcribe literal text. NEVER generate synthetic summaries or pedagogical explanations.

2. "interaction" (Active evaluated exercise):
   - "input_fields": For fill-in-the-blanks, Cloze sentences, or 2D fill-in grids (layoutMode: "table").
     * STRICT PROHIBITION AGAINST DEGRADING CLOSED SELECTION: It is STRICTLY FORBIDDEN to degrade closed-selection exercises (e.g. options separated by slashes "was / were", bold contrasting words, or instructions like "Circle/Choose the correct word/number") into free-text input fields ("input_fields"). Never fragment sentences artificially or force the student to type what they were only meant to select!
     * MISSING LETTERS / VOWELS EXERCISES (e.g. "Write the vowels", "Fill in the missing letters"):
       - NO MICROSCOPIC LETTER FRAGMENTATION: DO NOT fragment words into multiple tiny single-letter inputs (e.g. NEVER generate separate inputs for each missing letter in "v_ll_yb_ll"). Each interactive input field MUST correspond to the whole completed word that the student writes (expectedAnswer: "volleyball"). The prompt or prefix can show the partial word pattern (e.g. "v_ll_yb_ll").
       - PRESERVE COLLOCATION / SENTENCE STRUCTURE: Keep the root verb or phrase (e.g. "play", "go", "go to") as a clear textual prefix or prompt of the item.
       - ZERO DUPLICATION / SELF-SUFFICIENT: This direct vocabulary task is completely self-contained; referenceContent MUST be strictly null and layout MUST be "single_column".
     * MATCHING VIA INPUT FIELDS: If an exercise asking to match options/headings to sections or sentences is modeled using input_fields, it MANDATORILY MUST include the "wordBank" containing the exact printed list of options/headings to match.
     * NEVER EMIT ORPHAN BLANKS: Never emit empty fill-in inputs without providing the printed bank of candidate options/headings in "wordBank" or as matching tokens.
     * TABULAR QUESTIONNAIRES & FILLABLE TABLES: When the clipping presents a printed table where one or more columns or cells are blank for the student to write answers, names, or values (e.g. peer surveys, interviews, questionnaire tables with columns like "Question", "Your answer", "Partner's answer"):
       - MUST be classified as interaction.type: "input_fields" with layoutMode: "table". NEVER classify it as "writing" with a passive reference table!
       - COLUMN INTEGRITY: All columns that form part of the printed table grid in the image MUST be included inside tableHeaders and tableRows of the interaction. It is STRICTLY PROHIBITED to dismantle, split, or detach any columns of the table (such as note columns, "partner's notes", or "follow-up questions" columns) to send them as a separate referenceContent block!
       - ZERO TABLE DUPLICATION / SINGLE TABLE: If the clipping contains a single integral table, referenceContent MUST be strictly null and layout MUST be "single_column" with all columns unified into the same interactive table. DO NOT duplicate or copy the table inside referenceContent!
       - CELDAS DE EJEMPLO DENTRO DE TABLAS O DIAGRAMAS: Si una tabla, cuadro o lista contiene ejemplos ya resueltos (e.g. en cursiva, azul o como fila modelo), esos valores pertenecen exclusivamente a la estructura interna del ejercicio (como celdas fijas no editables con isInput: false o isExample: true). NUNCA deben extraerse ni aislarse como 'referenceContent'.
       - EJERCICIOS AUTOSUFICIENTES DE TABLA/CUADRÍCULA: En ejercicios donde todo el contenido está dentro de la misma tabla, el diseño de la diapositiva debe ser de una sola columna ('single_column') sin panel de lectura lateral ('referenceContent: null').
       - Cells with printed prompt/query text MUST have isInput: false.
       - Cells for student input/blank columns MUST have isInput: true, with expectedAnswer and acceptedAnswers.
   - "selection": For choosing between discrete candidate options:
     * CLOSED-SELECTION EXERCISES (e.g. options separated by slashes "was / were", bold contrasting words, or instructions like "Circle/Choose the correct word/number"):
       - The interaction MUST be typed as interaction.type: "selection".
       - Model as questions[] (quiz mode) where each sentence/item is a question with mode: "single_choice" (or "dropdown").
       - INVARIANT FOR CONTEXTUAL STATEMENTS ({{blank}} PLACEHOLDER):
         When an exercise requires selecting between alternatives embedded inside a sentence or continuous text (demarcated by slashes, parentheses, or bold contrasting words):
         * The field "question" (or "prompt") MUST contain the full complete sentence, replacing the decision point with the formal token {{blank}} (e.g. "Yesterday I {{blank}} at home.").
         * It is STRICTLY FORBIDDEN to include the discrete options or typographical delimiters (such as "was / were", slashes, or brackets) inside "question" / "prompt".
         * The discrete alternatives MUST populate exclusively the "options" array of that question (e.g. options: [{ id: "opt-1", text: "was", isCorrect: true }, { id: "opt-2", text: "were", isCorrect: false }]).
         * If an option already appears marked, circled, or highlighted as an initial pedagogical model (solved example), it MUST be marked with isExample: true (and isCorrect: true). If the question item itself is the example, mark isExample: true on the question item as well.
       - INVARIANT FOR LAYOUT SEGMENTATION:
         If the entirety of the passage or exercise decomposes into the interactive items of the activity, referenceContent MUST be strictly null and layout MUST be "single_column".
     * CHECKLISTS & CANDIDATE SELECTION: When students mark, tick (✓), or choose valid candidates from a single domain ("Tick the phrases", "Which sentences are true?", "Select all that apply"):
       - When a pedagogical directive asks to identify, find, or mark MULTIPLE valid elements that appear in a text or set (e.g. "Select all that apply", "Which of these appear...", "Find the target responses", "Tick the phrases that are true", "Which sentences are mentioned?"):
         * The interaction MUST be emitted with 'allowMultiple: true'.
         * Consolidate candidate options into a single clean list of alternatives (populating flat 'options[]' with 'isCorrect: true' on matching elements and 'isCorrect: false' on distractors), INSTEAD of fragmenting the activity into multiple artificial binary questions!
         * Preserve the full intact text in options[].text without degrading sentences.
       - When an exercise has a single correct answer (e.g. "Choose the correct word", "Circle the correct form"):
         * Emit with 'allowMultiple: false' (default).
     * PROMPT CLEANLINESS & FORBIDDEN COMPLETION TOKENS:
       - It is STRICTLY FORBIDDEN to insert completion tokens or blanks (e.g. '[ ? ]', '{{blank}}', '___') inside the prompt of direct selection questions. The prompt MUST be a direct, clean interrogative sentence or instruction (e.g. "Do these people agree or disagree?", "Which sentence is grammatically accurate?").
       - ZERO PASSAGE/DIALOGUE DUPLICATION: If reading texts, dialogues, or examples are already populated in the reference panel (referenceContent), NEVER duplicate the full dialogue or reading passage inside the "prompt" string of the selection questions. Keep the prompt clean and concise, referencing the panel.
     * GLOBAL CONCEPT CHECKING QUESTIONS (CCQ) COHESION:
       - When a closed exercise evaluates an overarching rule or concept from multiple reading examples (e.g. "Do these people agree or disagree?"):
         * Generate ONE SINGLE unified selection question (options: ["agree", "disagree"]) evaluating the overarching rule and referring to the reading passage/referenceContent.
         * It is STRICTLY FORBIDDEN to duplicate and fragment identical questions for each individual row, speaker, or example line!
     * DISJUNCTIVE / ALTERNATIVE QUESTIONS RULE (e.g. "Do/Is/Are ... [Option A] or [Option B]?"):
       - UNIVERSAL DETECTION RULE FOR 'selection':
         When an interrogative prompt, instruction, or exercise question presents an explicit closed disjunction delimiting the possible candidate answers (e.g. linguistic pattern "Do/Is/Are ... [Option A] or [Option B]?", such as "Do the speakers agree or disagree?", "Is the sentence talking about the past or the present?", "Are the underlined verbs finished or unfinished?"):
         * NEVER classify this interaction as free writing or essay ("writing").
         * The interaction MUST be modeled strictly as interaction.type: "selection" (mode: "single_choice" in questions[]).
         * Extract as candidate options exclusively the discrete alternatives delimited by the disjunction (e.g. options: [{ id: "opt-1", text: "agree", isCorrect: true }, { id: "opt-2", text: "disagree", isCorrect: false }], or ['past', 'present']).
         * Infer the correct option ('correctAnswer' / isCorrect: true) analyzing the data, grammar rules, listening transcript, or contextual examples from the lesson clipping.
   - "buckets_matching": For categorization into buckets OR bijective correspondence between TWO differentiated domains (Column A <-> Column B, "Match words with definitions", "Match sentence halves"):
     * PRESERVE VERBATIM VISUAL IDENTIFIERS: Always preserve literal printed visual identifiers from the textbook (letters "a", "b", "c", numbers "1", "2", "3", or verbatim labels) in tokens and buckets/targetSlots. Do NOT omit them and do NOT invent synthetic names.
     * MATCHING HEADINGS / LABELS TO PARAGRAPHS: When the instruction explicitly directs to match or assign headings, titles, or labels to numbered sections or paragraphs (e.g. "Match headings a-d with paragraphs 1-4", "Match words with definitions"):
       - PREFERRED PRIMITIVE: Model preferably as interaction.type: "buckets_matching", where the paragraphs or section numbers are the targetSlots / buckets (labeled with their literal identifiers, e.g. "Paragraph 1"), and the headings are the tokens / sourceItems to drag or match (preserving their literal letter/text, e.g. "a. Heading title").
       - Alternatively, if modeled as input_fields, it OBLIGATORIAMENTE must include the complete "wordBank" with the exact list of options to match.
       - NEVER emit orphan empty text fields without providing the printed bank of options/headings from the activity.
   - "sequence": For ordering disordered sentences or dialogue lines into chronological sequence.
   - "writing": STRICT RESTRICTION (GENUINELY OPEN TASKS ONLY):
     * Reserve interaction.type: "writing" EXCLUSIVELY for genuinely open-ended communicative or production tasks (personal opinion essays, paragraphs, emails, profiles, or open inquiry questions without finite discrete alternatives in the prompt, such as "Why...", "Describe...", "What do you think about..."). Set isGraded: false.
     * STRICT PROHIBITION: NEVER classify alternative questions with closed binary or finite choices ("... [Option A] or [Option B]?") as "writing". If the prompt contains finite discrete choices delimited by "or", it MUST be classified as "selection".
     * STRICT PROHIBITION ON EXPLANATORY/THEORETICAL BOXES: NEVER generate interaction.type: "writing" for grammar boxes, rule charts, pronunciation notes, or language summaries. IT IS STRICTLY FORBIDDEN to demand artificial summaries (e.g. "Summarize the rules..."). Pure informational content must be preserved as referenceContent with interaction: null and isGraded: false.

3. PURE EXPLANATORY / THEORETICAL MATERIAL (GRAMMAR BOXES, RULES, CHARTS):
   - ONTOLOGICAL DIRECTIVE FOR PURE EXPLANATORY CONTENT & COEXISTING COMPOSITION:
     * When the input clipping consists of grammar explanations, rule boxes, pronunciation notes, or reference tables (e.g. sections labeled "Real World", "Grammar Focus", "Language Summary", "Pronunciation", "Rule Box") WITHOUT explicit interactive practice directives (no instructions like "Fill in...", "Choose...", "Match...", "Write an essay/paragraph..."):
       - IT IS STRICTLY FORBIDDEN to invent artificial open writing tasks ("writing") or demand synthetic summaries ("Summarize the main rules...", "Explain the grammar...").
       - UNIVERSAL COEXISTING COMPOSITION RULE: Whenever a clipping contains structured elements (tables, grids, paradigm matrices) alongside explanatory paragraphs, rules, bullet points, or TIPS, the model MUST extract the structured element into its corresponding primitive AND preserve 100% of the surrounding narrative/rules into 'referenceContent.body' (and 'contextBody'). It is strictly prohibited to discard one in favor of the other.
       - Textual explanations / bullet points / rules: Emit cleanly into "referenceContent.body" and "contextBody".
       - Example tables / matrix (e.g., agree/disagree matrix, paradigm chart): Emit into "referenceContent" (type: "reference_table" or "table_reference"), OR as interaction with layoutMode: "table" and ALL cells marked as static (isInput: false), preserving all explanatory narrative/rules in 'referenceContent.body' and 'contextBody'.
       - Expository slide: Set interaction: null, isGraded: false, and layout: "single_column".
${forcedTargetType ? `
4. DIRECTED ARCHETYPE OVERRIDE (FORCED TARGET: "${forcedTargetType}"):
The user explicitly commands to format and extract the clipping strictly into the archetype "${forcedTargetType}".
- You MUST force the slide structure to match this target archetype:
  * "reference_text" or "grammar_reference": interaction MUST be null, isGraded MUST be false, layout MUST be "single_column", referenceContent MUST be type: "text" (category: "grammar_note").
  * "reference_table": interaction MUST be null, isGraded MUST be false, layout MUST be "single_column", referenceContent MUST be type: "reference_table" or "table_reference".
  * "input_fields": interaction MUST be type: "input_fields" (layoutMode: "table" if a grid, or "list" if fill-in blanks).
  * "selection": interaction MUST be type: "selection" with candidate options.
  * "buckets_matching": interaction MUST be type: "buckets_matching" with buckets and tokens.
  * "sequence": interaction MUST be type: "sequence" with disordered chronological items.
  * "writing": interaction MUST be type: "writing" with prompt and guidelines (isGraded: false).
` : ''}

AUTONOMOUS RESOLUTION:
- Act as an expert ELT teacher: all exercises MUST arrive 100% COMPLETELY SOLVED by default.
- Every interactive item must have its expectedAnswer resolved according to formal English grammar.
- Never invent synthetic numeric permutations (e.g. "1, 2"). Preserve full candidate texts.
- Output ONLY the valid JSON strictly matching the schema.`;
}

/**
 * Universal Digitize Book: Calls Gemini via GoogleGenAI SDK or OpenRouter enforcing strict JSON Schema.
 */
export async function digitizeBook(
  images: string | string[],
  signal?: AbortSignal,
  options?: { forcedTargetType?: ForcedTargetArchetype }
): Promise<(ExtractedBlock & Slide)[]> {
  if (signal?.aborted) {
    const err = new Error('Operación cancelada por el usuario');
    err.name = 'AbortError';
    throw err;
  }

  const imageList = Array.isArray(images) ? images.filter(Boolean) : [images];
  const primaryImage = imageList[0] || '';

  if (imageList.length === 0) {
    return cloneSampleBlocks(primaryImage) as any;
  }

  const promptText = buildExtractionPrompt(imageList.length, options?.forcedTargetType);

  // Strategy 1: Google Gemini SDK (@google/genai) if VITE_GEMINI_API_KEY is available
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (geminiApiKey && geminiApiKey.trim() !== '') {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const inlineParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];

      for (const imgUrl of imageList) {
        const match = imgUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          inlineParts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }

      const contents = [promptText, ...inlineParts];
      const envGeminiModel = import.meta.env.VITE_GEMINI_MODEL?.trim();
      const candidateModels = Array.from(new Set([
        ...(envGeminiModel ? [envGeminiModel] : []),
        'gemini-2.0-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash-lite',
      ]));

      for (const model of candidateModels) {
        if (signal?.aborted) {
          const err = new Error('Operación cancelada por el usuario');
          err.name = 'AbortError';
          throw err;
        }

        try {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              responseMimeType: 'application/json',
              responseSchema: STRUCTURED_SLIDE_SCHEMA,
              temperature: 0.1,
              abortSignal: signal,
            },
          });

          if (signal?.aborted) {
            const err = new Error('Operación cancelada por el usuario');
            err.name = 'AbortError';
            throw err;
          }

          const rawText = response.text?.trim();
          if (rawText) {
            const validatedSlides = validateAndParseSlides(rawText);
            return validatedSlides.map((slide) => slideToExtractedBlock(slide, primaryImage, imageList));
          }
        } catch (modelErr: any) {
          if (signal?.aborted || modelErr?.name === 'AbortError') {
            throw modelErr;
          }
          console.warn(`[digitizeBook] Gemini SDK model "${model}" failed, trying next candidate:`, modelErr);
        }
      }
    } catch (geminiErr: any) {
      if (signal?.aborted || geminiErr?.name === 'AbortError') {
        throw geminiErr;
      }
      console.warn('[digitizeBook] Gemini SDK execution failed, falling back to OpenRouter:', geminiErr);
    }
  }

  // Strategy 2: OpenRouter Vision API with Structured Outputs (JSON Schema)
  const openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  const envOpenRouterModel = import.meta.env.VITE_OPENROUTER_MODEL?.trim();
  const openRouterCandidates = Array.from(new Set([
    ...(envOpenRouterModel ? [envOpenRouterModel] : []),
    'google/gemini-2.5-flash',
    'google/gemini-2.0-flash-001',
    'google/gemini-1.5-flash',
  ]));

  if (openRouterApiKey && openRouterApiKey.trim() !== '') {
    for (const orModel of openRouterCandidates) {
      if (signal?.aborted) {
        const err = new Error('Operación cancelada por el usuario');
        err.name = 'AbortError';
        throw err;
      }

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterApiKey}`,
            'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
            'X-Title': 'Activity Creator IA V2',
          },
          body: JSON.stringify({
            model: orModel,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: promptText },
                  ...imageList.map((url) => ({
                    type: 'image_url',
                    image_url: { url },
                  })),
                ],
              },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'slide_extraction',
                strict: false,
                schema: STRUCTURED_SLIDE_SCHEMA,
              },
            },
            temperature: 0.1,
          }),
        });

        if (signal?.aborted) {
          const err = new Error('Operación cancelada por el usuario');
          err.name = 'AbortError';
          throw err;
        }

        if (response.ok) {
          const data = await response.json();
          const rawContent = data.choices?.[0]?.message?.content;
          if (rawContent) {
            const validatedSlides = validateAndParseSlides(rawContent);
            return validatedSlides.map((slide) => slideToExtractedBlock(slide, primaryImage, imageList));
          }
        } else {
          console.warn(`[digitizeBook] OpenRouter model "${orModel}" returned HTTP ${response.status}, trying next candidate...`);
        }
      } catch (orErr: any) {
        if (signal?.aborted || orErr?.name === 'AbortError') {
          throw orErr;
        }
        console.warn(`[digitizeBook] OpenRouter model "${orModel}" failed:`, orErr);
      }
    }
  }

  if (signal?.aborted) {
    const err = new Error('Operación cancelada por el usuario');
    err.name = 'AbortError';
    throw err;
  }

  // Fallback to manual template if all Vision APIs are unavailable
  return cloneSampleBlocks(primaryImage, imageList) as any;
}

/**
 * Transforms the strict structured payload into a standardized ExtractedBlock.
 */
export function buildExtractedBlockFromPayload(
  payload: ExtractedStructuredPayload,
  sourceUrl: string,
  sourceImages?: string[]
): ExtractedBlock {
  const sanitized = sanitizeExtractedPayload(payload);
  const rawImages = (Array.isArray(sourceImages) && sourceImages.length > 0)
    ? sourceImages.filter(Boolean)
    : (sourceUrl ? [sourceUrl] : []);

  // Filter genuine visual assets (photos, illustrations) using visualImageIndices
  const refWords = String(sanitized.referenceContent || '').trim().split(/\s+/).filter(Boolean).length;
  const isTranscribedReadingArticle = refWords >= 40;
  const isStructuredTable = Array.isArray(sanitized.tableData) && sanitized.tableData.length > 0;

  let visualImages: string[] = [];
  if (isStructuredTable) {
    // Prohibit raw image if table/vocabulary diagram was fully digitized into structured tableData
    visualImages = [];
  } else if (isTranscribedReadingArticle && rawImages.length <= 1) {
    // Si sólo hay un recorte y se transcribió un artículo completo (>= 40 palabras),
    // ese recorte es la captura de la página del texto: NUNCA tratarlo como foto o estímulo visual
    visualImages = [];
  } else if (isTranscribedReadingArticle && rawImages.length <= 2) {
    // En tareas de comprensión lectora (texto + preguntas), ningún recorte es una foto aislada
    visualImages = [];
  } else if (Array.isArray(sanitized.visualImageIndices) && sanitized.visualImageIndices.length > 0) {
    visualImages = sanitized.visualImageIndices
      .map((idx) => rawImages[idx - 1])
      .filter((img): img is string => Boolean(img));
  } else if (Array.isArray(sanitized.visualImageIndices) && sanitized.visualImageIndices.length === 0) {
    // Explicitly 0 photos in the clippings: leave visualImages empty so text clippings are not shown in gallery!
    visualImages = [];
  } else {
    // Fallback when visualImageIndices was omitted:
    // If referenceContent is present with a transcribed reading text (>= 40 words or > 80 chars),
    // do NOT treat text clippings as photos!
    if (isTranscribedReadingArticle || (sanitized.referenceContent && sanitized.referenceContent.trim().length > 80)) {
      visualImages = [];
    } else {
      visualImages = rawImages;
    }
  }

  const contextBody = sanitized.contextBody || sanitized.referenceContent || undefined;

  const rawTextParts = [
    sanitized.title,
    sanitized.instruction,
    contextBody,
    sanitized.followUpPrompt,
    sanitized.referenceContent,
    ...sanitized.items.map((i) => i.prompt),
  ].filter(Boolean);

  const detectedType: ExtractedBlock['detectedType'] =
    isStructuredTable || (sanitized.tableRows && sanitized.tableRows.length > 0)
      ? 'table'
      : sanitized.interactionType === 'buckets'
      ? 'vocabulary'
      : sanitized.interactionType === 'reference' || sanitized.interactionType === 'writing' || (Boolean(sanitized.referenceContent) && sanitized.items.length === 0)
      ? 'paragraph'
      : 'numbered_list';

  return {
    id: `ocr-gen-${Date.now()}`,
    rawText: rawTextParts.join('\n\n'),
    detectedType,
    confidence: 0.98,
    sourceImageSnippetUrl: visualImages[0] || undefined,
    sourceImages: visualImages.length > 0 ? visualImages : undefined,
    contextBody,
    parsedData: {
      title: sanitized.title,
      instruction: sanitized.instruction,
      verificationAudioUrl: sanitized.verificationAudioUrl,
      audioLabel: sanitized.audioLabel,
      followUpPrompt: sanitized.followUpPrompt,
      contextBody,
      referenceContent: sanitized.referenceContent || undefined,
      content: contextBody || sanitized.referenceContent || undefined,
      wordBank: sanitized.wordBank.length > 0 ? sanitized.wordBank : undefined,
      interactionType: sanitized.interactionType,
      guidelines: sanitized.guidelines,
      minWords: sanitized.minWords,
      maxWords: sanitized.maxWords,
      prompt: sanitized.instruction || sanitized.title,
      buckets: sanitized.buckets,
      items: sanitized.items,
      tableHeaders: sanitized.tableHeaders,
      tableRows: sanitized.tableRows,
      tableData: sanitized.tableData,
      columns: sanitized.tableData,
      isGraded: sanitized.isGraded !== undefined ? sanitized.isGraded : true,
      images: visualImages.length > 0 ? visualImages : undefined,
      imageUrl: visualImages[0] || undefined,
      visualImageIndices: sanitized.visualImageIndices,
    },
  };
}

/**
 * Strips predictive spoilers when the instruction asks students to infer or guess
 * (e.g. "Why is X famous, do you think?")
 */
export function stripPredictiveSpoilers(text: string, contextInstruction: string): string {
  if (!text) return '';
  const isPredictive = /do you think|why do you think|predict|guess|what do you think|infer/i.test(contextInstruction);
  if (!isPredictive) return text;

  // Filter out paragraphs that give factual biographical answers or describe why someone is famous
  const spoilerRegex = /^(?:(?:[A-Z][\w\s.'-]+|\bHe|\bShe|\bThey) (?:is|are|was|were) (?:(?:a|an|the) )?(?:famous|well-known|renowned|celebrity|popular|successful)?\s*(?:chef|cook|actor|actress|singer|musician|artist|athlete|player|writer|author|politician|figure|host|presenter|star)|(?:he|she|they|[A-Z][\w\s.'-]+) (?:is|are|was|were|became) (?:famous|known|popular|celebrated) (?:for|because|as|when|in)|in fact,?\s|the answer is|this person is famous|these people are famous|the reason (?:he|she|they|why))/i;

  return text
    .split(/\n{2,}/)
    .filter((para) => !spoilerRegex.test(para.trim()))
    .join('\n\n')
    .trim();
}

/**
 * Strips pedagogical meta-comments or teacher instructions generated by AI
 * (e.g. "This is an open-ended activity designed to...", "In this activity, students will...")
 * as well as artificial descriptions of photographs ("The picture shows...", "In the photo, we see...")
 */
export function stripMetaComments(text: string): string {
  if (!text) return '';
  const metaRegex = /^(?:this is an? (?:open-ended|speaking|communicative|interactive|writing|reading) activity|this (?:activity|exercise|task|lesson) is (?:designed|intended|meant|created) to|in this activity,? students (?:will|are encouraged to|can|practice)|this task encourages students|designed to encourage students|this is designed to encourage|the (?:picture|photo|image|photograph)s? (?:shows?|displays?|depicts?|presents?)|in the (?:picture|photo|image)s?,? (?:we can see|there is|there are))/i;

  return text
    .split(/\n{2,}/)
    .filter((para) => !metaRegex.test(para.trim()))
    .join('\n\n')
    .trim();
}

/**
 * Strips redundant title if repeated as the first line of reference content
 */
export function stripLeadingDuplicateTitle(text: string, title: string): string {
  if (!text || !title) return text;
  const normalizedTitle = title.trim().toLowerCase().replace(/^[#\s*_-]+|[#\s*_-]+$/g, '');
  if (!normalizedTitle) return text;

  const lines = text.split('\n');
  if (lines.length > 0) {
    const firstLineClean = lines[0].trim().toLowerCase().replace(/^[#\s*_-]+|[#\s*_-]+$/g, '');
    if (firstLineClean === normalizedTitle || firstLineClean.startsWith(normalizedTitle + ':')) {
      lines.shift();
      while (lines.length > 0 && !lines[0].trim()) {
        lines.shift();
      }
      return lines.join('\n').trim();
    }
  }
  return text;
}


/**
 * Extracts candidate word distractors from a sentence for identification tasks
 * (e.g. "Underline the question words", "Circle the verbs")
 */
export function extractSentenceDistractors(sentence: string, targetAnswer: string): string[] {
  if (!sentence) return [];
  const cleaned = sentence.replace(/^(?:\(?\d+[.)]?|[a-zA-Z][.)])\s+/, '');
  const words = cleaned
    .replace(/[.,!?:;()¿¡"“”'’_—–[\]{}]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w));

  const targetLower = targetAnswer.trim().toLowerCase();
  const seen = new Set<string>();
  const distractors: string[] = [];

  for (const word of words) {
    const wLower = word.toLowerCase();
    if (wLower !== targetLower && !seen.has(wLower)) {
      seen.add(wLower);
      distractors.push(word);
      if (distractors.length >= 3) break;
    }
  }

  return distractors;
}

/**
 * Number word mapping for open production directives (e.g. "ten questions" -> 10)
 */
export const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
};

/**
 * Formats multi-stage directives (phases a, b, c, d) with clean double-newlines and bold markers:
 * e.g., "**a)** ... \n\n **b)** ..."
 * Prevents collapsing sequential procedural steps into an unformatted run-on paragraph.
 */
export function formatMultiStageDirectives(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();

  // Check if text contains multi-stage directive indicators (e.g. 'a)', 'b)' or '(a)', '(b)' or 'a.', 'b.')
  const hasStepA = /(?:^|\s|\n)(?:\*{0,2}\(?a[).:]\*{0,2})\s+/i.test(trimmed);
  const hasStepB = /(?:^|\s|\n)(?:\*{0,2}\(?b[).:]\*{0,2})\s+/i.test(trimmed);

  if (!hasStepA && !hasStepB) {
    return text;
  }

  // Normalize markers to double newlines with bold tags: \n\n**letter)**
  let formatted = trimmed.replace(
    /(?:^|\n|(?<=[.!?;\s]))\s*(?:\*{0,2}\(?([a-fA-F])[).:]\*{0,2})\s+/g,
    (_match, letter, offset) => {
      const lowerLetter = letter.toLowerCase();
      const prefix = offset === 0 ? '' : '\n\n';
      return `${prefix}**${lowerLetter})** `;
    }
  );

  return formatted.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Partitioned result of a multi-phase writing directive.
 */
export interface PartitionedWritingInstruction {
  instruction: string;
  followUpPrompt?: string;
}

/**
 * Hierarchical Consign Partitioning for Writing Activities:
 * Parses multi-phase sequential task instructions (e.g. inciso "a" for individual production,
 * and subsequent inciso "b" or "c" for peer interaction, pair discussion, or class presentation).
 *
 * Rules:
 * 1. Assigns the first stage / inciso to `instruction`.
 * 2. Extracts the subsequent stage (inciso "b", "c", "2") to `followUpPrompt`.
 * 3. Removes the extracted follow-up text from the main `instruction` string to prevent duplication
 *    and ensure decoupling of data.
 */
export function partitionWritingInstruction(
  rawInstruction: string | null | undefined,
  existingFollowUp?: string | null
): PartitionedWritingInstruction {
  if (!rawInstruction || !rawInstruction.trim()) {
    return {
      instruction: rawInstruction || '',
      followUpPrompt: existingFollowUp ? existingFollowUp.trim() : undefined,
    };
  }

  let text = rawInstruction.trim();
  let followUp = existingFollowUp ? existingFollowUp.trim() : undefined;

  // 1. If an existing followUpPrompt was provided, strip it from instruction along with any leading inciso marker
  if (followUp) {
    const escaped = followUp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withMarkerRegex = new RegExp(
      `(?:(?:\\r?\\n)+|\\s+)*(?:\\*{0,2}(?:\\([b-dB-D2-4]\\)|[b-dB-D2-4][).:]|\\([b-dB-D2-4]\\)[.:]?)\\*{0,2}\\s*)?${escaped}`,
      'i'
    );
    if (withMarkerRegex.test(text)) {
      text = text.replace(withMarkerRegex, '').trim();
    } else if (text.includes(followUp)) {
      text = text.replace(followUp, '').trim();
    }
  }

  // 2. Sequential Marker Partitioning:
  // Detect transitions to subsequent phases: e.g. "b)", "b.", "(b)", "**b)**", "2)", "2.", "c)"
  const phaseBoundaryRegex = /(?:(?:\r?\n)+\s*|(?<=[.!?])\s+|\s{2,})(?:\*{0,2}(?:\([b-dB-D2-4]\)[.:]?|[b-dB-D2-4][).:])\*{0,2})\s+/i;
  const match = text.match(phaseBoundaryRegex);

  if (match && match.index !== undefined) {
    const firstPart = text.slice(0, match.index).trim();
    const secondPart = text.slice(match.index + match[0].length).trim();

    if (firstPart.length > 0 && secondPart.length > 0) {
      text = firstPart;
      if (!followUp) {
        followUp = secondPart;
      }
    }
  }

  // 3. Communicative Interaction Trigger Partitioning (Fallback):
  // Triggers like "Work in pairs", "Discuss in pairs", "Ask each other", "Read your partner's"
  if (!followUp) {
    const communicativeTriggerRegex = /(?:(?:\r?\n)+\s*|(?<=[.!?])\s+)(?:\*{0,2}(?:[b-dB-D2-4][).:]?|\([b-dB-D2-4]\))\*{0,2}\s*)?(Work in pairs\b|In pairs\b|Discuss (?:in pairs|with a partner|with each other)\b|Ask (?:each other|your partner)\b|Share (?:with|your)\b|Read your partner\b|Compare (?:with|your answers)\b|Tell (?:your partner|the class)\b)/i;
    const commMatch = text.match(communicativeTriggerRegex);
    if (commMatch && commMatch.index !== undefined) {
      const firstPart = text.slice(0, commMatch.index).trim();
      const secondPart = text.slice(commMatch.index).replace(/^(?:(?:\r?\n)+\s*|(?<=[.!?])\s+)(?:\*{0,2}(?:[b-dB-D2-4][).:]?|\([b-dB-D2-4]\))\*{0,2}\s*)?/i, '').trim();
      if (firstPart.length > 0 && secondPart.length > 0) {
        text = firstPart;
        followUp = secondPart;
      }
    }
  }

  // Final cleanup of trailing markers or punctuation from instruction
  text = text.replace(/(?:(?:\r?\n)+\s*|\s+)(?:\*{0,2}(?:\([b-dB-D2-4]\)[.:]?|[b-dB-D2-4][).:])\*{0,2})\s*$/i, '').trim();

  return {
    instruction: text,
    followUpPrompt: followUp && followUp.length > 0 ? followUp : undefined,
  };
}

/**
 * Deterministically generates cognitive scaffolding / guidelines (1..N steps or templates)
 * for open production / writing tasks when quantified elements or requirement lists are present in the instruction.
 */
export function generateDeterministicGuidelines(
  instruction?: string | null,
  prompt?: string | null,
  wordBank?: string[] | null,
  existingGuidelines?: string[] | null
): string[] {
  // 1. If explicit guidelines already exist and have items, sanitize them and return
  if (Array.isArray(existingGuidelines) && existingGuidelines.length > 0) {
    const cleaned = existingGuidelines
      .map((g) => stripOrphanTypographicalMarkers(String(g || '').trim()))
      .filter(Boolean);
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  const combined = `${instruction || ''}\n${prompt || ''}`.trim();
  if (!combined) {
    return [];
  }

  // Detect language: English if English production keywords are present
  const isEnglish = /\b(?:write|sentence|question|paragraph|about|use|include|these|your|partner|class|describe|draft|compose|formulate)\b/i.test(combined);

  // Extract candidate topics/ideas from wordBank or inline clauses ("Use these ideas: ...", "Include: ...")
  const extractedTopics: string[] = [];
  if (Array.isArray(wordBank) && wordBank.length > 0) {
    for (const w of wordBank) {
      const cleanW = stripOrphanTypographicalMarkers(String(w || '').trim());
      if (cleanW && !extractedTopics.includes(cleanW)) {
        extractedTopics.push(cleanW);
      }
    }
  }

  // Check inline requirements: "Use these ideas: traffic, noise...", "Include: a, b, c", "Think about: ..."
  const ideasMatch = combined.match(/(?:use these (?:ideas|topics|words)|include|think about|ideas?:|incluye|usa estas ideas)[:\s]+([^.\n;]+)/i);
  if (ideasMatch && ideasMatch[1]) {
    const parts = ideasMatch[1]
      .split(/[,;/•\n]+/)
      .map((p) => stripOrphanTypographicalMarkers(p.trim()))
      .filter((p) => p.length >= 2 && p.length <= 40);
    for (const p of parts) {
      if (!extractedTopics.includes(p)) {
        extractedTopics.push(p);
      }
    }
  }

  // 2. Cardinal detection: e.g. "Write ten questions", "Write 5 sentences", "Escribe diez preguntas"
  const cardinalRegex = /\b(?:write|make|ask|create|formulate|produce|compose|draft|list|escribe|redacta|haz|formula|plantea|elabora|enumera)\s+(?:(?:at\s+least|about|approx\w*|al\s+menos|unos?|unas?)\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|\d{1,2})\s+(questions?|sentences?|paragraphs?|reasons?|ideas?|items?|things?|examples?|statements?|rules?|points?|preguntas?|oraciones?|frases?|p[aá]rrafos?|razones?|ejemplos?|afirmaciones?|reglas?|puntos?)\b/i;

  const cardinalMatch = combined.match(cardinalRegex);

  const countLookup: Record<string, number> = {
    one: 1, uno: 1, una: 1, un: 1,
    two: 2, dos: 2,
    three: 3, tres: 3,
    four: 4, cuatro: 4,
    five: 5, cinco: 5,
    six: 6, seis: 6,
    seven: 7, siete: 7,
    eight: 8, ocho: 8,
    nine: 9, nueve: 9,
    ten: 10, diez: 10,
    eleven: 11, once: 11,
    twelve: 12, doce: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15, quince: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20, veinte: 20
  };

  if (cardinalMatch) {
    const numRaw = cardinalMatch[1].toLowerCase();
    const targetCount = countLookup[numRaw] ?? parseInt(numRaw, 10);
    const unitRaw = cardinalMatch[2].toLowerCase();

    if (targetCount >= 2 && targetCount <= 25) {
      const isQuestion = /question|pregunta/i.test(unitRaw);
      const isSentence = /sentence|oraci|frase/i.test(unitRaw);
      const isParagraph = /paragraph|p[aá]rrafo/i.test(unitRaw);
      const isReason = /reason|raz[oó]n/i.test(unitRaw);

      const guidelines: string[] = [];
      for (let i = 1; i <= targetCount; i++) {
        const topic = extractedTopics[i - 1];
        if (isEnglish) {
          if (isQuestion) {
            guidelines.push(topic ? `Question ${i}: Formulate a question about "${topic}"` : `Question ${i}: Draft your question (${i} of ${targetCount})`);
          } else if (isSentence) {
            guidelines.push(topic ? `Sentence ${i}: Write a complete sentence about "${topic}"` : `Sentence ${i}: Draft your sentence (${i} of ${targetCount})`);
          } else if (isParagraph) {
            guidelines.push(topic ? `Paragraph ${i}: Develop your paragraph focusing on "${topic}"` : `Paragraph ${i}: Draft paragraph ${i} (${i} of ${targetCount})`);
          } else if (isReason) {
            guidelines.push(topic ? `Reason ${i}: State and justify "${topic}"` : `Reason ${i}: Explain reason ${i} (${i} of ${targetCount})`);
          } else {
            guidelines.push(topic ? `Item ${i}: Focus on "${topic}"` : `Item ${i}: Draft entry ${i} (${i} of ${targetCount})`);
          }
        } else {
          if (isQuestion) {
            guidelines.push(topic ? `Pregunta ${i}: Formula una pregunta sobre "${topic}"` : `Pregunta ${i}: Plantea tu pregunta (${i} de ${targetCount})`);
          } else if (isSentence) {
            guidelines.push(topic ? `Oración ${i}: Redacta una oración completa sobre "${topic}"` : `Oración ${i}: Plantea tu oración (${i} de ${targetCount})`);
          } else if (isParagraph) {
            guidelines.push(topic ? `Párrafo ${i}: Desarrolla tu párrafo enfocado en "${topic}"` : `Párrafo ${i}: Redacta el párrafo ${i} (${i} de ${targetCount})`);
          } else if (isReason) {
            guidelines.push(topic ? `Razón ${i}: Explica y justifica "${topic}"` : `Razón ${i}: Desarrolla la razón ${i} (${i} de ${targetCount})`);
          } else {
            guidelines.push(topic ? `Punto ${i}: Desarrolla "${topic}"` : `Punto ${i}: Elabora el elemento ${i} (${i} de ${targetCount})`);
          }
        }
      }
      return guidelines;
    }
  }

  // 3. If there is a list of requirement topics (>= 2 topics) without an explicit cardinal
  if (extractedTopics.length >= 2) {
    return extractedTopics.map((topic, idx) => {
      if (isEnglish) {
        return `Step ${idx + 1}: Address or incorporate "${topic}"`;
      }
      return `Paso ${idx + 1}: Desarrolla o incorpora "${topic}"`;
    });
  }

  // 4. Default pedagogical scaffolding if instruction represents a composition/production task
  const isComposition = /\b(?:write|draft|compose|produce|redacta|escribe|elabora)\b/i.test(combined);
  if (isComposition) {
    if (isEnglish) {
      return [
        'Step 1: Introduction – Present the main topic or context clearly.',
        'Step 2: Body – Develop supporting details, examples, and key descriptions.',
        'Step 3: Conclusion – Provide a closing thought, summary, or personal reflection.'
      ];
    }
    return [
      'Paso 1: Introducción – Presenta el tema principal o contexto con claridad.',
      'Paso 2: Desarrollo – Explica los detalles clave, ideas de apoyo y ejemplos.',
      'Paso 3: Conclusión – Añade una reflexión final, cierre o resumen del texto.'
    ];
  }

  return [];
}

/**
 * Evaluates whether text is a genuine autonomous reading passage
 * (article, narrative story, multi-turn dialogue, or full grammar reference table)
 * rather than a vocabulary list, idea bank, solved example, or instruction.
 */
export function isAutonomousReadingContent(text: string | null): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 25) return false;

  // Strict check: Synthetic pedagogical advice, teacher notes, or artificial instructions are NEVER reading passages
  if (isSyntheticPedagogicalText(trimmed)) return false;

  // Check if it's explicitly an idea bank, topic list, or word bank
  const isIdeaOrTopicList = /^(?:(?:useful\s+)?(?:ideas|topics|prompts|vocabulary|words|categories|phrases)|use these ideas|ideas to use)[:\s]/i.test(trimmed);
  if (isIdeaOrTopicList) return false;

  // Check if it's an example sentence or model answer
  if (/^(?:example|model|sample|e\.g\.)[:\s]/i.test(trimmed)) return false;
  if (/^\(?1[.)]?\s+[A-Z][^.?!]+[.?]\s*(?:—|-|–)\s*/i.test(trimmed) && trimmed.length < 80) return false;

  // If text is composed mostly of bulleted short lines (topic tags or vocabulary)
  const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^[•\-–*·]\s*/.test(l) || /^\d+[.)]\s*/.test(l));
  if (bulletLines.length > 0 && bulletLines.length >= lines.length * 0.6) {
    const avgLen = bulletLines.reduce((acc, l) => acc + l.length, 0) / bulletLines.length;
    if (avgLen < 40 && !bulletLines.some((l) => l.includes('?'))) {
      return false; // It's a topic or vocabulary list, not an autonomous reading passage
    }
  }

  // Count words
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 25) {
    const isDialogue = /(?:Speaker\s+[A-Z]|A:|B:|John:|Mary:)/i.test(trimmed);
    const isTable = trimmed.includes('|') && trimmed.includes('\n');
    const isNumberedContextList = lines.length >= 2 && lines.some((l) => /^\(?\d+[.)]/.test(l));
    const hasQuestions = lines.some((l) => l.includes('?'));
    if (!isDialogue && !isTable && !isNumberedContextList && !hasQuestions) {
      return false; // Under 25 words and not dialogue/table/context list => not an autonomous reading passage
    }
  }

  return true;
}

/**
 * Formats table headers and rows into clean GitHub-flavored Markdown table syntax.
 */
export function formatTableToMarkdown(headers: string[], rows: any[][]): string {
  if (!headers.length && !rows.length) return '';
  const numCols = Math.max(headers.length, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  if (numCols === 0) return '';
  const cleanHeaders = Array.from({ length: numCols }, (_, i) => headers[i] || `Columna ${i + 1}`);
  const headerLine = `| ${cleanHeaders.join(' | ')} |`;
  const sepLine = `| ${cleanHeaders.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map((r) => {
    if (!Array.isArray(r)) return `| ${cleanHeaders.map(() => '').join(' | ')} |`;
    const cells = Array.from({ length: numCols }, (_, i) => {
      const cell = r[i];
      const val = typeof cell === 'object' && cell !== null ? (cell.text || cell.expectedAnswer || '') : String(cell || '');
      return stripOrphanTypographicalMarkers(String(val).replace(/\|/g, '-').trim());
    });
    return `| ${cells.join(' | ')} |`;
  });
  return [headerLine, sepLine, ...rowLines].join('\n');
}

/**
 * Formats column-based structured table data into clean GitHub-flavored Markdown table syntax.
 */
export function formatColumnsToMarkdown(columns: { header: string; items: string[] }[]): string {
  if (!columns.length) return '';
  const maxRows = Math.max(...columns.map((c) => (Array.isArray(c?.items) ? c.items.length : 0)));
  const headers = columns.map((c, i) => c?.header || `Columna ${i + 1}`);
  const headerLine = `| ${headers.join(' | ')} |`;
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const rowLines: string[] = [];
  for (let r = 0; r < maxRows; r++) {
    const row = columns.map((c) => (Array.isArray(c?.items) ? c.items[r] || '' : ''));
    rowLines.push(`| ${row.map((cell) => stripOrphanTypographicalMarkers(String(cell).replace(/\|/g, '-').trim())).join(' | ')} |`);
  }
  return [headerLine, sepLine, ...rowLines].join('\n');
}

/**
 * Extracts support topic ideas from a text block or bulleted list
 * (e.g. "Ideas: personal details, family, work and studies" -> ["personal details", "family", "work and studies"])
 */
export function extractTopicIdeas(text: string): string[] {
  if (!text) return [];
  // Invariante estricta: Las celdas, filas o columnas de una tabla pasiva jamás deben aplanarse ni transferirse al wordBank
  if (text.includes('|')) return [];
  const cleaned = text
    .replace(/^(?:(?:useful\s+)?(?:ideas|topics|prompts|vocabulary|words|categories|phrases)|use these ideas|ideas to use)[:\s]*/gi, '')
    .trim();

  const parts = cleaned
    .split(/[\n,;•·\-–—*]+/)
    .map((s) => s.replace(/^\d+[.)]\s*/, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 45 && !/[?_]{2,}/.test(s));

  return Array.from(new Set(parts));
}

/**
 * Pure, defensive normalization of structured payload:
 * Guarantees that every item has expectedAnswer, acceptedAnswers, and isExample boolean.
 * Enforces open production modeling, strict referenceContent delimitation, and structured multi-stage directives.
 */
function sanitizeExtractedPayload(payload: ExtractedStructuredPayload): ExtractedStructuredPayload {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const rawInstruction = payload.instruction ? String(payload.instruction).trim() : '';
  const rawTitle = payload.title ? stripEditorialPrefix(String(payload.title).trim()) : '';
  const rawContextDirective = `${rawTitle} ${rawInstruction}`;

  const isSelectionDirective = /tick\b|check\b|marcar?\b|select\s+all\b|choose\s+from\b|which\s+(?:sentences?|questions?|statements?|phrases?|items?|options?|words?|ideas?)\b|which\s+of\b|are\s+(?:true|correct)\b|true\s+or\s+false\b|choose\s+the\s+(?:correct|true)\b|select\s+the\s+(?:correct|true)\b|verdader[ao]s?\s+para\s+ti|true\s+for\s+you|about\s+yourself/i.test(rawContextDirective);
  const isExplicitMatchingDirective = /match\b|relate\b|pair\b|connect\b|emparej\w*|relacion\w*/i.test(rawContextDirective) || payload.interactionType === 'matching';
  const isIdentifyDirective = /underline\b|circle\b|highlight\b|identify\b|subraya\b|encierra\b|marca\b/i.test(rawContextDirective);
  const isChecklistDirective = isSelectionDirective || /tick\b|check\b|marcar?\b|select\s+all\b|choose\s+from\b|verdader[ao]s?\s+para\s+ti|true\s+for\s+you|about\s+yourself/i.test(rawContextDirective);

  // Detect open production directive ("Write ten questions. Use these ideas...")
  const openProductionRegex = /\b(?:write|make|ask|create|formulate|produce)\s+(?:(?:at\s+least|about|approx\w*)\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d{1,2})\s+(questions|sentences|phrases|things|items)\b/i;
  const openProductionMatch = `${rawTitle} ${rawInstruction}`.match(openProductionRegex);
  const targetItemCount = openProductionMatch
    ? (NUMBER_WORDS[openProductionMatch[1].toLowerCase()] ?? parseInt(openProductionMatch[1], 10))
    : 0;
  const isOpenProductionTask = targetItemCount >= 2 && targetItemCount <= 25;

  // Global pool of candidate options for matching tasks (e.g. headings or definitions)
  const matchingPool = Array.from(
    new Set([
      ...(Array.isArray(payload.wordBank) ? payload.wordBank.map((w) => stripOrphanTypographicalMarkers(String(w).trim())).filter(Boolean) : []),
      ...items.flatMap((it) => {
        if (Array.isArray(it.options) && it.options.length > 0) {
          return it.options.map((o) => stripOrphanTypographicalMarkers(String(o).trim())).filter(Boolean);
        }
        return it.expectedAnswer ? [stripOrphanTypographicalMarkers(String(it.expectedAnswer).trim())] : [];
      }),
    ])
  ).filter(Boolean);

  const isBijectiveMatching = Boolean(
    isExplicitMatchingDirective &&
    !isSelectionDirective &&
    matchingPool.length >= 2 &&
    items.length >= 2
  );

  const sanitizedItems = items.map((it, idx) => {
    const rawPrompt = stripOrphanTypographicalMarkers(String(it.prompt || '').trim());
    const explanation = stripOrphanTypographicalMarkers(String(it.explanation || '').trim());
    const isPureNumber = /^(?:item\s*)?\d+[.)]?$/i.test(rawPrompt) || rawPrompt === '';
    
    let prompt = (isPureNumber && explanation)
      ? (rawPrompt ? `${rawPrompt} _______ : ${explanation}` : `${idx + 1}. _______ : ${explanation}`)
      : (rawPrompt || `Item ${idx + 1}`);
    const expectedAnswer = stripOrphanTypographicalMarkers(String(it.expectedAnswer || '').trim()) || (isOpenProductionTask ? '' : `Respuesta ${idx + 1}`);

    // If this is an identification task ("Underline / Circle / Identify"), restore full intact sentence if blank was created
    if (isIdentifyDirective && /_{2,}/.test(prompt) && expectedAnswer) {
      prompt = prompt.replace(/_{2,}/g, expectedAnswer);
    }

    let acceptedAnswers = Array.isArray(it.acceptedAnswers) && it.acceptedAnswers.length > 0
      ? it.acceptedAnswers.map((a) => stripOrphanTypographicalMarkers(String(a).trim())).filter(Boolean)
      : (expectedAnswer ? [expectedAnswer] : []);

    if (expectedAnswer && !acceptedAnswers.includes(expectedAnswer)) {
      acceptedAnswers.unshift(expectedAnswer);
    }

    let itemOptions: string[] | undefined = Array.isArray(it.options) && it.options.length > 1
      ? it.options.map((o) => stripOrphanTypographicalMarkers(String(o).trim())).filter(Boolean)
      : (isBijectiveMatching && matchingPool.length > 1 ? matchingPool : (Array.isArray(it.options) ? it.options.map((o) => stripOrphanTypographicalMarkers(String(o).trim())).filter(Boolean) : undefined));

    // If identification task and options are missing or insufficient, extract sentence words as distractors
    if (isIdentifyDirective && (!itemOptions || itemOptions.length <= 1)) {
      const distractors = extractSentenceDistractors(prompt, expectedAnswer);
      if (distractors.length > 0) {
        itemOptions = Array.from(new Set([expectedAnswer, ...distractors.map(stripOrphanTypographicalMarkers)]));
      }
    }

    return {
      prompt,
      expectedAnswer,
      acceptedAnswers,
      isExample: Boolean(it.isExample),
      explanation: String(it.explanation || '').trim(),
      options: itemOptions,
    };
  });

  const rawTableHeaders = Array.isArray(payload.tableHeaders) ? payload.tableHeaders : undefined;
  const tableHeaders = rawTableHeaders
    ? rawTableHeaders.map((h) => stripEditorialPrefix(stripOrphanTypographicalMarkers(String(h).trim()))).filter(Boolean)
    : undefined;

  const rawTableRows = Array.isArray(payload.tableRows) ? payload.tableRows : undefined;
  const tableRows = rawTableRows
    ? rawTableRows.map((row) => {
        if (!Array.isArray(row)) return [];
        return row.map((cell) => {
          const isInput = Boolean(cell?.isInput);
          const isExample = Boolean(cell?.isExample);
          const text = stripOrphanTypographicalMarkers(String(cell?.text || '').trim());
          const expectedAnswer = stripOrphanTypographicalMarkers(String(cell?.expectedAnswer || '').trim());
          let acceptedAnswers = Array.isArray(cell?.acceptedAnswers) && cell.acceptedAnswers.length > 0
            ? cell.acceptedAnswers.map((a) => stripOrphanTypographicalMarkers(String(a).trim())).filter(Boolean)
            : (expectedAnswer ? [expectedAnswer] : []);

          if (expectedAnswer && !acceptedAnswers.includes(expectedAnswer)) {
            acceptedAnswers.unshift(expectedAnswer);
          }

          return {
            text,
            isInput,
            expectedAnswer: isInput ? (expectedAnswer || acceptedAnswers[0] || '') : undefined,
            acceptedAnswers,
            isExample,
            hint: cell?.hint ? stripOrphanTypographicalMarkers(String(cell.hint).trim()) : undefined,
          };
        });
      })
    : undefined;

  let followUpPrompt = payload.followUpPrompt ? String(payload.followUpPrompt).trim() : undefined;
  const combinedHeader = `${rawTitle}\n${rawInstruction}`;

  // Check if subsection (b) is explicitly an audio verification step ("Listen and check")
  const bMatch = combinedHeader.match(/(?:^|\n|[;.]\s*)(?:[bB][.)]\s+|(?:\([bB]\)\s+))(listen\s+(?:and|&|to)\s+check[^\n]*)/i);
  const isAudioVerificationFlow = Boolean(bMatch);

  let audioLabel = payload.audioLabel ? String(payload.audioLabel).trim() : undefined;
  let verificationAudioUrl = payload.verificationAudioUrl ? String(payload.verificationAudioUrl).trim() : undefined;

  if (isAudioVerificationFlow) {
    const bDirective = bMatch![1].trim();
    if (!audioLabel) {
      const trackInB = bDirective.match(/\b(?:(?:CD\s*\d+\s*)?Track\s*(\d+(?:\.\d+)?)|(R\d+\.\d+)|(?:Audio\s*(\d+(?:\.\d+)?))|([1-9]\.\d{1,2}))\b/i);
      if (trackInB) {
        audioLabel = trackInB[0].trim();
      }
    }
    // Partition subsection (c) - communicative closing / oral follow-up if present
    if (!followUpPrompt) {
      const cMatch = combinedHeader.match(/(?:^|\n|[;.]\s*)(?:[cC][.)]\s+|(?:\([cC]\)\s+))([^\n]+)/);
      if (cMatch && cMatch[1]?.trim()) {
        followUpPrompt = cMatch[1].trim();
      }
    }
  }

  // Title and Instruction cleaning & multi-stage formatting
  let title = rawTitle;
  let instruction = rawInstruction;

  if (isAudioVerificationFlow) {
    const cleanDirectiveText = (text: string): string => {
      return text
        .replace(/(?:^|\n|[;.]\s*)(?:[cC][.)]\s+|(?:\([cC]\)\s+))[^\n]+/g, '')
        .replace(/(?:^|\n|[;.]\s*)(?:[bB][.)]\s+|(?:\([bB]\)\s+))(?:listen\s+[^\n]+)/gi, '')
        .replace(/^(?:\(?\d+\)?\s*)?(?:[aA][.)]\s+|(?:\([aA]\)\s+))/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };
    title = cleanDirectiveText(rawTitle);
    instruction = cleanDirectiveText(rawInstruction);
  } else {
    // Multi-stage procedural directives (a, b, c, d): preserve structured format with double-linebreaks and bold headers
    instruction = formatMultiStageDirectives(rawInstruction);
    title = stripEditorialPrefix(rawTitle.replace(/^(?:\(?\d+\)?\s*)?(?:[aA][.)]\s+|(?:\([aA]\)\s+))/g, '').trim());
  }

  if (!instruction && title.length > 50) {
    instruction = title;
    title = 'Speaking / Activity Task';
  } else if (!title && instruction) {
    title = instruction.length <= 50 ? stripEditorialPrefix(instruction) : 'Speaking / Activity Task';
  } else if (!title && !instruction) {
    title = 'Actividad Digitalizada';
  } else {
    title = stripEditorialPrefix(title);
  }

  const rawRef = Array.isArray(payload.referenceContent)
    ? payload.referenceContent.map((s) => String(s).trim()).filter(Boolean).join('\n\n')
    : (payload.referenceContent ? String(payload.referenceContent).trim() : null);

  const contextDirective = `${title} ${instruction || ''}`;
  const cleanedRawRef = rawRef
    ? stripPredictiveSpoilers(stripLeadingDuplicateTitle(stripMetaComments(rawRef), title), contextDirective)
    : null;

  // 1. Preservación Estructural de Datos Tabulares (encabezados + filas/columnas):
  // Cualquier bloque visual o semántico detectado con formato de tabla debe mapearse
  // exclusivamente a referenceContent (preservando su formato Markdown/tabular).
  const hasPayloadTable = Boolean(
    (Array.isArray(tableHeaders) && tableHeaders.length > 0 && Array.isArray(tableRows) && tableRows.length > 0) ||
    (Array.isArray(payload.tableData) && payload.tableData.length > 0)
  );

  let synthesizedTableMarkdown: string | null = null;
  if (hasPayloadTable && (!cleanedRawRef || !cleanedRawRef.includes('|'))) {
    if (Array.isArray(tableHeaders) && Array.isArray(tableRows)) {
      synthesizedTableMarkdown = formatTableToMarkdown(tableHeaders, tableRows);
    } else if (Array.isArray(payload.tableData)) {
      synthesizedTableMarkdown = formatColumnsToMarkdown(payload.tableData as any);
    }
  }

  const effectiveRawRef = cleanedRawRef || synthesizedTableMarkdown;
  const isTableMarkdown = Boolean(effectiveRawRef && effectiveRawRef.includes('|') && effectiveRawRef.includes('\n'));

  // Strict Delimitation of referenceContent:
  // Lists of vocabulary, banks of ideas/topics, solved examples, or instructions NEVER belong in referenceContent.
  // referenceContent is strictly for autonomous reading passages (articles, dialogues, reference tables).
  let referenceContent: string | null = null;
  const wordBankTopics: string[] = [];

  if (effectiveRawRef) {
    const isAutonomous = isTableMarkdown || isAutonomousReadingContent(effectiveRawRef);
    const isDuplicate = isDuplicateReferenceContent(effectiveRawRef, sanitizedItems) ||
      isConcatenationOfItems(effectiveRawRef, Array.isArray(payload.guidelines) ? payload.guidelines : []);
    const isSynthetic = !isTableMarkdown && isSyntheticPedagogicalText(effectiveRawRef);

    if (isTableMarkdown) {
      // Tabular data must be preserved structurally in referenceContent without flattening
      referenceContent = effectiveRawRef;
    } else if (payload.interactionType === 'reference' && !isOpenProductionTask) {
      // In speaking cards without open production, preserve genuine dialogue/model context
      referenceContent = (isAutonomous && !isSynthetic)
        ? formatMultiStageDirectives(effectiveRawRef)
        : null;
    } else if (isAutonomous && !isDuplicate && !isSynthetic) {
      // Genuine autonomous reading passage (article, chronicle, formal dialogue, or reference chart)
      referenceContent = effectiveRawRef;
    } else {
      // Only extract topic ideas if it is NOT a table. Tables are strictly forbidden from wordBank!
      const extracted = extractTopicIdeas(effectiveRawRef);
      wordBankTopics.push(...extracted.map(stripOrphanTypographicalMarkers).filter(Boolean));
      referenceContent = null;
    }
  }

  // Consolidate wordBank: include words from payload plus topics harvested from spurious referenceContent
  let activeWordBank: string[] = Array.from(
    new Set([
      ...(Array.isArray(payload.wordBank) ? payload.wordBank.map((w) => stripOrphanTypographicalMarkers(String(w).trim())).filter(Boolean) : []),
      ...wordBankTopics.map(stripOrphanTypographicalMarkers).filter(Boolean),
    ])
  );

  // Invariante estricta: Si la actividad consiste en responder preguntas sobre material de consulta (referenceContent presente),
  // wordBank debe inicializarse vacío ([]).
  if (referenceContent && sanitizedItems.length > 0) {
    activeWordBank = [];
  }

  // Discard fictitious wordBank on checklists or selection tasks
  if (isChecklistDirective || payload.interactionType === 'selection' || (payload.interactionType === 'multiple_choice' && !isBijectiveMatching)) {
    activeWordBank = [];
  }

  let finalItems = sanitizedItems;
  let finalIsGraded = payload.isGraded !== undefined ? Boolean(payload.isGraded) : true;
  if (isChecklistDirective && /true for you|about yourself|your opinion|para ti/i.test(`${rawTitle} ${rawInstruction}`)) {
    finalIsGraded = false;
  }
  let finalInteractionType = payload.interactionType || 'fill_blanks';

  // Clean checklist items from orphan letter markers (e.g. "be married F" -> "be married")
  if (isChecklistDirective || payload.interactionType === 'selection') {
    finalItems = finalItems.map((it) => {
      let p = it.prompt.replace(/^(?:item\s*)?\d+[.)]\s*/i, '').trim();
      p = p.replace(/\s+[A-L]$/, '').trim();
      return {
        ...it,
        prompt: p || it.prompt,
        expectedAnswer: '',
        acceptedAnswers: [],
      };
    });
  }

  // 0. FREE WRITING OR REFLECTIVE GRAMMAR ANALYSIS TASKS
  const writingDirectiveRegex = /\b(?:write|draft|compose|produce)\s+(?:an?\s+)?(?:profile|paragraph|summary|description|email|letter|story|review|essay|biography|post|short\s+text|text)\b/i;
  const isAnalysisQuestionDirective = /\b(?:how\s+(?:are|do|is|can)|why\s+(?:do|does|is|are|did)|what\s+is\s+the\s+difference|explain\s+(?:how|why|the\s+difference)|in\s+what\s+way|compare\s+(?:the\s+)?(?:questions?|sentences?|forms?))\b/i.test(rawContextDirective);
  const isWritingTask = writingDirectiveRegex.test(rawContextDirective) ||
    isAnalysisQuestionDirective ||
    payload.interactionType === 'writing';
  let finalGuidelines: string[] = Array.isArray(payload.guidelines) && payload.guidelines.length > 0
    ? payload.guidelines.map((g) => stripOrphanTypographicalMarkers(String(g).trim())).filter(Boolean)
    : [];

  if (isWritingTask) {
    finalInteractionType = 'writing';
    finalIsGraded = false; // Writing tasks receive formative feedback rather than binary scores

    // Rescue context sentences or questions mistakenly extracted into wordBank
    if (activeWordBank.length > 0) {
      const hasSentencesInWordBank = activeWordBank.some((w) => w.includes('?') || w.split(/\s+/).length >= 4);
      if (hasSentencesInWordBank && !referenceContent) {
        referenceContent = activeWordBank.join('\n');
      }
      activeWordBank = [];
    }

    // Extract procedural steps / guidelines deterministically
    if (finalGuidelines.length === 0) {
      finalGuidelines = generateDeterministicGuidelines(
        instruction,
        rawTitle,
        activeWordBank
      );
    }

    if (finalGuidelines.length === 0) {
      const stepMatches = `${rawInstruction}\n${cleanedRawRef || ''}`.match(/(?:^|\n|\s)(?:\*{0,2}\(?[a-fA-F][).:]\*{0,2})\s+([^\n]+)/g);
      if (stepMatches && stepMatches.length > 1) {
        finalGuidelines = stepMatches.map((m) => stripOrphanTypographicalMarkers(m.replace(/^[*\s(a-fA-F).:]+/, '').trim())).filter(Boolean);
      } else if (sanitizedItems.length > 0 && !isAnalysisQuestionDirective) {
        finalGuidelines = sanitizedItems
          .map((it) => stripOrphanTypographicalMarkers(it.prompt.replace(/^\d+[.)]\s*/, '').trim()))
          .filter((p) => p && !/^\d+$/.test(p));
      } else if (activeWordBank.length > 0) {
        finalGuidelines = activeWordBank.map((w) => `Include topic/phrase: ${w}`);
      }
    }

    finalGuidelines = finalGuidelines.map(stripOrphanTypographicalMarkers).filter(Boolean);

    // Partition multi-phase instruction (e.g. a -> instruction, b -> followUpPrompt)
    const partitioned = partitionWritingInstruction(instruction, followUpPrompt);
    instruction = partitioned.instruction;
    if (partitioned.followUpPrompt) {
      followUpPrompt = partitioned.followUpPrompt;
    }

    // If there is still a pair work or speaking discussion step among guidelines, populate followUpPrompt
    if (!followUpPrompt) {
      const followUpRegex = /\b(?:work in pairs|discuss in pairs|ask each other|share (?:with|your)|read your partner|compare with|tell your partner)\b/i;
      const followUpIndex = finalGuidelines.findIndex((g) => followUpRegex.test(g));
      if (followUpIndex !== -1) {
        followUpPrompt = finalGuidelines[followUpIndex];
        // Retain in guidelines if guidelines are few, or let followUpPrompt display it distinctly
      } else {
        const promptFollowUpMatch = `${instruction}\n${cleanedRawRef || ''}`.match(/(?:^|\n|[;.]\s*)(?:\*{0,2}\(?[c-fC-F][).:]\*{0,2}\s*)([^\n]+(?:pair|discuss|partner|class|share|ask)[^\n]*)/i);
        if (promptFollowUpMatch && promptFollowUpMatch[1]?.trim()) {
          followUpPrompt = promptFollowUpMatch[1].trim();
        }
      }
    }

    finalItems = [];
    if (!isAutonomousReadingContent(cleanedRawRef) && !(cleanedRawRef && (cleanedRawRef.includes('?') || /^\(?\d+[.)]/m.test(cleanedRawRef)))) {
      referenceContent = null; // Full stage width
    }
  } else if (isOpenProductionTask) {
    // Harvest any conceptual support topics wrongly extracted as item prompts
    // (e.g. prompt: "personal details", prompt: "family", prompt: "work/study")
    for (const it of sanitizedItems) {
      const cleanP = it.prompt.replace(/^\d+[.)]\s*/, '').trim();
      const isQuestion = cleanP.includes('?') || /^(?:what|where|when|who|why|how|do|did|is|are|can|have|has)\b/i.test(cleanP);
      if (!isQuestion && cleanP.length <= 40 && !cleanP.includes('___')) {
        if (!activeWordBank.includes(cleanP) && cleanP.length > 1) {
          activeWordBank.push(cleanP);
        }
      }
    }

    // Check if an item provides a model solved question (e.g. "Where are you from?")
    const sampleItem = sanitizedItems.find((it) => {
      const fullText = `${it.prompt} ${it.expectedAnswer}`;
      return it.isExample || fullText.includes('?') || /^(?:what|where|when|who|why|how|do|did|is|are|can|have|has)\b/i.test(it.expectedAnswer || '');
    });

    const sampleQuestion = sampleItem
      ? (sampleItem.expectedAnswer?.includes('?')
          ? sampleItem.expectedAnswer.trim()
          : (sampleItem.prompt.includes('?')
              ? sampleItem.prompt.replace(/^\d+[.)]\s*/, '').trim()
              : (sampleItem.expectedAnswer?.trim() || '')))
      : '';

    // Generate exactly the targetItemCount (N) numbered open items
    const openItems: typeof sanitizedItems = [];
    for (let i = 1; i <= targetItemCount; i++) {
      if (i === 1 && sampleQuestion) {
        openItems.push({
          prompt: `1. (e.g. ${sampleQuestion})`,
          expectedAnswer: sampleQuestion,
          acceptedAnswers: [sampleQuestion],
          isExample: true,
          explanation: '',
          options: undefined,
        });
      } else {
        openItems.push({
          prompt: `${i}.`,
          expectedAnswer: '',
          acceptedAnswers: [],
          isExample: false,
          explanation: '',
          options: undefined,
        });
      }
    }

    finalItems = openItems;
    finalIsGraded = false; // Personalized open production is not graded
    finalInteractionType = 'fill_blanks';
    referenceContent = null; // Strictly full width
  } else if (payload.interactionType === 'reference') {
    // Consolidate complementary support phrases or vocabulary into referenceContent for speaking cards
    const existingRef = referenceContent || '';
    const supportPhrases = sanitizedItems
      .map((it) => it.prompt.replace(/_{2,}/g, '').trim())
      .filter((p) => p && p.length > 3 && !existingRef.includes(p));

    const extraWords = activeWordBank.filter((w) => w && w.length > 1 && !existingRef.includes(w));

    const parts: string[] = [];
    if (existingRef) {
      parts.push(existingRef);
    }
    if (supportPhrases.length > 0) {
      parts.push(`Useful phrases / Support sentences:\n${supportPhrases.map((p) => `• ${p}`).join('\n')}`);
    } else if (extraWords.length > 0) {
      parts.push(`Useful vocabulary:\n${extraWords.map((w) => `• ${w}`).join('\n')}`);
    }

    if (parts.length > 0) {
      referenceContent = stripPredictiveSpoilers(
        stripLeadingDuplicateTitle(stripMetaComments(parts.join('\n\n')), title),
        contextDirective
      );
    }
  }

  // Principio Universal de Densidad Máxima por Diapositiva (Slide Ergonomics & Cognitive Load):
  // Al digitalizar cualquier actividad interactiva basada en un texto o diálogo de referencia:
  // El material de lectura se mantiene 100% íntegro, mientras que la batería interactiva se delimita a
  // una muestra focalizada y representativa (máximo 8 reactivos) para evitar la saturación visual en dos columnas.
  if ((referenceContent || payload.contextBody) && finalItems.length > 8) {
    finalItems = finalItems.slice(0, 8);
  }

  // Detection and sanitization of verification audio ("Listen and check", "R1.2", "CD1 Track X")
  const combinedSearchText = `${title} ${instruction} ${followUpPrompt || ''} ${referenceContent || ''} ${finalItems.map((i) => i.prompt).join(' ')}`;

  if (!audioLabel) {
    const trackPattern = /\b(?:(?:CD\s*\d+\s*)?Track\s*(\d+(?:\.\d+)?)|(R\d+\.\d+)|(?:Audio\s*(\d+(?:\.\d+)?)))\b/i;
    const trackMatch = combinedSearchText.match(trackPattern);
    if (trackMatch) {
      audioLabel = trackMatch[0].trim();
    } else {
      const listenCheckMatch = combinedSearchText.match(/listen\s+(?:and|&|to)\s+check(?:\s+your\s+answers)?(?:\s*\[?([A-Z0-9.\s]+)\]?)?/i);
      if (listenCheckMatch) {
        if (listenCheckMatch[1]?.trim()) {
          audioLabel = listenCheckMatch[1].trim();
        } else {
          const decimalMatch = combinedSearchText.match(/\b([1-9]\.\d{1,2})\b/);
          if (decimalMatch) {
            audioLabel = decimalMatch[1].trim();
          } else {
            audioLabel = 'Audio';
          }
        }
      }
    }
  }

  const hasListenReference = /listen\s+(?:and|&|to)\s+check/i.test(combinedSearchText) || Boolean(audioLabel);
  if (hasListenReference && !verificationAudioUrl) {
    const slug = audioLabel ? audioLabel.replace(/[^a-zA-Z0-9.-]+/g, '_') : 'verification';
    verificationAudioUrl = `/audio/${slug}.mp3`;
  }

  return {
    title,
    instruction: instruction || undefined,
    followUpPrompt: followUpPrompt || undefined,
    referenceContent,
    wordBank: activeWordBank.length > 0 ? activeWordBank : [],
    interactionType: (() => {
      if (isWritingTask) {
        return 'writing';
      }
      if (isSelectionDirective || payload.interactionType === 'selection') {
        return 'selection';
      }
      if (isBijectiveMatching && finalItems.length > 0 && !isOpenProductionTask) {
        return 'matching';
      }
      if (isIdentifyDirective && finalItems.length > 0 && !isOpenProductionTask) {
        return 'multiple_choice';
      }
      return finalInteractionType;
    })(),
    guidelines: finalGuidelines.length > 0 ? finalGuidelines : undefined,
    minWords: typeof payload.minWords === 'number' ? payload.minWords : undefined,
    maxWords: typeof payload.maxWords === 'number' ? payload.maxWords : undefined,
    buckets: (() => {
      const explicit = Array.isArray(payload.buckets)
        ? payload.buckets.map((b) => String(b).trim()).filter(Boolean)
        : [];
      if (explicit.length > 0) return explicit;
      if (payload.interactionType === 'buckets') {
        const inferred = Array.from(
          new Set(items.map((it) => String(it.expectedAnswer || '').trim()).filter(Boolean))
        );
        if (inferred.length > 0) return inferred;
      }
      return undefined;
    })(),
    items: finalItems,
    tableHeaders,
    tableRows,
    tableData: Array.isArray(payload.tableData) && payload.tableData.length > 0
      ? payload.tableData
          .map((col) => ({
            header: String(col?.header || '').trim(),
            items: Array.isArray(col?.items)
              ? col.items.map((it) => String(it).trim()).filter(Boolean)
              : [],
          }))
          .filter((col) => col.header.length > 0 || col.items.length > 0)
      : undefined,
    isGraded: finalIsGraded,
    verificationAudioUrl: verificationAudioUrl || undefined,
    audioLabel: audioLabel || undefined,
    visualImageIndices: Array.isArray(payload.visualImageIndices)
      ? payload.visualImageIndices
          .map((n) => Number(n))
          .filter((n) => !isNaN(n) && n > 0)
      : undefined,
    contextBody: payload.contextBody || undefined,
    allowMultiple: payload.allowMultiple !== undefined ? Boolean(payload.allowMultiple) : undefined,
  };
}

function cloneSampleBlocks(sourceImageSnippetUrl?: string, sourceImages?: string[]): ExtractedBlock[] {
  const fallback = createManualBlock('input_fields');
  fallback.sourceImageSnippetUrl = sourceImageSnippetUrl;
  fallback.sourceImages = sourceImages || (sourceImageSnippetUrl ? [sourceImageSnippetUrl] : undefined);
  if (fallback.parsedData) {
    fallback.parsedData.images = fallback.sourceImages;
    fallback.parsedData.imageUrl = fallback.sourceImageSnippetUrl;
  }
  return [fallback];
}
