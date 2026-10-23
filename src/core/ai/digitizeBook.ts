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
            description: 'Passive consultation material: literal reading passage, dialogue, grammar rule table, or vocabulary collocation chart. MUST be null if the clipping is an interactive exercise (even with verification audio) or has no autonomous reading text. Audio for exercises belongs strictly in interaction.verificationAudioUrl.',
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
              instruction: { type: 'string', description: 'Instruction for reference table or oral activity if applicable' },
              model: {
                type: 'string',
                description: 'For speaking / communicative tasks: the model sentence, speech frame or question pattern provided in the clipping (verbatim, e.g. "Do you know anyone who travels a lot for work? Where do they go?"). Strictly forbidden to paraphrase or generate synthetic prose.'
              },
              cues: {
                type: 'array',
                items: { type: 'string' },
                description: 'For speaking / communicative tasks: discrete list of lexical cues, prompts, or target phrases to be used in the oral exchange.'
              },
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
              guidelines: { type: 'array', items: { type: 'string' }, description: 'ONLY include guidelines if explicitly and visibly printed in the textbook clipping. NEVER invent synthetic steps, checklists or guidelines!' },
              minWords: { type: 'integer', description: 'ONLY include if an explicit minimum word count target is visibly printed in the clipping (e.g. "Write at least 100 words"). NEVER invent arbitrary word counts!' },
              maxWords: { type: 'integer', description: 'ONLY include if an explicit maximum word count is visibly printed in the clipping. NEVER invent arbitrary word counts!' },
              placeholder: { type: 'string' },
              evaluationRubric: { type: 'string' }
            },
            required: ['type', 'id', 'instruction']
          },
          metadata: {
            type: 'object',
            description: 'Optional slide metadata or diagnostic notifications (e.g. diagnostics: { unresolvedContextReference: boolean })'
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
 * Normaliza y preserva marcadores de posición canónicos en textos de lectura o referencia
 * (e.g. superscripts ¹, ², números de hueco [1], [ 1 ], o anclas numéricas al inicio de párrafo)
 * asegurando el formato canónico visible '[ 1 ]', '[ 2 ]', '[ 3 ]' y prohibiendo su purga.
 */
export function canonicalizeReferencePositionMarkers(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let normalized = text;

  // 1. Superscripts ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ¹⁰ -> [ 1 ], [ 2 ], etc.
  const superscriptMap: Record<string, string> = {
    '¹': '[ 1 ]',
    '²': '[ 2 ]',
    '³': '[ 3 ]',
    '⁴': '[ 4 ]',
    '⁵': '[ 5 ]',
    '⁶': '[ 6 ]',
    '⁷': '[ 7 ]',
    '⁸': '[ 8 ]',
    '⁹': '[ 9 ]',
    '¹⁰': '[ 10 ]',
  };
  normalized = normalized.replace(/[¹²³⁴⁵⁶⁷⁸⁹]|¹⁰/g, (m) => superscriptMap[m] || m);

  // 2. Circled digits ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ -> [ 1 ], [ 2 ], etc.
  const circledMap: Record<string, string> = {
    '①': '[ 1 ]', '②': '[ 2 ]', '③': '[ 3 ]', '④': '[ 4 ]', '⑤': '[ 5 ]',
    '⑥': '[ 6 ]', '⑦': '[ 7 ]', '⑧': '[ 8 ]', '⑨': '[ 9 ]', '⑩': '[ 10 ]',
  };
  normalized = normalized.replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, (m) => circledMap[m] || m);

  // 3. Brackets con números: [1], [ 1 ], [  1  ] -> [ 1 ]
  normalized = normalized.replace(/\[\s*(\d{1,2})\s*\]/g, '[ $1 ]');

  // 4. Marcadores de plantilla tipo {{1}}, [blank 1], [gap 1] -> [ 1 ]
  normalized = normalized.replace(/\{\{\s*(\d{1,2})\s*\}\}/g, '[ $1 ]');
  normalized = normalized.replace(/\[\s*(?:blank|gap)\s*(\d{1,2})\s*\]/gi, '[ $1 ]');

  // 5. Huecos numéricos al inicio de párrafo o diálogo: e.g. "(1) " o "1 ___" al inicio de línea
  normalized = normalized.replace(/(?:^|\n\n?)\s*\((\d{1,2})\)\s+/g, (match, d) => {
    const prefix = match.startsWith('\n\n') ? '\n\n' : match.startsWith('\n') ? '\n' : '';
    return `${prefix}[ ${d} ] `;
  });
  normalized = normalized.replace(/(?:^|\n\n?)\s*(\d{1,2})\s*_{2,}\s*/g, (match, d) => {
    const prefix = match.startsWith('\n\n') ? '\n\n' : match.startsWith('\n') ? '\n' : '';
    return `${prefix}[ ${d} ] `;
  });

  return normalized;
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

    // Preservación y normalización canónica de marcadores de posición [ 1 ], [ 2 ], etc.
    if (typeof ref.content === 'string') {
      ref.content = canonicalizeReferencePositionMarkers(ref.content);
    }
    if (typeof ref.body === 'string') {
      ref.body = canonicalizeReferencePositionMarkers(ref.body);
    }
    if (!ref.category || !['reading', 'grammar_note', 'instructions', 'dialogue'].includes(ref.category)) {
      if (ref.category === 'grammar_reference' || ref.category === 'grammar_rules' || ref.category === 'theory') {
        ref.category = 'grammar_note';
      } else if (ref.category === 'reading_passage' || ref.category === 'passage' || ref.category === 'article') {
        ref.category = 'reading';
      } else if (ref.category === 'conversation') {
        ref.category = 'dialogue';
      } else {
        ref.category = 'reading';
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
 * Normaliza una cabecera de categoría o texto para preservar 'sentence case',
 * evitando conversiones involuntarias a mayúsculas sostenidas.
 */
export function toSentenceCase(str?: string): string {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';

  const prefixMatch = trimmed.match(/^([A-Za-z\d]+)\s*[·:-]\s*(.*)$/);
  if (prefixMatch) {
    const id = prefixMatch[1];
    const rest = prefixMatch[2].trim();
    return `${id} · ${toSentenceCase(rest)}`;
  }

  if (trimmed === trimmed.toUpperCase() && trimmed.length > 2 && /[A-Z]/.test(trimmed)) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  return trimmed;
}

export interface ExtractedCategoryBucket {
  id: string;
  label: string;
  items: Array<{
    id?: string;
    text: string;
    correctBucketId?: string;
    isExample?: boolean;
    [key: string]: any;
  }>;
  headerStart?: number;
  _exampleMarker?: string;
}

/**
 * Detección y Extracción Estructural de Categorías Receptores (Buckets).
 * Detecta patrones secuenciales de encabezados de categoría delimitados por letras, números o viñetas
 * y mapea cada coincidencia como un bucket independiente:
 *   id: match[1],
 *   label: `${match[1]} · ${cleanLabel}`,
 *   items: []
 * Prohíbe terminantemente que el texto explicativo de las categorías sea concatenado en 'instruction' o 'prompt'.
 * Si bajo la definición de una categoría existen marcadores ordinales de muestra (e.g. '1', '1.', 'example'),
 * identifica el ítem correspondiente del corpus referencial y lo inserta en el contenedor meta con isExample: true.
 */
export function extractCategoryBucketsFromText(
  text?: string,
  referenceCorpus?: string | string[] | Array<{ id?: string; text?: string; prompt?: string; [key: string]: any }>
): ExtractedCategoryBucket[] {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Enmascaramiento de rangos alfanuméricos (e.g. 'A–C', '1–5') para proteger su integridad
  const preservedRanges: string[] = [];
  const rangeRegex = /\b(?:\d+\s*(?:[-–—]|\bto\b)\s*\d+|[a-zA-Z]\s*(?:[-–—]|\bto\b)\s*[a-zA-Z])\b/g;
  const protectedText = trimmed.replace(rangeRegex, (match) => {
    preservedRanges.push(match);
    return `__RANGE_MARKER_${preservedRanges.length - 1}__`;
  });
  const restoreRanges = (s: string) =>
    s.replace(/__RANGE_MARKER_(\d+)__/g, (_, idx) => preservedRanges[Number(idx)] || '');

  // Detección de posibles cabeceras de categoría: letras [A-Z] o dígitos \d+
  // Delimitados por inicio, salto de línea o espacios.
  // Los dígitos después de dos puntos (: 1) se excluyen para no confundir ejemplos con categorías
  const headerRegex = /(?:^|(?<=\s))([A-Z])[\.\):]?\s+|(?:^|(?<![:–—]\s*)(?<=\s))(\d+)[\.\):]?\s+/g;

  const allHeaders: Array<{
    id: string;
    upperId: string;
    headerStart: number;
    contentStart: number;
    fullMatch: string;
  }> = [];

  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(protectedText)) !== null) {
    const rawId = m[1] || m[2];
    const fullMatch = m[0];
    const headerStart = m.index + (fullMatch.length - fullMatch.trimStart().length);
    const contentStart = m.index + fullMatch.length;
    allHeaders.push({
      id: rawId,
      upperId: rawId.toUpperCase(),
      headerStart,
      contentStart,
      fullMatch,
    });
  }

  // Buscar la mejor subsecuencia secuencial de al menos 2 categorías (A -> B -> C o 1 -> 2 -> 3)
  let bestSequence: typeof allHeaders = [];
  for (let i = 0; i < allHeaders.length; i++) {
    const currentSeq = [allHeaders[i]];
    for (let j = i + 1; j < allHeaders.length; j++) {
      const prev = currentSeq[currentSeq.length - 1];
      const curr = allHeaders[j];

      const isLetterSeq =
        /^[A-Z]$/.test(prev.upperId) &&
        /^[A-Z]$/.test(curr.upperId) &&
        curr.upperId.charCodeAt(0) === prev.upperId.charCodeAt(0) + 1;
      const isNumSeq =
        /^\d+$/.test(prev.id) &&
        /^\d+$/.test(curr.id) &&
        Number(curr.id) === Number(prev.id) + 1;

      if (isLetterSeq || isNumSeq) {
        currentSeq.push(curr);
      }
    }
    if (currentSeq.length > bestSequence.length) {
      bestSequence = currentSeq;
    }
  }

  if (bestSequence.length < 2) {
    return [];
  }

  // Parsear corpus referencial si se proporciona
  let parsedCorpus: Array<{ id: string; text: string; raw: any }> = [];
  if (Array.isArray(referenceCorpus)) {
    parsedCorpus = referenceCorpus.map((item, idx) => {
      if (typeof item === 'string') {
        const ordMatch = item.match(/^(\d+)[.)]?\s*(.*)$/);
        return {
          id: ordMatch ? ordMatch[1] : String(idx + 1),
          text: ordMatch ? ordMatch[2].trim() || item.trim() : item.trim(),
          raw: item.trim(),
        };
      }
      return {
        id: String(item.id || idx + 1),
        text: String(item.text || item.prompt || '').trim(),
        raw: item,
      };
    });
  } else if (typeof referenceCorpus === 'string' && referenceCorpus.trim()) {
    const lines = referenceCorpus.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    parsedCorpus = lines.map((l, idx) => {
      const ordMatch = l.match(/^(\d+)[.)]?\s*(.*)$/);
      return {
        id: ordMatch ? ordMatch[1] : String(idx + 1),
        text: ordMatch ? ordMatch[2].trim() || l : l,
        raw: l,
      };
    });
  }

  const buckets: ExtractedCategoryBucket[] = [];
  const assignedExampleItemIds = new Set<string>();

  for (let k = 0; k < bestSequence.length; k++) {
    const curr = bestSequence[k];
    const next = bestSequence[k + 1];
    const rawContent = next
      ? protectedText.slice(curr.contentStart, next.headerStart)
      : protectedText.slice(curr.contentStart);

    let content = restoreRanges(rawContent).trim();

    // Detección de marcadores ordinales de ejemplo (e.g. ': 1', ': 1.', '(1)', '(example: 1)', ': example')
    let exampleMarker: string | null = null;
    const exMatch = content.match(
      /(?:[:–—]\s*(?:example\s*)?(\d+[\.\)]?|\bexample\b)|\((?:example[:\s]*)?(\d+[\.\)]?)\))\s*$/i
    );
    if (exMatch) {
      exampleMarker = (exMatch[1] || exMatch[2] || 'example').replace(/[\.\)]/g, '').trim();
      content = content.slice(0, exMatch.index).trim();
    } else {
      content = content.replace(/[:–—\s]+$/, '').trim();
    }

    const normalized = toSentenceCase(content);
    const cleanLabel = normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '';
    const bucketItems: any[] = [];

    // Inserción de ejemplo pre-resuelto en el contenedor meta con isExample: true
    if (exampleMarker && parsedCorpus.length > 0) {
      let matchedItem: { id: string; text: string; raw: any } | null = null;
      if (exampleMarker.toLowerCase() === 'example') {
        matchedItem = parsedCorpus[0];
      } else {
        matchedItem = parsedCorpus.find((c) => c.id === exampleMarker || c.text.startsWith(exampleMarker)) || null;
        if (!matchedItem && /^\d+$/.test(exampleMarker)) {
          const idx = parseInt(exampleMarker, 10) - 1;
          if (idx >= 0 && idx < parsedCorpus.length) {
            matchedItem = parsedCorpus[idx];
          }
        }
      }

      if (matchedItem) {
        assignedExampleItemIds.add(matchedItem.id);
        bucketItems.push({
          id: matchedItem.id,
          text: matchedItem.text,
          correctBucketId: curr.id,
          isExample: true,
        });
      }
    }

    buckets.push({
      id: curr.id,
      label: `${curr.id} · ${cleanLabel}`,
      items: bucketItems,
      headerStart: curr.headerStart,
      _exampleMarker: exampleMarker || undefined,
    });
  }

  if (parsedCorpus.length > 0) {
    const unassigned = parsedCorpus.filter((item) => !assignedExampleItemIds.has(item.id));
    Object.defineProperty(buckets, 'unassignedItems', {
      value: unassigned,
      enumerable: false,
      writable: true,
    });
  }

  return buckets;
}

/**
 * Isolates the canonical pedagogical directive in instructions or subtitles,
 * pruning any child reactive items, numbered sequences, or slash-delimited breakdowns
 * that leaked into the instruction node (Instruction Isolation Principle).
 */
export function isolateCanonicalInstruction(text?: string): string {
  if (!text || typeof text !== 'string') return '';
  let trimmed = text.trim();
  if (!trimmed) return '';

  // Proteger rangos numéricos y alfabéticos unidos por guion, guion corto, en-dash o 'to' (e.g. '1–5', '1-5', '1 to 5', 'A–D', 'a–d')
  // para evitar que la presencia de dígitos con guion sea interpretada como inicio de ítem filtrado o genere un truncamiento con ':'
  const preservedRanges: string[] = [];
  const rangeRegex = /\b(?:\d+\s*(?:[-–—]|\bto\b)\s*\d+|[a-zA-Z]\s*(?:[-–—]|\bto\b)\s*[a-zA-Z])\b/g;
  const protectedText = trimmed.replace(rangeRegex, (match) => {
    preservedRanges.push(match);
    return `__RANGE_MARKER_${preservedRanges.length - 1}__`;
  });

  const restoreRanges = (s: string) =>
    s.replace(/__RANGE_MARKER_(\d+)__/g, (_, idx) => preservedRanges[Number(idx)] || '');

  // Poda Canónica de la Consigna: Si la consigna contiene incrustada la declaración de las categorías,
  // podar dichas definiciones dejando únicamente la directiva principal (e.g., 'Match the sentences to categories A–C.')
  const detectedBuckets = extractCategoryBucketsFromText(protectedText);
  if (detectedBuckets.length >= 2) {
    const firstHeaderStart = detectedBuckets[0].headerStart;
    if (typeof firstHeaderStart === 'number') {
      const prefix = protectedText.slice(0, firstHeaderStart).trim();
      if (!prefix) return '';
      let candidateDirective = restoreRanges(prefix).trim();
      candidateDirective = candidateDirective.replace(/[:–—\s]+$/, '');
      if (!candidateDirective.endsWith('.') && !candidateDirective.endsWith('?') && !candidateDirective.endsWith('!')) {
        candidateDirective += '.';
      }
      return candidateDirective;
    }
  }

  // Has child items / delimiters signature
  const hasChildLeak =
    /[\/]|(?:^|\s+)(?:\b\d+[.)]|\(\d+\)|\bitem\s*\d+\b)\s+.*?(?:[\/]|(?:\b\d+[.)]|\(\d+\)|\bitem\s*\d+\b)\s+)|_{2,}|\{\{\s*blank\s*\}\}|\[\s*(?:blank|\?)\s*\]|[:–—]\s*(?:\b\d+[.)]|\(\d+\)|_{2,}|\{\{)/i.test(
      protectedText
    );
  if (!hasChildLeak) return trimmed;

  // 1. Pure leaked item without directive (e.g. "1. work in a school / an office / a receptionist")
  if (/^(?:\(?\d+[.)]?\s*|[a-z][.)]\s*)(?:.*?\s*\/\s*.*)$/i.test(protectedText)) {
    return '';
  }

  // 2. Directive followed by colon/dash and slash breakdown or numbered item
  const colonMatch = protectedText.match(/^([^:\n]+?)\s*[:–—]\s*(.*)$/);
  if (colonMatch && colonMatch[1].trim().length >= 5) {
    const candidateDirective = restoreRanges(colonMatch[1].trim());
    const rest = colonMatch[2].trim();
    if (/[\/]|\b\d+[.)]|\(\d+\)|_{2,}|\{\{\s*blank/i.test(rest)) {
      return candidateDirective.endsWith(':') ? candidateDirective : `${candidateDirective}:`;
    }
  }

  // 3. Directive followed by numbered item e.g. "Choose the correct words. 1. Yesterday I was / were..."
  const numMatch = protectedText.match(
    /^([\s\S]+?)(?:\s*(?:[:;–—\n]\s*|\.\s+)(?:\(?\d+[.)]|\b\d+[:.-]|\bitem\s*\d+)\s+|\s+(?:\(?\d+[.)]|\b\d+[:.-])\s+[a-zA-Z])/i
  );
  if (numMatch && numMatch[1].trim().length >= 5) {
    const candidateDirective = restoreRanges(numMatch[1].trim());
    if (trimmed.includes(':') && !candidateDirective.endsWith(':') && !candidateDirective.endsWith('.')) {
      return `${candidateDirective}:`;
    }
    return candidateDirective.endsWith('.') || candidateDirective.endsWith(':') || candidateDirective.endsWith('?')
      ? candidateDirective
      : `${candidateDirective}.`;
  }

  // 4. Directive sentence followed by slash tokens
  const sentenceSlashMatch = protectedText.match(/^([^.?!]+[.?!])\s+(?:.*?\s*\/\s*.*)$/);
  if (sentenceSlashMatch && sentenceSlashMatch[1].trim().length >= 5) {
    return restoreRanges(sentenceSlashMatch[1].trim());
  }

  return trimmed;
}

/**
 * Limpia el texto de una pregunta o enunciado de selección:
 * - Elimina tokens espurios de completación como '[ ? ]', '[?]', etc.
 * - Si es una pregunta directa o ancla, elimina marcadores de hueco como '{{blank}}', '[blank]' o '___'.
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

  // 4. Neutralización de marcadores de hueco en nodos raíz / anclas:
  // Si el prompt termina con un marcador de hueco (e.g. "work in {{blank}}" o "work in: {{blank}}"),
  // o si es una base ancla, podar el marcador residual para mantener el string verbatim limpio
  cleaned = cleaned.replace(/\s*(?:\{\{\s*blank\s*\}\}|\[\s*blank\s*\]|\[\s*\?\s*\]|_{2,})\s*$/gi, '').trim();

  // 5. Normalizar espacios en blanco y puntuación
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
 * Cleans input field prompts from orphan or broken gap markers like [blank] or [?],
 * replacing them with canonical {{blank}} markers.
 */
export function cleanInputBlankMarkers(prompt: string): string {
  if (!prompt || typeof prompt !== 'string') return '';
  return prompt
    .replace(/\[\s*(?:blank|\?)\s*\]/gi, '{{blank}}')
    .replace(/_{3,}/g, '{{blank}}');
}

/**
 * Strips bracketed gap tokens from expected answer strings.
 */
export function cleanTokenString(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\[\s*(?:blank|\?)\s*\]|\{\{\s*blank\s*\}\}|_{2,}/gi, '').trim();
}

/**
 * Detects whether a text or reference block corresponds to an Answer Key / Solucionario / Teacher's Notes
 * rather than an autonomous reading text for students.
 */
export function isAnswerKeyContent(
  text?: string,
  title?: string,
  subtitle?: string
): boolean {
  if (!text && !title && !subtitle) return false;

  const headerText = `${title || ''} ${subtitle || ''}`.trim();
  const isDirectivePhrase = /\b(?:answer\s+(?:the|each|these|your|all)|check\s+(?:your\s+)?answers?|write\s+(?:your\s+)?answers?|ask\s+and\s+answer|questions?\s+and\s+answers?|short\s+answers?)\b/i.test(headerText);

  const hasKeyHeader = !isDirectivePhrase && (
    /\b(?:answer\s*keys?|teacher'?s?\s*(?:notes?|book|guide)|marking\s*scheme|correction\s*key|solucionario|claves?(?:\s+de\s+respuestas?)?)\b/i.test(headerText) ||
    /^(?:answers?|key|claves|respuestas)\b/i.test((title || '').trim())
  );

  const cleanText = (text || '').trim();
  const textHasKeyHeader = /^(?:answers?|answer\s*key|key|solucionario|claves?(?:\s+de\s+respuestas?)?|teacher'?s?\s*(?:notes?|book|guide))\b/i.test(cleanText);

  // If text is multi-paragraph reading text or has dialogue speakers, it is NOT an answer key!
  if (cleanText.includes('\n\n') && cleanText.split(/\s+/).length > 25) {
    const paragraphs = cleanText.split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length >= 2 && !textHasKeyHeader) {
      return false;
    }
  }

  const lines = cleanText.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
  const keyPairRegex = /^(?:(?:exercise|act\.?|activity)?\s*[0-9]+[a-z]?[\)\.:\-]\s*)?(?:[0-9]+|[a-z])\s*[\)\.:\-]\s*([a-zA-Z0-9'’\s\-]{1,40})$/i;
  const matchingPairs = lines.filter((l) => keyPairRegex.test(l));

  const inlineMatches = cleanText.match(/(?:^|[\s,;|\n])\d+[\.\)\:\s-]\s*[a-zA-Z0-9'’\-]+(?:\s+[a-zA-Z0-9'’\-]+){0,4}(?=(?:[\s,;|\n]\d+[\.\)\:\s-]|$))/g);
  const inlineCount = inlineMatches ? inlineMatches.length : 0;

  if (hasKeyHeader && (matchingPairs.length >= 1 || inlineCount >= 1 || lines.length <= 15)) {
    return true;
  }
  if (textHasKeyHeader && (matchingPairs.length >= 1 || inlineCount >= 1 || cleanText.length <= 250)) {
    return true;
  }
  if (matchingPairs.length >= 2 && matchingPairs.length >= lines.length * 0.6) {
    return true;
  }
  if (inlineCount >= 3 && cleanText.split(/\s+/).length < inlineCount * 6) {
    return true;
  }

  return false;
}

/**
 * Detects whether an entire slide is an Answer Key / Teacher's Notes slide that should not be
 * emitted as an independent student slide.
 */
export function isAnswerKeySlide(slide: any): boolean {
  if (!slide || typeof slide !== 'object') return false;

  const title = (slide.title || '').trim();
  const subtitle = (slide.subtitle || '').trim();
  const headerText = `${title} ${subtitle}`.toLowerCase();

  // If slide has real student exercise interaction, it is an exercise slide, NOT an answer key slide
  if (slide.interaction) {
    if (slide.interaction.type === 'selection' && Array.isArray(slide.interaction.questions) && slide.interaction.questions.length > 0) {
      return false;
    }
    if (slide.interaction.options && Array.isArray(slide.interaction.options) && slide.interaction.options.length > 0) {
      return false;
    }
    if (slide.interaction.type === 'buckets_matching' && Array.isArray(slide.interaction.buckets) && slide.interaction.buckets.length > 0) {
      return false;
    }
    if (slide.interaction.type === 'sequence' && Array.isArray(slide.interaction.items) && slide.interaction.items.length > 0) {
      return false;
    }
    if (slide.interaction.type === 'input_fields' && Array.isArray(slide.interaction.listItems) && slide.interaction.listItems.length > 0) {
      const hasRealPrompts = slide.interaction.listItems.some((it: any) => {
        const p = (it.prompt || '').trim();
        return p.length > 25 || p.includes('{{blank}}') || p.includes('___') || p.includes('(');
      });
      if (hasRealPrompts) return false;
    }
  }

  const isDirectivePhrase = /\b(?:answer\s+(?:the|each|these|your|all)|check\s+(?:your\s+)?answers?|write\s+(?:your\s+)?answers?|ask\s+and\s+answer|questions?\s+and\s+answers?|short\s+answers?)\b/i.test(headerText);

  const hasKeyHeader = !isDirectivePhrase && (
    /\b(?:answer\s*keys?|teacher'?s?\s*(?:notes?|book|guide)|marking\s*scheme|correction\s*key|solucionario|claves?(?:\s+de\s+respuestas?)?)\b/i.test(headerText) ||
    /^(?:answers?|key|claves|respuestas)\b/i.test(title.trim())
  );

  const refText = (slide.referenceContent?.content || slide.referenceContent?.body || '').trim();
  const ctxText = (slide.contextBody || '').trim();
  const instText = (slide.interaction?.instruction || '').trim();

  if (hasKeyHeader) return true;

  if (!slide.interaction || (slide.interaction.type === 'writing' && !slide.interaction.guidelines)) {
    if (refText && isAnswerKeyContent(refText, title, subtitle)) return true;
    if (ctxText && isAnswerKeyContent(ctxText, title, subtitle)) return true;
    if (instText && isAnswerKeyContent(instText, title, subtitle)) return true;
  }

  return false;
}

/**
 * Universally parses all format-agnostic answer keys from textual material into a structured map:
 * { [sectionId: string]: { [itemIndex: string]: answerText } }
 */
export function parseAllAnswerKeys(text: string): Record<string, Record<string, string>> {
  if (!text || typeof text !== 'string') return {};
  const sections: Record<string, Record<string, string>> = {};
  let currentSection = 'default';

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/^(?:answer\s*keys?|answers?|solucionario|claves?(?:\s+de\s+respuestas?)?|teacher'?s?\s*(?:notes?|book|guide)|marking\s*scheme)\s*[:\.-]?\s*$/i.test(line)) {
      continue;
    }

    let workLine = line.replace(/^(?:answers?|answer\s*key|key|solucionario|claves?|teacher'?s?\s*notes?)\s*[:\.-]?\s*/i, '');

    const secWithKeyword = workLine.match(/^(?:exercise|act\.?|activity|part)\s*([0-9]+[a-z]?|[a-f])(?:\s*[\)\.:\-]\s*|\s+|$)(.*)$/i);
    const secAlphaNum = workLine.match(/^([0-9]+[a-z])\s*[\)\.:\-]\s*(.*)$/i);
    const secWithInternalNumbers = workLine.match(/^([0-9]+)\s*[\)\.:\-]\s*(\d+[\.\)\:\s-].*)$/i);

    const secMatch = secWithKeyword || secAlphaNum || secWithInternalNumbers;

    if (secMatch) {
      currentSection = secMatch[1].toLowerCase();
      workLine = (secMatch[2] || '').trim();
      workLine = workLine.replace(/^(?:answers?|answer\s*key|key|solucionario|claves?|teacher'?s?\s*notes?)\s*[:\.-]?\s*/i, '').trim();
    }

    if (!workLine) continue;

    if (!sections[currentSection]) sections[currentSection] = {};

    // 1. Numbered items: '1 tidy up 2 look after' or '1. b, 2. c' or '1: was' or full sentences
    const numRegex = /(?:^|[\s,;|\n]+)(\d+)[\.\)\:\s-]\s*(.+?)(?=(?:[\s,;|\n]+\d+[\.\)\:\s-]|$))/gi;
    let match: RegExpExecArray | null;
    let foundNumbered = false;
    while ((match = numRegex.exec(workLine)) !== null) {
      foundNumbered = true;
      const num = match[1];
      const val = match[2].trim().replace(/^[:\.-]\s*/, '').replace(/[,;]+$/, '').trim();
      if (val && !/^(?:answers?|key|solucionario)$/i.test(val)) {
        sections[currentSection][num] = val;
      }
    }

    // 2. Lettered items: 'a) lived b) saw' if no numbered items
    if (!foundNumbered) {
      const letterRegex = /(?:^|[\s,;|\n]+)([a-f])[\.\)\:\s-]\s*(.+?)(?=(?:[\s,;|\n]+[a-f][\.\)\:\s-]|$))/gi;
      let lMatch: RegExpExecArray | null;
      while ((lMatch = letterRegex.exec(workLine)) !== null) {
        const letter = lMatch[1].toLowerCase();
        const val = lMatch[2].trim().replace(/^[:\.-]\s*/, '').replace(/[,;]+$/, '').trim();
        if (val) {
          sections[currentSection][letter] = val;
        }
      }
    }
  }

  return sections;
}

/**
 * Extracts all answer keys from all fields of a slide.
 */
export function parseAllAnswerKeysFromSlide(slide: any): Record<string, Record<string, string>> {
  const texts: string[] = [];
  if (slide.referenceContent?.content) texts.push(slide.referenceContent.content);
  if (slide.referenceContent?.body) texts.push(slide.referenceContent.body);
  if (slide.contextBody) texts.push(slide.contextBody);
  if (slide.subtitle) texts.push(slide.subtitle);
  if (slide.title) texts.push(slide.title);
  if (slide.interaction?.instruction) texts.push(slide.interaction.instruction);

  if (slide.interaction && Array.isArray(slide.interaction.listItems)) {
    slide.interaction.listItems.forEach((it: any) => {
      if (it.expectedAnswer) {
        texts.push(`${it.prompt || it.id}: ${it.expectedAnswer}`);
      } else if (it.prompt) {
        texts.push(it.prompt);
      }
    });
  }

  if (slide.referenceContent && (slide.referenceContent.type === 'reference_table' || slide.referenceContent.type === 'table_reference')) {
    if (Array.isArray(slide.referenceContent.rows)) {
      slide.referenceContent.rows.forEach((row: any[]) => {
        if (Array.isArray(row) && row.length >= 2) {
          const k = String(typeof row[0] === 'string' ? row[0] : row[0]?.text || '').trim();
          const v = String(typeof row[1] === 'string' ? row[1] : row[1]?.text || '').trim();
          if (k && v) texts.push(`${k}: ${v}`);
        }
      });
    }
  }

  return parseAllAnswerKeys(texts.join('\n'));
}

/**
 * Aligns and injects answer key resolutions as Supreme Ground Truth into interactive items of a slide.
 */
export function applyAnswerKeysToSlide(
  slide: any,
  allKeys: Record<string, Record<string, string>>
): void {
  if (!slide || !slide.interaction) return;

  const title = (slide.title || '').trim().toLowerCase();
  const subtitle = (slide.subtitle || '').trim().toLowerCase();
  const instruction = (slide.interaction.instruction || '').trim().toLowerCase();
  const fullHeader = `${title} ${subtitle} ${instruction}`;

  let targetSection: Record<string, string> | null = null;

  for (const key of Object.keys(allKeys)) {
    if (key === 'default') continue;
    const keyRegex = new RegExp(`(?:\\b|exercise\\s*|act\\.?\\s*|part\\s*)${key}\\b`, 'i');
    if (keyRegex.test(fullHeader)) {
      targetSection = allKeys[key];
      break;
    }
  }

  if (!targetSection) {
    const nonDefaultKeys = Object.keys(allKeys).filter((k) => k !== 'default');
    if (nonDefaultKeys.length === 1) {
      targetSection = allKeys[nonDefaultKeys[0]];
    } else if (allKeys['default']) {
      targetSection = allKeys['default'];
    } else if (nonDefaultKeys.length > 0) {
      targetSection = allKeys[nonDefaultKeys[0]];
    }
  }

  if (!targetSection) return;

  // Apply to input_fields listItems
  if (slide.interaction.type === 'input_fields' && Array.isArray(slide.interaction.listItems)) {
    slide.interaction.listItems.forEach((item: any, idx: number) => {
      let numKey: string | null = null;
      if (item.prompt) {
        const match = item.prompt.match(/^(?:\(?(\d+)[.)]|\bitem\s*(\d+))/i);
        if (match) numKey = match[1] || match[2];
      }
      if (!numKey || !targetSection[numKey]) {
        const seq1 = String(idx + 1);
        const seq2 = String(idx + 2);
        if (targetSection[seq1]) numKey = seq1;
        else if (targetSection[seq2]) numKey = seq2;
      }

      if (numKey && targetSection[numKey]) {
        const official = targetSection[numKey].trim();
        item.expectedAnswer = official;
        item.acceptedAnswers = [official];
      }

      if (item.prompt) {
        if (isSentenceScrambleReactive(item.prompt, fullHeader)) {
          item.prompt = item.prompt.replace(/_{2,}|\[\s*(?:blank|\?)\s*\]|\{\{\s*blank\s*\}\}/gi, '').trim();
        } else {
          item.prompt = cleanInputBlankMarkers(item.prompt);
        }
      }
    });

    decoupleWordBankTokensAndPreserveContext(slide);
  }

  // Apply to selection questions
  if (slide.interaction.type === 'selection' && Array.isArray(slide.interaction.questions)) {
    slide.interaction.questions.forEach((q: any, idx: number) => {
      let numKey: string | null = null;
      const qText = q.prompt || q.question || '';
      const match = qText.match(/^(?:\(?(\d+)[.)]|\bitem\s*(\d+))/i);
      if (match) numKey = match[1] || match[2];

      if (!numKey || !targetSection[numKey]) {
        const seq1 = String(idx + 1);
        if (targetSection[seq1]) numKey = seq1;
      }

      if (numKey && targetSection[numKey]) {
        const official = targetSection[numKey].trim().toLowerCase();
        if (Array.isArray(q.options) && q.options.length > 0) {
          const letterMatch = official.match(/^([a-d])$/i);
          if (letterMatch) {
            const letterIdx = letterMatch[1].toLowerCase().charCodeAt(0) - 97;
            q.options.forEach((opt: any, oIdx: number) => {
              opt.isCorrect = oIdx === letterIdx;
            });
          } else {
            let matchedAny = false;
            q.options.forEach((opt: any) => {
              const optText = (opt.text || '').trim().toLowerCase();
              if (optText === official || official.includes(optText) || optText.includes(official)) {
                opt.isCorrect = true;
                matchedAny = true;
              } else {
                opt.isCorrect = false;
              }
            });
            if (!matchedAny && q.options.length > 0) {
              q.options[0].isCorrect = true;
            }
          }
        }
      }
    });
  }
}

/**
 * Detects whether reference content is solely a word bank / word box intended for insertion into blanks.
 */
export function isWordBankContent(ref: any, interaction?: any): boolean {
  if (!ref || typeof ref !== 'object') return false;

  // Never classify multi-paragraph reading passages or dialogues as word banks
  if (ref.category === 'reading' || ref.category === 'dialogue') {
    return false;
  }

  const title = (ref.title || '').trim().toLowerCase();
  const subtitle = (ref.subtitle || '').trim().toLowerCase();
  const category = (ref.category || '').trim().toLowerCase();
  const instruction = (ref.instruction || '').trim().toLowerCase();
  const headerText = `${title} ${subtitle} ${category} ${instruction}`;

  const hasWordBankHeader = /\b(?:word\s*bank|words?\s+(?:in|from)\s+the\s+box|box|vocabulary\s+box|words?\s+list|banco\s+de\s+palabras|caja\s+de\s+palabras)\b/i.test(headerText);

  if (ref.type === 'text') {
    const content = (ref.content || ref.body || '').trim();
    if (!content) return false;

    // Multi-paragraph texts are reading articles, never word banks
    if (content.includes('\n\n')) {
      return false;
    }

    if (hasWordBankHeader) return true;

    if (/^(?:word\s*bank|words?\s+(?:in|from)\s+the\s+box|box|vocabulary\s+box|banco\s+de\s+palabras)\b/i.test(content)) {
      return true;
    }

    if (interaction && (interaction.type === 'input_fields' || interaction.type === 'buckets_matching')) {
      if (Array.isArray(interaction.wordBank) && interaction.wordBank.length > 0) {
        const matchingBank = interaction.wordBank.filter((w: string) => content.toLowerCase().includes(w.toLowerCase()));
        if (matchingBank.length >= Math.min(2, interaction.wordBank.length)) {
          return true;
        }
      }

      const inst = `${interaction.instruction || ''} ${subtitle}`.toLowerCase();
      const mentionsBox = /\b(?:from|in)\s+the\s+box\b|\bword\s*bank\b/i.test(inst);

      if (mentionsBox) {
        const delimiters = /[\n,;|/•\-]+/;
        const parts = content.split(delimiters).map((p: string) => p.trim()).filter(Boolean);
        const isShortTerms = parts.length >= 2 && parts.every((p: string) => p.split(/\s+/).length <= 4 && p.length < 30);
        if (isShortTerms && content.split(/\s+/).length < 30) {
          return true;
        }
      }
    }
  }

  if (ref.type === 'reference_table' || ref.type === 'table_reference') {
    if (hasWordBankHeader) return true;
    if (Array.isArray(ref.columns) && ref.columns.length === 1) {
      const colHeader = (ref.columns[0]?.header || '').toLowerCase();
      if (/\b(?:word\s*bank|words?|vocabulary|box)\b/i.test(colHeader)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extracts individual candidate terms from a word bank reference block or string.
 */
export function extractWordBankTerms(refOrText: any): string[] {
  if (!refOrText) return [];
  const terms: string[] = [];
  if (typeof refOrText === 'string') {
    const clean = refOrText.replace(/^(?:word\s*bank|words?\s+(?:in|from)\s+the\s+box|box|vocabulary\s+box|banco\s+de\s+palabras)\s*[:\.-]?\s*/i, '');
    const parts = clean.split(/[\n,;|/•\-]+/).map((p) => p.trim()).filter((p) => p.length > 0 && p.length < 50);
    terms.push(...parts);
  } else if (refOrText.type === 'text') {
    const raw = refOrText.content || refOrText.body || '';
    const clean = raw.replace(/^(?:word\s*bank|words?\s+(?:in|from)\s+the\s+box|box|vocabulary\s+box|banco\s+de\s+palabras)\s*[:\.-]?\s*/i, '');
    const parts = clean.split(/[\n,;|/•\-]+/).map((p: string) => p.trim()).filter((p: string) => p.length > 0 && p.length < 50);
    terms.push(...parts);
  } else if (refOrText.type === 'reference_table' && Array.isArray(refOrText.columns)) {
    refOrText.columns.forEach((col: any) => {
      if (Array.isArray(col.items)) {
        col.items.forEach((it: any) => {
          if (typeof it === 'string' && it.trim()) terms.push(it.trim());
        });
      }
    });
  } else if (refOrText.type === 'table_reference' && Array.isArray(refOrText.rows)) {
    refOrText.rows.forEach((row: any) => {
      if (Array.isArray(row)) {
        row.forEach((cell: any) => {
          const val = typeof cell === 'string' ? cell : cell?.text || '';
          if (val.trim()) terms.push(val.trim());
        });
      }
    });
  }
  return Array.from(new Set(terms.filter(Boolean)));
}

/**
 * Detects whether reference content solely duplicates the terms of the interaction's wordBank.
 */
export function isDuplicateWordBankReference(ref: any, wordBank: string[]): boolean {
  if (!ref || !Array.isArray(wordBank) || wordBank.length === 0) return false;
  const refText = (ref.content || ref.body || '').trim().toLowerCase();
  if (!refText) return false;
  const matching = wordBank.filter((w) => refText.includes(w.toLowerCase()));
  return matching.length >= Math.min(2, wordBank.length) && refText.split(/\s+/).length < 40;
}

/**
 * Detecta si existe evidencia auditiva física unívoca en el recorte o metadatos
 * (verbos de escucha explícitos, directivas de grabación, mención de tracks/CDs o glifos auditivos).
 *
 * AISLAMIENTO EPISTÉMICO DE METADATOS DE ÍNDICE:
 * Códigos alfanuméricos aislados como 'VR1.2', 'V1.1', 'G2.1', 'p. 145' representan apéndices
 * documentales (Vocabulary Reference, Grammar Reference) y JAMÁS constituyen evidencia auditiva
 * salvo que estén expresamente acompañados por directivas verbales de escucha (e.g. "Listen to VR1.2").
 */
export function hasExplicitAudioEvidence(text: string, title?: string, subtitle?: string): boolean {
  const combined = `${title || ''} ${subtitle || ''} ${text || ''}`.trim();
  if (!combined) return false;

  const audioKeywordsRegex =
    /\b(?:listen(?:ing)?|hear|recording|track|audio|cd\s*\d*|headphones?|speaker|altavoz|auriculares)\b/i;
  return audioKeywordsRegex.test(combined);
}

/**
 * Extrae la etiqueta y URL canónica de un recurso de audio cuando y solo cuando
 * existe evidencia auditiva física explícita.
 */
export function extractAudioTrackInfo(text: string): { audioLabel: string; audioUrl: string } | null {
  if (!hasExplicitAudioEvidence(text)) {
    return null;
  }

  // 1. Si contiene un código específico como V1.2 o R1.8 acompañado de evidencia auditiva
  const vrMatch = text.match(/\b([VR]\d+\.\d+)\b/i);
  if (vrMatch) {
    const rawLabel = vrMatch[1].trim();
    const slug = rawLabel.replace(/[^a-zA-Z0-9.-]+/g, '_');
    return {
      audioLabel: rawLabel,
      audioUrl: `/audio/${slug}.mp3`,
    };
  }

  // 2. Patrones explícitos: CD Track X, Track X, Audio X, Recording X
  const trackPattern =
    /\b(?:(?:CD\s*\d+\s*)?Track\s*(\d+(?:\.\d+)?)|(?:Audio\s*([A-Za-z0-9.]+))|(?:Recording\s*(\d+(?:\.\d+)?)))\b/i;
  const match = text.match(trackPattern);
  if (match) {
    const label = match[0].trim();
    const slug = label.replace(/[^a-zA-Z0-9.-]+/g, '_');
    return {
      audioLabel: label,
      audioUrl: `/audio/${slug}.mp3`,
    };
  }

  // 2. Patrón de consigna: "Listen and check [X]" o "Listen to [X]"
  const listenCheckMatch = text.match(
    /listen\s+(?:and|&|to)\s+check(?:\s+your\s+answers)?(?:\s*\[?([A-Za-z0-9.\s]+)\]?)?/i
  );
  if (listenCheckMatch) {
    const rawCode = (listenCheckMatch[1] || '').trim();
    if (rawCode && rawCode.split(/\s+/).length <= 2) {
      const slug = rawCode.replace(/[^a-zA-Z0-9.-]+/g, '_');
      return {
        audioLabel: rawCode,
        audioUrl: `/audio/${slug}.mp3`,
      };
    }
    return {
      audioLabel: 'Audio',
      audioUrl: '/audio/verification.mp3',
    };
  }

  const listenToMatch = text.match(/listen\s+to\s+([A-Za-z0-9.]+)/i);
  if (listenToMatch && listenToMatch[1]) {
    const rawCode = listenToMatch[1].trim();
    const slug = rawCode.replace(/[^a-zA-Z0-9.-]+/g, '_');
    return {
      audioLabel: rawCode,
      audioUrl: `/audio/${slug}.mp3`,
    };
  }

  return {
    audioLabel: 'Audio',
    audioUrl: '/audio/Audio.mp3',
  };
}

/**
 * Desacoplamiento universal de tokens en WordBank y preservación contextual en 'input_fields'.
 *
 * Principio de Preservación Contextual:
 * 1. Prohibición de Reactivos Vacíos de Contexto:
 *    Queda estrictamente prohibido que un reactivo de 'input_fields' tenga como 'prompt' únicamente
 *    el ordinal o índice numérico (e.g. "2.", "3.") dejando al estudiante sin estímulo visible.
 * 2. Regla Universal de Desacoplamiento (Token vs. Contexto Receptor):
 *    Si la clave oficial ('expectedAnswer' o Answer Key) corresponde a una colocación o sintagma
 *    compuesto ("A + B") y el subelemento "A" (o "B") está presente en 'interaction.wordBank':
 *    a) El elemento provisto por el banco se asigna como 'expectedAnswer' (el valor a ingresar/arrastrar).
 *    b) El elemento contextual complementario debe permanecer visible dentro del 'prompt',
 *       delimitando con precisión la posición del hueco: "{{blank}} [complemento]" o "[prefijo] {{blank}}".
 */
export function decoupleWordBankTokensAndPreserveContext(
  slide: any,
  _effectiveContext?: any
): void {
  if (!slide || !slide.interaction || slide.interaction.type !== 'input_fields') return;
  if (!Array.isArray(slide.interaction.listItems) || slide.interaction.listItems.length === 0) return;

  const wordBank: string[] = Array.isArray(slide.interaction.wordBank)
    ? slide.interaction.wordBank.map((w: any) => String(w).trim()).filter(Boolean)
    : [];

  const fullHeader = `${slide.title || ''} ${slide.subtitle || ''} ${slide.interaction.instruction || ''}`;
  const sortedBank = [...wordBank].sort((a, b) => b.length - a.length);

  slide.interaction.listItems.forEach((item: any, idx: number) => {
    if (!item || typeof item !== 'object') return;
    if (isSentenceScrambleReactive(item.prompt || '', fullHeader)) return;

    // Si el reactivo es un ejemplo resuelto (isExample: true), no desacoplar tokens del banco:
    // El prompt debe ser el ordinal canónico ('1.') y expectedAnswer la estructura completa resuelta
    // si la respuesta ya contiene la estructura completa
    if (item.isExample) {
      const ordMatch = (item.prompt || '').trim().match(/^(\(?\d+[.)]?)/);
      const canonicalOrdinal = ordMatch
        ? (ordMatch[1].replace(/[()]/g, '').endsWith('.') ? ordMatch[1].replace(/[()]/g, '') : `${ordMatch[1].replace(/[()]/g, '')}.`)
        : `${idx + 1}.`;
      const expected = (item.expectedAnswer || '').trim();
      const rawPromptWithoutOrd = String(item.prompt || '').trim().replace(/^(\(?\d+[.)]?\s*)/, '').trim();
      const isCompleteStructure =
        Boolean(expected) &&
        (
          expected.split(/\s+/).length >= 3 ||
          expected.includes('?') ||
          /^\s*(?:\(?\d+[.)]?|[a-z][.)])?\s*$/i.test(item.prompt || '') ||
          (Boolean(rawPromptWithoutOrd) && (
            expected.toLowerCase() === rawPromptWithoutOrd.toLowerCase() ||
            expected.toLowerCase().includes(rawPromptWithoutOrd.toLowerCase()) ||
            rawPromptWithoutOrd.toLowerCase().includes(expected.toLowerCase())
          ))
        );

      if (isCompleteStructure) {
        item.prompt = canonicalOrdinal;
      }
      return;
    }

    let currentPrompt = cleanInputBlankMarkers(item.prompt || '');
    let expected = (item.expectedAnswer || '').trim();

    // Extraer ordinal numérico o alfabético si existe (ej. "2.", "3)", "b.", "(1)")
    const ordinalMatch = currentPrompt.match(/^(\s*(?:\(?\d+[.)]?|[a-z][.)])\s*)/i);
    const ordinal = ordinalMatch ? ordinalMatch[1].trim() + ' ' : `${idx + 1}. `;
    const promptWithoutOrdinal = ordinalMatch
      ? currentPrompt.slice(ordinalMatch[0].length).trim()
      : currentPrompt.trim();

    if (sortedBank.length > 0 && expected) {
      for (const token of sortedBank) {
        const tLower = token.toLowerCase();
        const expLower = expected.toLowerCase();

        // Caso A: El token del banco coincide con el inicio de la colocación (ej. token="look", expected="look after")
        if (expLower.startsWith(tLower + ' ') || expLower.startsWith(tLower + '-')) {
          const complement = expected.slice(token.length + 1).trim();

          item.expectedAnswer = token;
          item.acceptedAnswers = [token];

          const promptHasComplement = promptWithoutOrdinal.toLowerCase().includes(complement.toLowerCase());
          if (promptHasComplement) {
            if (!promptWithoutOrdinal.includes('{{blank}}')) {
              item.prompt = `${ordinal}{{blank}} ${promptWithoutOrdinal}`.replace(/\s+/g, ' ').trim();
            } else {
              item.prompt = currentPrompt;
            }
          } else {
            item.prompt = `${ordinal}{{blank}} ${complement}`.trim();
          }

          break;
        }

        // Caso B: El token del banco coincide con el final de la colocación (ej. token="after", expected="look after" o "tidy up", token="up")
        if (expLower.endsWith(' ' + tLower) || expLower.endsWith('-' + tLower)) {
          const prefix = expected.slice(0, expected.length - token.length - 1).trim();

          item.expectedAnswer = token;
          item.acceptedAnswers = [token];

          const promptHasPrefix = promptWithoutOrdinal.toLowerCase().includes(prefix.toLowerCase());
          if (promptHasPrefix) {
            if (!promptWithoutOrdinal.includes('{{blank}}')) {
              item.prompt = `${ordinal}${promptWithoutOrdinal} {{blank}}`.replace(/\s+/g, ' ').trim();
            } else {
              item.prompt = currentPrompt;
            }
          } else {
            item.prompt = `${ordinal}${prefix} {{blank}}`.trim();
          }

          break;
        }

        // Caso C: El expectedAnswer coincide exactamente con el token
        if (expLower === tLower) {
          if (!promptWithoutOrdinal || promptWithoutOrdinal === '{{blank}}') {
            item.prompt = `${ordinal}{{blank}}`.trim();
          } else if (!promptWithoutOrdinal.includes('{{blank}}')) {
            item.prompt = `${ordinal}{{blank}} ${promptWithoutOrdinal}`.trim();
          } else {
            item.prompt = currentPrompt;
          }
          break;
        }
      }
    }

    // Prohibición estricta de reactivos vacíos de contexto:
    // Si el prompt quedó únicamente como el ordinal aislado ("2.", "2", etc.)
    const isBareOrdinal = /^\s*(?:\(?\d+[.)]?|[a-z][.)])?\s*$/i.test(item.prompt || '');
    if (isBareOrdinal) {
      item.prompt = `${ordinal}{{blank}}`.trim();
    }
  });
}

/**
 * Normaliza y estructura un bloque de interacción de tipo buckets_matching:
 * 1. Poda cualquier texto explicativo de las categorías que haya fugado a instruction, prompt o subtitle.
 * 2. Si las categorías no estaban estructuradas, las extrae de forma agnóstica mediante extractCategoryBucketsFromText.
 * 3. Preserva 'sentence case' en las cabeceras de cada contenedor.
 * 4. Asigna ejemplos pre-resueltos en los contenedores meta con isExample: true y los excluye del banco interactivo.
 */
export function normalizeBucketsMatchingInteraction(rawSlide: any, fallbackRawText?: string): void {
  if (!rawSlide.interaction || rawSlide.interaction.type !== 'buckets_matching') return;
  const it = rawSlide.interaction;

  // 1. Prohibir terminantemente que el texto explicativo de las categorías sea concatenado en 'instruction' o 'prompt'
  if (it.instruction) {
    const cleanInst = isolateCanonicalInstruction(it.instruction);
    if (cleanInst) it.instruction = cleanInst;
  }
  if (it.prompt) {
    const cleanPrompt = isolateCanonicalInstruction(it.prompt);
    it.prompt = cleanPrompt || undefined;
  }
  if (rawSlide.subtitle) {
    const cleanSub = isolateCanonicalInstruction(rawSlide.subtitle);
    rawSlide.subtitle = cleanSub || undefined;
  }

  // 2. Extraer o enriquecer categorías receptoras si faltan o si se declaran en el texto
  const textToScan = `${fallbackRawText || ''} ${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${it.instruction || ''} ${rawSlide.contextBody || ''} ${(rawSlide.referenceContent as any)?.content || ''}`;
  const detected = extractCategoryBucketsFromText(textToScan, it.tokens || it.sourceItems);

  if ((!Array.isArray(it.buckets) || it.buckets.length === 0) && detected.length >= 2) {
    it.buckets = detected;
    it.targetSlots = detected;
  }

  if (Array.isArray(it.buckets) && it.buckets.length > 0) {
    // 3. Normalización Tipográfica: Preservar 'sentence case' en las cabeceras de los contenedores
    it.buckets = it.buckets.map((b: any, bIdx: number) => {
      const id = b.id || (detected[bIdx] ? detected[bIdx].id : `slot-${bIdx + 1}`);
      const rawLabel = b.label || b.id || '';
      return {
        ...b,
        id,
        label: toSentenceCase(rawLabel),
        items: Array.isArray(b.items) ? b.items : [],
      };
    });

    // 4. Asignación de Ejemplos Pre-resueltos en Contenedores:
    // Identificar marcadores ordinales de muestra (e.g. '1', '1.', 'example')
    const markerMap = new Map<string, string>();
    for (const d of detected) {
      if (d._exampleMarker) {
        markerMap.set(d.id, d._exampleMarker);
      }
    }

    if (Array.isArray(it.tokens)) {
      for (const bucket of it.buckets) {
        const marker = markerMap.get(bucket.id);
        if (marker) {
          const targetToken = it.tokens.find(
            (t: any) =>
              t.id === marker ||
              t.id === `tok-${marker}` ||
              t.id === `src-${marker}` ||
              (t.text && (t.text.startsWith(`${marker}.`) || t.text.startsWith(`${marker} `)))
          ) || (marker === 'example' || marker === '1' ? it.tokens[0] : null);

          if (targetToken) {
            targetToken.isExample = true;
            targetToken.correctBucketId = bucket.id;
            if (!bucket.items) bucket.items = [];
            if (!bucket.items.some((item: any) => item.id === targetToken.id)) {
              bucket.items.push({
                id: targetToken.id,
                text: targetToken.text,
                correctBucketId: bucket.id,
                isExample: true,
              });
            }
          }
        }
      }
    }

    if (Array.isArray(it.targetSlots)) {
      it.targetSlots = it.buckets;
    }
  }
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

  // 1. Tratamiento unívoco de medios: un audio en un slide con ejercicio interactivo
  // pertenece a los metadatos de la interacción (verificationAudioUrl), nunca a referenceContent
  if (ref.type === 'media' || ref.type === 'audio' || ref.type === 'listening') {
    if (interaction && (ref.mediaType === 'audio' || !ref.mediaType || ref.type === 'audio' || ref.type === 'listening')) {
      return true;
    }
    const refText = `${ref.title || ''} ${ref.body || ''} ${ref.content || ''} ${subtitle || ''} ${title || ''}`;
    if (!hasExplicitAudioEvidence(refText)) {
      return true;
    }
    return false;
  }

  // Las tablas estructuradas constituyen material de consulta formal
  if (ref.type === 'reference_table' || ref.type === 'table_reference') {
    return false;
  }

  const content = (ref.body || ref.content || '').trim();
  if (!content) return true;

  // Detección ontológica de solucionarios o claves de respuestas filtradas en referenceContent
  if (isAnswerKeyContent(content, ref.title, ref.subtitle)) {
    return true;
  }

  // Detección ontológica de cajas o bancos de palabras en referenceContent
  if (isWordBankContent(ref, interaction)) {
    return true;
  }

  // 1. Meta-comentarios pedagógicos sintéticos ("Practice expressing...", "Students practice...")
  if (isSyntheticPedagogicalText(content)) {
    return true;
  }

  // 2. Oraciones modelo o ejemplos resueltos aislados ("Example: ...")
  if (/^(?:examples?|models?|samples?|demos?|e\.g\.|for example)\b[:\s]/i.test(content)) {
    return true;
  }

  // 3. Categorías o títulos explícitos de directivas/metadatos
  if (ref.category === 'instructions') {
    return true;
  }
  if (ref.title && /^(?:examples?|models?|instructions?|directions?|consigna|task|steps?)\b/i.test(ref.title.trim())) {
    return true;
  }

  // 4. Si no hay interacción (diapositiva puramente expositiva, teórica o de lectura),
  // el contenido es el cuerpo mismo de la diapositiva y no puede ser metadato espurio de un ejercicio.
  if (!interaction) {
    return false;
  }

  // 5. Las notas de referencia gramatical o cuadros teóricos son material de consulta legítimo
  if (ref.category === 'grammar_note' || ref.category === 'rule_box') {
    return false;
  }

  // CRITERIO DE CALIFICACIÓN ONTOLÓGICA POSITIVA:
  // Un bloque de texto califica como referenceContent ÚNICAMENTE si constituye material de lectura continuo autónomo:

  // A. Diálogo estructurado con interlocutores identificados (al menos 2 turnos de diálogo)
  const dialogueLines = content.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);
  const speakerLines = dialogueLines.filter((l: string) =>
    /^(?:Speaker\s+[A-Za-z0-9]+|[A-Z][a-z]{1,15}|[A-Z])\s*:\s*\S+/i.test(l)
  );
  if (speakerLines.length >= 2) {
    return false; // Diálogo autónomo legítimo
  }

  // B. Lista estructurada de oraciones o reactivos de referencia para análisis (ej. preguntas 1-4 a contrastar)
  const numberedLines = dialogueLines.filter((l: string) => /^\s*\d+[\.\)]\s+\S+/.test(l));
  if (numberedLines.length >= 2) {
    return false; // Corpus estructurado de enunciados de análisis
  }

  // C. Lectura continua estructurada con múltiples párrafos (\n\n)
  const paragraphs = content.split(/\n\s*\n/).map((p: string) => p.trim()).filter(Boolean);
  if (paragraphs.length >= 2) {
    return false; // Artículo o historia con párrafos estructurados
  }

  // D. Texto continuo autónomo (artículo, narración, crónica, transcripción formal)
  const words = content.split(/\s+/).filter(Boolean);
  const hasParagraphs = paragraphs.length >= 2 || (dialogueLines.length >= 2 && !dialogueLines[0].includes('?'));
  const isSingleQuestion = /^[A-Z][^.?!]*\?\s*$/.test(content);

  // Si es un enunciado corto (< 25 palabras), directiva huérfana o pregunta aislada, es una consigna o modelo, no lectura
  if (words.length < 25 || isSingleQuestion) {
    return true;
  }

  if (words.length >= 25 && (hasParagraphs || content.includes('.'))) {
    // Verificar duplicación sustancial con instrucción, subtítulo o título
    const normalizeForComparison = (s: string) =>
      s.toLowerCase().replace(/[.,;:!?]/g, '').replace(/\s+/g, ' ').trim();
    const normContent = normalizeForComparison(content);
    const normSub = subtitle ? normalizeForComparison(subtitle) : '';
    const normTitle = title ? normalizeForComparison(title) : '';
    const normInst = interaction?.instruction ? normalizeForComparison(interaction.instruction) : '';
    if (normTitle && (normContent === normTitle || normTitle.includes(normContent))) return true;
    if (normSub && (normContent === normSub || normSub.includes(normContent))) return true;
    if (normInst && (normContent === normInst || normInst.includes(normContent))) return true;

    return false; // Calificación positiva como texto de lectura continuo
  }

  return true;
}

/**
 * Folds spurious metadata (instruction or solved example) into activity headers/items.
 */
export function foldSpuriousMetadata(text: string, slide: any): void {
  if (!text) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  // Si es texto sintético inventado o meta-comentario pedagógico, descartarlo
  if (isSyntheticPedagogicalText(trimmed)) {
    return;
  }

  // Si es un solucionario o clave de respuesta, jamás doblarlo en la instrucción o subtítulo
  if (isAnswerKeyContent(trimmed, slide.title, slide.subtitle)) {
    return;
  }

  // Si es una caja o lista de palabras, no doblarlo como consigna
  if (isWordBankContent({ type: 'text', content: trimmed }, slide.interaction)) {
    return;
  }

  // Si es un track o audio, no contaminar el texto de la instrucción
  if (/\b(?:audio|listening|track|cd\d*|r\d+\.\d+|v\d+\.\d+)\b/i.test(trimmed) && trimmed.length < 40) {
    return;
  }

  const isExample = /^(?:examples?|models?|samples?|demos?|e\.g\.|for example)\b[:\s]/i.test(trimmed) ||
    /^(?:do you know anyone who|where do you live)\b/i.test(trimmed);

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
        slide.interaction.instruction = `${trimmed} ${currentInst}`.trim();
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

  if (!slide.subtitle && !isExample && trimmed.length <= 80) {
    slide.subtitle = trimmed;
  }
}

/**
 * Detects whether an instruction represents sentence ordering, question formation, or unscrambling
 * (e.g. 'make questions', 'put the words in order', 'unscramble', 'write sentences').
 */
export function isSentenceOrderingDirective(text?: string): boolean {
  if (!text) return false;
  return /\b(?:make|form|write|create)\s+(?:the\s+)?(?:questions?|sentences?)\b|\bput\s+(?:the\s+)?(?:words|prompts)\s+(?:in|into)\s+(?:the\s+)?(?:correct\s+)?order\b|\border\s+(?:the\s+)?(?:words|prompts)\b|\bunscramble\b|\breorder\b|\brearrange\b|\bordenar\s+(?:las\s+)?palabras\b|\bescribir?\s+(?:oraciones|preguntas)\b|\bhaz\s+preguntas?\b/i.test(text);
}

/**
 * Detects whether a reactive item with delimiters represents a sentence reconstruction / unscramble task
 * rather than a multiple-choice selection disjunction.
 *
 * Concurrent criteria:
 * - High density of fragments (5 or more tokens: e.g. "been / in / the / you / last / clubbing / month / Have ?")
 * - Presence of terminal/isolated punctuation marks ('?', '.') within the sequence
 * - Directive oriented to sentence assembly/ordering ('make questions', 'put words in order', etc.) with >= 3 fragments.
 */
export function isSentenceScrambleReactive(
  rawText: string,
  contextDirective?: string
): boolean {
  if (!rawText || typeof rawText !== 'string') return false;

  const clean = rawText
    .replace(/\[\s*\?\s*\]|\[\s*blank\s*\]|\{\{\s*blank\s*\}\}|_{2,}/gi, '')
    .trim()
    .replace(/^(?:\(?\d+[.)]?\s*)/, '')
    .trim();

  if (!clean.includes('/')) return false;

  const rawParts = clean.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  if (rawParts.length < 2) return false;

  const isOrderingDir = isSentenceOrderingDirective(contextDirective);

  // Check for isolated terminal punctuation tokens (e.g. '?', '.', '!') or tokens ending in terminal punctuation
  const hasIsolatedOrTerminalPunctuation = rawParts.some(
    (p) => p === '?' || p === '.' || p === '!' || /\s+[?.!]$/.test(p) || (p.length > 1 && /[?.!]$/.test(p) && !/^(?:etc|e\.g|i\.e)\./i.test(p))
  );

  // 1. High density of fragments (>= 5 tokens) is unmistakably syntactic fragmentation (sentence scrambling)
  if (rawParts.length >= 5) {
    return true;
  }

  // 2. Assembly/ordering directive with >= 3 tokens
  if (isOrderingDir && rawParts.length >= 3) {
    return true;
  }

  // 3. Presence of terminal question or punctuation mark with >= 3 tokens
  if (hasIsolatedOrTerminalPunctuation && rawParts.length >= 3) {
    return true;
  }

  return false;
}

/**
 * Decomposes a reactive item with slash-delimited options into a base prompt and discrete option list.
 * e.g. "work in a school/an office/a receptionist" -> { prompt: "work in", options: ["a school", "an office", "a receptionist"] }
 * e.g. "1. work in: a school / an office / a receptionist" -> { prompt: "work in", options: ["a school", "an office", "a receptionist"] }
 */
export function decomposeSlashDelimitedReactive(
  rawText: string,
  contextDirective?: string
): { prompt: string; options: string[] } | null {
  if (!rawText || typeof rawText !== 'string') return null;

  // Rule 1: Exclude sentence scramble / ordering items
  if (isSentenceScrambleReactive(rawText, contextDirective)) {
    return null;
  }

  // Clean orphan gap markers: [ ? ], [blank], {{blank}}, _____
  let clean = rawText
    .replace(/\[\s*\?\s*\]|\[\s*blank\s*\]|\{\{\s*blank\s*\}\}|_{2,}/gi, '')
    .trim();

  // Strip leading question numbers e.g. "1. ", "2) ", "(3) "
  clean = clean.replace(/^(?:\(?\d+[.)]?\s*)/, '').trim();

  // Must contain at least one slash
  if (!clean.includes('/')) return null;

  // Split by slashes
  const rawParts = clean.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  if (rawParts.length < 2) return null;

  // Selection archetype criterion: low fragment density (2 to 4 options max).
  // 5 or more tokens is syntactic fragmentation, not alternative choices.
  if (rawParts.length > 4) return null;

  // Selection archetype criterion: absence of terminal punctuation ('?', '.') as isolated token.
  const hasIsolatedPunctuation = rawParts.some(
    (p) => p === '?' || p === '.' || p === '!' || /\s+[?.!]$/.test(p)
  );
  if (hasIsolatedPunctuation) return null;

  // Check if there is an explicit separator before the first slash: e.g. "work in: a school" or "work in - a school"
  const firstPart = rawParts[0];
  const separatorMatch = firstPart.match(/^(.*?)\s*[:–—]\s*(.*)$/);

  let prompt = '';
  let firstOption = '';

  if (separatorMatch) {
    prompt = separatorMatch[1].trim();
    firstOption = separatorMatch[2].trim();
  } else {
    // No colon or dash: e.g. "work in a school" followed by "/ an office / a receptionist"
    const secondPart = rawParts[1];

    // Check if firstPart contains an article/determiner boundary
    // e.g. "work in a school" -> boundary at "a school"
    const articleRegex = /\b(?:a|an|the|my|your|his|her|our|their|some|any)\s+[a-zA-Z]/i;
    const firstArticleMatch = firstPart.search(articleRegex);

    if (firstArticleMatch > 0) {
      prompt = firstPart.slice(0, firstArticleMatch).trim();
      firstOption = firstPart.slice(firstArticleMatch).trim();
    } else {
      // Compare word counts with second part
      const secondWords = secondPart.split(/\s+/).filter(Boolean);
      const firstWords = firstPart.split(/\s+/).filter(Boolean);

      if (firstWords.length > secondWords.length && secondWords.length > 0) {
        const splitIdx = firstWords.length - secondWords.length;
        prompt = firstWords.slice(0, splitIdx).join(' ').trim();
        firstOption = firstWords.slice(splitIdx).join(' ').trim();
      } else if (firstWords.length >= 2) {
        prompt = firstWords.slice(0, firstWords.length - 1).join(' ').trim();
        firstOption = firstWords[firstWords.length - 1].trim();
      } else {
        prompt = firstWords[0] || '';
        firstOption = firstWords[0] || '';
      }
    }
  }

  const options = [firstOption, ...rawParts.slice(1)]
    .map((opt) => opt.replace(/\[\s*\?\s*\]|\[\s*blank\s*\]|\{\{\s*blank\s*\}\}|_{2,}/gi, '').replace(/[.,:;?!]+$/, '').trim())
    .filter(Boolean);

  if (!prompt || options.length < 2) return null;

  return { prompt, options };
}

/**
 * Detects whether an instruction represents negative discrimination ("Cross out", "Odd one out", "Which doesn't fit").
 */
export function isNegativeDiscriminationInstruction(text?: string): boolean {
  if (!text) return false;
  return /\bcross\s*(?:out|off)\b|\bodd\s*one\s*out\b|\bwhich\s+(?:one|word|phrase|item)\s+(?:doesn'?t|does\s+not|isn'?t|is\s+not)\b|\bdoes\s+not\s+(?:fit|belong|collocate|go)\b|\bdoesn'?t\s+(?:fit|belong|collocate|go)\b|\btach[ae]\b|\belimina\b|\bdescarta\b|\bincorrect\s+(?:word|phrase|option|verb|one)\b|\bwrong\s+(?:word|phrase|option|verb|one)\b|\bnot\s+possible\b/i.test(text);
}

/**
 * Formats previous slide content cleanly for injection into PREVIOUS_SLIDE_CONTEXT prompt section.
 */
export function formatPreviousSlideContext(slide: Slide): string {
  const parts: string[] = [];
  parts.push(`Title: ${slide.title}`);
  if (slide.subtitle) parts.push(`Subtitle: ${slide.subtitle}`);
  if (slide.contextBody) parts.push(`Context/Body: ${slide.contextBody}`);

  if (slide.referenceContent) {
    const rc = slide.referenceContent as any;
    if (rc.title) parts.push(`Reference Title: ${rc.title}`);
    if (rc.content && rc.content !== slide.contextBody) parts.push(`Reference Content:\n${rc.content}`);
    if (rc.body && rc.body !== rc.content && rc.body !== slide.contextBody) parts.push(`Reference Body:\n${rc.body}`);
    if (rc.columns) {
      parts.push(`Reference Columns:\n${JSON.stringify(rc.columns)}`);
    }
    if (rc.headers && rc.rows) {
      parts.push(`Reference Table Headers: ${rc.headers.join(' | ')}`);
      parts.push(`Reference Table Rows:\n${rc.rows.map((r: any[]) => r.join(' | ')).join('\n')}`);
    }
  }

  // Material textual y léxico disponible para consulta pasiva (Read-Only)
  // NUNCA serializar estructuras interactivas técnicas (interaction.type, questions, options, verificationAudioUrl)
  const extracted = extractItemsFromSlideContext(slide);
  if (extracted.phrases.length > 0) {
    parts.push(`Vocabulary / Phrases Bank (Read-Only):\n${extracted.phrases.map((p) => `- ${p}`).join('\n')}`);
  } else if (extracted.words.length > 0) {
    parts.push(`Word Bank (Read-Only):\n${extracted.words.map((w) => `- ${w}`).join('\n')}`);
  }

  return parts.join('\n');
}

/**
 * Extracts candidate words, phrases, and items from previous slide context for legitimate grounding.
 */
export function extractItemsFromSlideContext(slide: Slide): {
  phrases: string[];
  words: string[];
  listItems: Array<{ prompt: string; expectedAnswer?: string }>;
} {
  const phrases: string[] = [];
  const words: string[] = [];
  const listItems: Array<{ prompt: string; expectedAnswer?: string }> = [];

  if (slide.interaction) {
    const it = slide.interaction as any;
    if (Array.isArray(it.wordBank)) {
      words.push(...it.wordBank);
      phrases.push(...it.wordBank);
    }
    if (Array.isArray(it.listItems)) {
      it.listItems.forEach((item: any) => {
        if (item.prompt) {
          listItems.push({ prompt: item.prompt, expectedAnswer: item.expectedAnswer });
          phrases.push(item.prompt);
        }
        if (item.expectedAnswer) {
          words.push(item.expectedAnswer);
          phrases.push(item.expectedAnswer);
        }
      });
    }
    if (Array.isArray(it.questions)) {
      it.questions.forEach((q: any) => {
        if (q.prompt || q.question) phrases.push(q.prompt || q.question);
        if (Array.isArray(q.options)) {
          q.options.forEach((o: any) => {
            if (o.text) phrases.push(o.text);
          });
        }
      });
    }
    if (Array.isArray(it.options)) {
      it.options.forEach((o: any) => {
        if (o.text) phrases.push(o.text);
      });
    }
    if (Array.isArray(it.tokens)) {
      it.tokens.forEach((t: any) => {
        if (t.text) phrases.push(t.text);
      });
    }
  }

  if (slide.referenceContent) {
    const rc = slide.referenceContent as any;
    if (rc.content) phrases.push(rc.content);
    if (rc.body) phrases.push(rc.body);
    if (Array.isArray(rc.columns)) {
      rc.columns.forEach((col: any) => {
        if (Array.isArray(col.items)) phrases.push(...col.items);
      });
    }
  }

  const uniquePhrases = Array.from(new Set(phrases.map((p) => p.trim()))).filter(Boolean);
  const uniqueWords = Array.from(new Set(words.map((w) => w.trim()))).filter(Boolean);

  return { phrases: uniquePhrases, words: uniqueWords, listItems };
}

/**
 * Detects whether an instruction or text explicitly references an external/previous activity
 * (e.g., "in 2a", "from the box in 1", "using the verbs in 2b", "from activity 3", "from the box above", etc.)
 */
export function detectCrossActivityReference(text?: string): string | null {
  if (!text) return null;
  const patterns: RegExp[] = [
    /\b(?:in|from|refer\s+to|look\s+at|use|using|with)\s+(?:the\s+)?(?:(?:exercise|activity|dialogue|phrases?|words?|verbs?|sentences?|box|chart|table|part|section)\s+)*(?:(?:in|from)\s+)?(?:the\s+)?(?:box|chart|table|dialogue|list\s+)?(?:\b[0-9]+[a-z]?\b|\babove\b)/i,
    /\b(?:exercise|activity|part|section)\s+([0-9]+[a-z]?|[a-f]\b)/i,
    /\bfrom\s+(?:the\s+)?(?:box|chart|dialogue|table|list)\s+above\b/i,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match) {
      const captured = match[0].trim();
      if (!/\b(?:in\s+(?:english|pairs|groups|class|order|bold|italics|turn|addition|fact|general|detail))\b/i.test(captured)) {
        return captured;
      }
    }
  }

  return null;
}

/**
 * Extracts interaction items into prompt/expectedAnswer pairs for referenceContent deduplication.
 */
export function extractInteractionItemsForDeduplication(
  interaction: any
): Array<{ prompt?: string; expectedAnswer?: string }> {
  if (!interaction) return [];
  const items: Array<{ prompt?: string; expectedAnswer?: string }> = [];

  if (interaction.type === 'input_fields' && Array.isArray(interaction.listItems)) {
    for (const it of interaction.listItems) {
      items.push({ prompt: it.prompt || it.text || '', expectedAnswer: it.expectedAnswer || '' });
    }
  } else if (interaction.type === 'selection') {
    if (Array.isArray(interaction.questions)) {
      for (const q of interaction.questions) {
        const optionTexts = Array.isArray(q.options) ? q.options.map((o: any) => o.text).join(' ') : '';
        const promptWithOpts = `${q.prompt || q.question || ''} ${optionTexts}`.trim();
        items.push({
          prompt: promptWithOpts,
          expectedAnswer: q.options?.find((o: any) => o.isCorrect)?.text || '',
        });
      }
    }
    if (Array.isArray(interaction.options)) {
      const optionTexts = interaction.options.map((o: any) => o.text).join(' ');
      const combined = `${interaction.instruction || ''} ${optionTexts}`.trim();
      items.push({
        prompt: combined,
        expectedAnswer: interaction.options.find((o: any) => o.isCorrect)?.text || '',
      });
    }
  } else if (interaction.type === 'buckets_matching') {
    if (Array.isArray(interaction.tokens)) {
      for (const t of interaction.tokens) {
        items.push({ prompt: t.text || t.content || '', expectedAnswer: t.category || '' });
      }
    }
    if (Array.isArray(interaction.sourceItems)) {
      for (const s of interaction.sourceItems) {
        items.push({ prompt: s.text || '', expectedAnswer: s.bucketId || '' });
      }
    }
  } else if (interaction.type === 'sequence' && Array.isArray(interaction.items)) {
    for (const s of interaction.items) {
      items.push({ prompt: s.text || s.content || '' });
    }
  }

  return items;
}

/**
 * Validates raw model output strictly against canonical SlideSchema.
 * Throws explicit SchemaValidationError if validation fails.
 */
export function validateAndParseSlides(
  rawJsonText: string,
  previousSlideContext?: Slide | null
): Slide[] {
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

  // Grounding Epistémico: Pre-escaneo para cosechar solucionarios y claves de respuestas (Ground Truth)
  const harvestedAnswerKeys: Record<string, Record<string, string>> = {};
  const exerciseSlides: any[] = [];

  for (const rawSlide of rawSlides) {
    if (rawSlide && typeof rawSlide === 'object' && isAnswerKeySlide(rawSlide)) {
      const keys = parseAllAnswerKeysFromSlide(rawSlide);
      for (const [secKey, secMap] of Object.entries(keys)) {
        harvestedAnswerKeys[secKey] = { ...(harvestedAnswerKeys[secKey] || {}), ...secMap };
      }
      // Los solucionarios NUNCA se emiten como diapositivas independientes
    } else {
      exerciseSlides.push(rawSlide);
    }
  }

  if (exerciseSlides.length === 0 && rawSlides.length > 0) {
    throw new SchemaValidationError(
      'El modelo devolvió exclusivamente un solucionario o clave de respuestas sin diapositivas de ejercicio interactivo.',
      [],
      parsedJson
    );
  }

  const validatedSlides: Slide[] = [];

  for (let idx = 0; idx < exerciseSlides.length; idx++) {
    const rawSlide = exerciseSlides[idx];
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
      const candidateContext = rawContextBody.trim();
      if (!isSyntheticPedagogicalText(candidateContext)) {
        rawSlide.contextBody = candidateContext;
        if (
          rawSlide.referenceContent &&
          (rawSlide.referenceContent.type === 'reference_table' || rawSlide.referenceContent.type === 'table_reference') &&
          !rawSlide.referenceContent.body
        ) {
          rawSlide.referenceContent.body = rawSlide.contextBody;
        }
      } else {
        rawSlide.contextBody = undefined;
      }
    }

    // Detección y purga de Solucionario / Answer Key residual en referenceContent o contextBody
    if (rawSlide.referenceContent) {
      const refText = (rawSlide.referenceContent.content || rawSlide.referenceContent.body || '').trim();
      if (isAnswerKeyContent(refText, rawSlide.referenceContent.title, rawSlide.referenceContent.subtitle)) {
        const keys = parseAllAnswerKeys(refText);
        for (const [secKey, secMap] of Object.entries(keys)) {
          harvestedAnswerKeys[secKey] = { ...(harvestedAnswerKeys[secKey] || {}), ...secMap };
        }
        rawSlide.referenceContent = null;
        if (rawSlide.contextBody && (rawSlide.contextBody === refText || isAnswerKeyContent(rawSlide.contextBody))) {
          rawSlide.contextBody = undefined;
        }
      }
    }

    if (rawSlide.contextBody && isAnswerKeyContent(rawSlide.contextBody, rawSlide.title, rawSlide.subtitle)) {
      const keys = parseAllAnswerKeys(rawSlide.contextBody);
      for (const [secKey, secMap] of Object.entries(keys)) {
        harvestedAnswerKeys[secKey] = { ...(harvestedAnswerKeys[secKey] || {}), ...secMap };
      }
      rawSlide.contextBody = undefined;
    }

    if (rawSlide.subtitle && isAnswerKeyContent(rawSlide.subtitle)) {
      rawSlide.subtitle = undefined;
    }

    const rawInstructionText = `${rawSlide.subtitle || ''} ${(rawSlide.interaction as any)?.instruction || ''} ${rawSlide.contextBody || ''} ${(rawSlide.referenceContent as any)?.content || ''}`;
    (rawSlide as any)._rawInstructionText = rawInstructionText;

    // Invariante de Aislamiento de la Consigna (Instruction Isolation Principle)
    if (rawSlide.subtitle) {
      const cleanSub = isolateCanonicalInstruction(rawSlide.subtitle);
      rawSlide.subtitle = cleanSub || undefined;
    }

    if (rawSlide.interaction && typeof rawSlide.interaction === 'object') {
      const currentInst = (rawSlide.interaction as any).instruction;
      if (currentInst) {
        const cleanInst = isolateCanonicalInstruction(currentInst);
        if (cleanInst) {
          (rawSlide.interaction as any).instruction = cleanInst;
        } else if (rawSlide.subtitle) {
          (rawSlide.interaction as any).instruction = rawSlide.subtitle;
        } else if ((rawSlide.interaction as any).type === 'selection') {
          const isNeg = isNegativeDiscriminationInstruction(
            `${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${currentInst}`
          );
          (rawSlide.interaction as any).instruction = isNeg
            ? 'Cross out the incorrect option:'
            : 'Choose the correct option:';
        }
      }
    }

    if (rawSlide.interaction && typeof rawSlide.interaction === 'object') {
      const inst = (rawSlide.interaction as any).instruction || '';
      const ansKeyMatch = inst.match(/(?:\s+|\n)(?:answers?|answer\s*key|key|solucionario)[:\s]+(?:\d+[\.\)\s:-].*)$/i);
      if (ansKeyMatch) {
        const keyText = inst.slice(ansKeyMatch.index);
        const keys = parseAllAnswerKeys(keyText);
        for (const [secKey, secMap] of Object.entries(keys)) {
          harvestedAnswerKeys[secKey] = { ...(harvestedAnswerKeys[secKey] || {}), ...secMap };
        }
        (rawSlide.interaction as any).instruction = inst.slice(0, ansKeyMatch.index).trim();
      }
    }

    // Detección y asignación estructural de cajas o bancos de palabras (Word Bank)
    if (rawSlide.referenceContent && isWordBankContent(rawSlide.referenceContent, rawSlide.interaction)) {
      const extractedTerms = extractWordBankTerms(rawSlide.referenceContent);
      if (rawSlide.interaction && typeof rawSlide.interaction === 'object') {
        const it = rawSlide.interaction as any;
        if (!Array.isArray(it.wordBank) || it.wordBank.length === 0) {
          it.wordBank = extractedTerms;
        } else {
          it.wordBank = Array.from(new Set([...it.wordBank, ...extractedTerms]));
        }
      }
      rawSlide.referenceContent = null;
      if (rawSlide.contextBody) {
        rawSlide.contextBody = undefined;
      }
    }

    if (rawSlide.contextBody && rawSlide.interaction && isWordBankContent({ type: 'text', content: rawSlide.contextBody }, rawSlide.interaction)) {
      const extractedTerms = extractWordBankTerms(rawSlide.contextBody);
      const it = rawSlide.interaction as any;
      if (!Array.isArray(it.wordBank) || it.wordBank.length === 0) {
        it.wordBank = extractedTerms;
      } else {
        it.wordBank = Array.from(new Set([...it.wordBank, ...extractedTerms]));
      }
      rawSlide.contextBody = undefined;
    }

    if (rawSlide.referenceContent && rawSlide.interaction && Array.isArray((rawSlide.interaction as any).wordBank)) {
      if (isDuplicateWordBankReference(rawSlide.referenceContent, (rawSlide.interaction as any).wordBank)) {
        rawSlide.referenceContent = null;
        if (rawSlide.contextBody) {
          rawSlide.contextBody = undefined;
        }
      }
    }

    const effectiveContext = (idx > 0 && validatedSlides[idx - 1]) ? validatedSlides[idx - 1] : (previousSlideContext || null);

    // Grounding epistémico: Inyectar soluciones del Solucionario / Answer Key oficial
    if (Object.keys(harvestedAnswerKeys).length > 0 && rawSlide.interaction) {
      applyAnswerKeysToSlide(rawSlide, harvestedAnswerKeys);
    }

    if (rawSlide.interaction && typeof rawSlide.interaction === 'object') {
      if (!rawSlide.interaction.id) {
        rawSlide.interaction.id = `int-${Date.now()}-${idx}`;
      }

    // A. Prohibición Ontológica: Tareas orales / speaking en parejas (Desacoplada de 'writing')
    const slideTextToScan = `${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${(rawSlide.interaction as any)?.instruction || ''} ${(rawSlide.interaction as any)?.prompt || ''} ${(rawSlide.referenceContent as any)?.content || ''} ${(rawSlide.referenceContent as any)?.instruction || ''}`.toLowerCase();

    const isOralDirective = /\b(?:work\s+in\s+pairs|in\s+pairs|speaking(?:\s+practice)?|ask\s+(?:your\s+partner|each\s+other|questions|about)|discuss\s+with|talk\s+to\s+your\s+partner|take\s+turns\s+to\s+ask|pair\s*work|role\s*play|conversation\s+practice|interview\s+your\s+partner|tell\s+your\s+partner)\b/i.test(slideTextToScan);
    const isExplicitComposition = /\b(?:write\s+an?\s+(?:essay|composition|paragraph|article|email|letter|review|story|report)|write\s+\d+\s*(?:words?|sentences?)|redacta\s+un?\s+(?:ensayo|párrafo|correo|informe))\b/i.test(slideTextToScan);

    // Detección de reactivos clonados indebidamente desde previousSlideContext
    const isClonedFromPrevious = (() => {
      if (!effectiveContext?.interaction || !rawSlide.interaction) return false;
      const prevIt = effectiveContext.interaction as any;
      const currIt = rawSlide.interaction as any;

      if (Array.isArray(currIt.questions) && Array.isArray(prevIt.questions) && prevIt.questions.length > 0) {
        const prevPrompts = prevIt.questions.map((q: any) => (q.prompt || q.question || '').trim().toLowerCase()).filter(Boolean);
        const currPrompts = currIt.questions.map((q: any) => (q.prompt || q.question || '').trim().toLowerCase()).filter(Boolean);
        if (currPrompts.length > 0 && currPrompts.every((p: string) => prevPrompts.includes(p))) {
          return true;
        }
      }
      if (Array.isArray(currIt.listItems) && Array.isArray(prevIt.listItems) && prevIt.listItems.length > 0) {
        const prevPrompts = prevIt.listItems.map((it: any) => (it.prompt || '').trim().toLowerCase()).filter(Boolean);
        const currPrompts = currIt.listItems.map((it: any) => (it.prompt || '').trim().toLowerCase()).filter(Boolean);
        if (currPrompts.length > 0 && currPrompts.every((p: string) => prevPrompts.includes(p))) {
          return true;
        }
      }
      if (currIt.verificationAudioUrl && prevIt.verificationAudioUrl && currIt.verificationAudioUrl === prevIt.verificationAudioUrl) {
        return true;
      }
      return false;
    })();

    if (isOralDirective && !isExplicitComposition) {
      const shouldDemoteToOralSlide =
        !rawSlide.interaction ||
        rawSlide.interaction.type === 'writing' ||
        isClonedFromPrevious ||
        Boolean(rawSlide.interaction.verificationAudioUrl && isClonedFromPrevious);

      if (shouldDemoteToOralSlide) {
        let cleanInst = ((rawSlide.interaction as any)?.instruction || rawSlide.subtitle || rawSlide.title || 'Work in pairs.').trim();

        // Purgar directivas previas si el LLM concatenó instrucciones o subtítulos del contexto anterior
        if (effectiveContext) {
          const prevCandidates: string[] = [];
          if ((effectiveContext.interaction as any)?.instruction) {
            prevCandidates.push((effectiveContext.interaction as any).instruction);
          }
          if (effectiveContext.subtitle) {
            prevCandidates.push(effectiveContext.subtitle);
          }
          if (effectiveContext.title) {
            prevCandidates.push(effectiveContext.title);
          }

          for (const cand of prevCandidates) {
            const rawSentences = cand.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 8);
            for (const s of [cand, ...rawSentences]) {
              const cleanedS = s.replace(/^[a-z0-9][.)]?\s*/i, '').replace(/[.!?]+$/, '').trim();
              if (cleanedS.length > 8) {
                const re = new RegExp(`(?:\\b[a-z0-9][.)]?\\s*)?` + cleanedS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + `[.!?]?`, 'gi');
                cleanInst = cleanInst.replace(re, '').trim();
              }
            }
          }
        }
        cleanInst = cleanInst.replace(/^[:;.\s-]+/, '').trim();
        if (!cleanInst) cleanInst = 'Work in pairs.';

        let cleanPrompt = ((rawSlide.interaction as any)?.prompt || '').trim();
        if (!cleanPrompt) {
          const qMatch = cleanInst.match(/(?:^|\n|\.\s+)(["'‘“]?(?:Do|Does|Did|Are|Is|What|Where|Who|Why|When|How)\b[^?\n]+?\?["'’”]?)/i);
          if (qMatch && qMatch[1]) {
            cleanPrompt = qMatch[1].trim();
          }
        }

        let initialCues: string[] = [];
        if (Array.isArray((rawSlide.interaction as any)?.guidelines) && (rawSlide.interaction as any).guidelines.length > 0) {
          initialCues = (rawSlide.interaction as any).guidelines
            .map((g: any) => typeof g === 'string' ? g.trim() : '')
            .filter((g: string) => g.length > 0 && !isSyntheticPedagogicalText(g) && !/^(?:use\s+phrases|ask\s+follow|take\s+turns|work\s+in)/i.test(g));
        }

        // Resolver cues desde el contexto pasivo si hay referencia cruzada legítima
        const crossRef = detectCrossActivityReference(cleanInst) || detectCrossActivityReference(slideTextToScan);
        if (initialCues.length === 0 && crossRef && effectiveContext) {
          const extracted = extractItemsFromSlideContext(effectiveContext);
          const candidatePool = extracted.phrases.length > 0 ? extracted.phrases : extracted.words;
          if (candidatePool.length > 0) {
            initialCues = candidatePool.slice(0, 12);
          }
        }

        rawSlide.interaction = null;
        rawSlide.isGraded = false;
        rawSlide.layout = 'single_column';

        const hasPrompt = cleanPrompt && !cleanInst.includes(cleanPrompt);
        const cardContent = hasPrompt
          ? `${cleanInst}\n\n${cleanPrompt}`
          : cleanInst;

        rawSlide.referenceContent = {
          id: `ref-speaking-${Date.now()}-${idx}`,
          type: 'text',
          category: 'dialogue',
          title: rawSlide.title || 'Speaking / Pairwork',
          instruction: cleanInst,
          model: cleanPrompt || undefined,
          cues: initialCues.length > 0 ? initialCues : undefined,
          content: cardContent,
          body: cardContent,
        };

        if (rawSlide.contextBody) {
          rawSlide.contextBody = undefined;
        }
      }
    }

      // Regla de Detección Universal: preguntas alternativas/disyuntivas ("... A or B?") clasificadas erróneamente como writing
      if (rawSlide.interaction && rawSlide.interaction.type === 'writing') {
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


      // Descomposición canónica y normalización de reactivos con alternativas delimitadas ('/') en input_fields
      if (rawSlide.interaction && rawSlide.interaction.type === 'input_fields' && Array.isArray(rawSlide.interaction.listItems)) {
        const fullHeader = `${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${rawSlide.interaction.instruction || ''}`;
        const isNegativeDiscrim = isNegativeDiscriminationInstruction(fullHeader);
        const isOrderingDirective = isSentenceOrderingDirective(fullHeader);

        const hasScrambleItems = rawSlide.interaction.listItems.some((it: any) =>
          isSentenceScrambleReactive(it.prompt || it.text || '', fullHeader)
        );

        const hasSlashDelimited = !isOrderingDirective && !hasScrambleItems && rawSlide.interaction.listItems.length > 0 &&
          rawSlide.interaction.listItems.every((it: any) => Boolean(decomposeSlashDelimitedReactive(it.prompt || it.text || '', fullHeader)));

        if (!isOrderingDirective && !hasScrambleItems && (hasSlashDelimited || (isNegativeDiscrim && rawSlide.interaction.listItems.some((it: any) => Boolean(decomposeSlashDelimitedReactive(it.prompt || it.text || '', fullHeader)))))) {
          const questions = rawSlide.interaction.listItems.map((it: any, qIdx: number) => {
            const rawPrompt = it.prompt || it.text || '';
            const decomposed = decomposeSlashDelimitedReactive(rawPrompt, fullHeader);
            const prompt = decomposed ? decomposed.prompt : rawPrompt;
            const optionTexts = decomposed ? decomposed.options : (Array.isArray(it.options) ? it.options : []);
            const rawExpected = (it.expectedAnswer || '').trim().toLowerCase();

            const options = optionTexts.map((optText: string, oIdx: number) => {
              let isCorrect = false;
              if (rawExpected) {
                isCorrect = optText.trim().toLowerCase() === rawExpected || rawExpected.includes(optText.trim().toLowerCase());
              } else if (isNegativeDiscrim) {
                isCorrect = oIdx === optionTexts.length - 1;
              } else {
                isCorrect = oIdx === 0;
              }
              return {
                id: `opt-${qIdx + 1}-${oIdx + 1}`,
                text: optText,
                isCorrect,
                isExample: Boolean(it.isExample),
              };
            });

            return {
              id: `q-${qIdx + 1}`,
              prompt,
              question: prompt,
              mode: 'single_choice',
              isExample: Boolean(it.isExample),
              options,
            };
          });

          rawSlide.interaction = {
            id: rawSlide.interaction.id || `int-${Date.now()}-${idx}`,
            type: 'selection',
            instruction: rawSlide.interaction.instruction || rawSlide.subtitle || 'Choose the correct option:',
            questions,
          };
        }
      }

      // Conversión de arquetipo si una interacción emitida erróneamente como 'selection' corresponde a reconstrucción de oraciones ('input_fields')
      if (rawSlide.interaction && rawSlide.interaction.type === 'selection' && Array.isArray(rawSlide.interaction.questions)) {
        const fullHeader = `${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${rawSlide.interaction.instruction || ''}`;
        const isOrderingDirective = isSentenceOrderingDirective(fullHeader);
        const hasScrambleQuestions = rawSlide.interaction.questions.some((q: any) => {
          const text = q.prompt || q.question || '';
          return isSentenceScrambleReactive(text, fullHeader);
        });

        if (isOrderingDirective || hasScrambleQuestions) {
          const listItems = rawSlide.interaction.questions.map((q: any, qIdx: number) => {
            const rawPrompt = q.prompt || q.question || '';
            const expectedAnswer = q.expectedAnswer || '';
            return {
              id: q.id || `item-${qIdx + 1}`,
              prompt: rawPrompt,
              expectedAnswer,
              acceptedAnswers: expectedAnswer ? [expectedAnswer] : [],
              isExample: Boolean(q.isExample),
            };
          });

          rawSlide.interaction = {
            id: rawSlide.interaction.id || `int-${Date.now()}-${idx}`,
            type: 'input_fields',
            layoutMode: 'list',
            instruction: rawSlide.interaction.instruction || rawSlide.subtitle || 'Make questions using the prompts:',
            listItems,
          };
        }
      }

      if (rawSlide.interaction && rawSlide.interaction.type === 'selection' && Array.isArray(rawSlide.interaction.questions)) {
        const refText =
          rawSlide.referenceContent?.type === 'text'
            ? rawSlide.referenceContent.content
            : rawSlide.referenceContent?.type === 'media'
            ? rawSlide.referenceContent.transcript
            : '';

        const isNegativeDiscrim = isNegativeDiscriminationInstruction(
          `${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${rawSlide.interaction.instruction || ''}`
        );

        for (let qIdx = 0; qIdx < rawSlide.interaction.questions.length; qIdx++) {
          const q = rawSlide.interaction.questions[qIdx];
          if (q && typeof q === 'object') {
            if (!q.id) {
              q.id = `q-${qIdx + 1}`;
            }
            if (!q.mode) {
              q.mode = 'single_choice';
            }
            const statement = q.prompt || q.question || '';
            const cleanedStatement = cleanSelectionPrompt(statement, refText);
            q.prompt = cleanedStatement;
            q.question = cleanedStatement;

            // Descomposición canónica de reactivos con alternativas delimitadas ('/')
            const slashDecomp = decomposeSlashDelimitedReactive(cleanedStatement);
            if (slashDecomp) {
              q.prompt = slashDecomp.prompt;
              q.question = slashDecomp.prompt;

              if (!Array.isArray(q.options) || q.options.length < 2) {
                const rawExpected = (q.expectedAnswer || '').trim().toLowerCase();
                q.options = slashDecomp.options.map((optText, oIdx) => {
                  let isCorrect = false;
                  if (rawExpected) {
                    isCorrect = optText.trim().toLowerCase() === rawExpected || rawExpected.includes(optText.trim().toLowerCase());
                  } else if (isNegativeDiscrim) {
                    isCorrect = oIdx === slashDecomp.options.length - 1;
                  } else {
                    isCorrect = oIdx === 0;
                  }
                  return {
                    id: `opt-${oIdx + 1}`,
                    text: optText,
                    isCorrect,
                  };
                });
              } else {
                q.options.forEach((opt: any) => {
                  if (opt && typeof opt === 'object' && opt.text) {
                    opt.text = opt.text.replace(/\[\s*\?\s*\]|\[\s*blank\s*\]|\{\{\s*blank\s*\}\}|_{2,}/gi, '').trim();
                  }
                });
              }
            } else if (!Array.isArray(q.options) || q.options.length === 0) {
              const disj = extractDisjunctiveAlternatives(cleanedStatement);
              if (disj) {
                q.options = disj.options.map((opt, oIdx) => ({
                  id: `opt-${oIdx + 1}`,
                  text: opt,
                  isCorrect: oIdx === 0,
                }));
              }
            }

            // Calibración de polaridad en discriminación negativa ("Cross out" / "Odd one out")
            if (isNegativeDiscrim && Array.isArray(q.options) && q.options.length >= 2) {
              const rawExpected = (q.expectedAnswer || '').trim().toLowerCase();
              if (rawExpected) {
                q.options.forEach((opt: any) => {
                  opt.isCorrect = opt.text.trim().toLowerCase() === rawExpected || rawExpected.includes(opt.text.trim().toLowerCase());
                });
              } else {
                const falseOptions = q.options.filter((o: any) => o.isCorrect === false);
                const trueOptions = q.options.filter((o: any) => o.isCorrect === true);
                if (falseOptions.length === 1 && trueOptions.length >= 1) {
                  q.options.forEach((opt: any) => {
                    opt.isCorrect = !opt.isCorrect;
                  });
                }
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
          const fullHeader = `${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${rawSlide.interaction.instruction || ''}`;
          for (let itemIdx = 0; itemIdx < rawSlide.interaction.listItems.length; itemIdx++) {
            const item = rawSlide.interaction.listItems[itemIdx];
            if (item && typeof item === 'object') {
              if (item.isExample) {
                // Normalización de Ejemplos Resueltos en input_fields (isExample: true):
                // 'prompt' debe contener únicamente el prefijo u ordinal canónico ('1.') y 'expectedAnswer' la oración completa resuelta
                // si la respuesta ya contiene la estructura completa o el prompt ya es solo un ordinal
                const ordMatch = String(item.prompt || '').trim().match(/^(\(?\d+[.)]?)/);
                const canonicalOrdinal = ordMatch
                  ? (ordMatch[1].replace(/[()]/g, '').endsWith('.') ? ordMatch[1].replace(/[()]/g, '') : `${ordMatch[1].replace(/[()]/g, '')}.`)
                  : `${itemIdx + 1}.`;

                const expected = (item.expectedAnswer || '').trim();
                const rawPromptWithoutOrd = String(item.prompt || '').trim().replace(/^(\(?\d+[.)]?\s*)/, '').trim();

                const isCompleteStructure =
                  Boolean(expected) &&
                  (
                    expected.split(/\s+/).length >= 3 ||
                    expected.includes('?') ||
                    /^\s*(?:\(?\d+[.)]?|[a-z][.)])?\s*$/i.test(item.prompt || '') ||
                    (Boolean(rawPromptWithoutOrd) && (
                      expected.toLowerCase() === rawPromptWithoutOrd.toLowerCase() ||
                      expected.toLowerCase().includes(rawPromptWithoutOrd.toLowerCase()) ||
                      rawPromptWithoutOrd.toLowerCase().includes(expected.toLowerCase())
                    ))
                  );

                if (isCompleteStructure) {
                  item.prompt = canonicalOrdinal;
                  item.expectedAnswer = cleanTokenString(expected);
                } else {
                  if (item.prompt) {
                    item.prompt = cleanInputBlankMarkers(item.prompt);
                  }
                  if (item.expectedAnswer) {
                    item.expectedAnswer = cleanTokenString(item.expectedAnswer);
                  }
                }
              } else {
                if (item.prompt) {
                  if (isSentenceScrambleReactive(item.prompt, fullHeader)) {
                    item.prompt = item.prompt.replace(/_{2,}|\[\s*(?:blank|\?)\s*\]|\{\{\s*blank\s*\}\}/gi, '').trim();
                  } else {
                    item.prompt = cleanInputBlankMarkers(item.prompt);
                  }
                }
                if (item.expectedAnswer) {
                  item.expectedAnswer = cleanTokenString(item.expectedAnswer);
                }
              }

              if (item.expectedAnswer) {
                if (!Array.isArray(item.acceptedAnswers) || item.acceptedAnswers.length === 0) {
                  item.acceptedAnswers = [item.expectedAnswer];
                } else {
                  item.acceptedAnswers = item.acceptedAnswers.map(cleanTokenString).filter(Boolean);
                  if (!item.acceptedAnswers.includes(item.expectedAnswer)) {
                    item.acceptedAnswers.unshift(item.expectedAnswer);
                  }
                }
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

    // =========================================================================
    // TRATAMIENTO UNÍVOCO DEL AUDIO Y PRINCIPIO EPISTÉMICO DE EVIDENCIA FÍSICA
    // =========================================================================
    const slideTextForAudio = `${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${(rawSlide.interaction as any)?.instruction || ''} ${(rawSlide.referenceContent as any)?.title || ''} ${(rawSlide.referenceContent as any)?.body || ''} ${(rawSlide.referenceContent as any)?.content || ''} ${(rawSlide.interaction as any)?.audioLabel || ''}`.trim();
    const hasAudioEvidence = hasExplicitAudioEvidence(slideTextForAudio);

    const refIsAudio = rawSlide.referenceContent &&
      (rawSlide.referenceContent.type === 'media' || (rawSlide.referenceContent as any).type === 'audio' || (rawSlide.referenceContent as any).type === 'listening') &&
      ((rawSlide.referenceContent as any).mediaType === 'audio' || (rawSlide.referenceContent as any).mediaType === 'listening' || !(rawSlide.referenceContent as any).mediaType);

    if (refIsAudio) {
      if (!hasAudioEvidence) {
        // Metadato documental aislado o bloque multimedia sintético sin evidencia física de escucha: PURGAR
        rawSlide.referenceContent = null;
        rawSlide.layout = 'single_column';
        if (rawSlide.interaction) {
          delete rawSlide.interaction.verificationAudioUrl;
          delete rawSlide.interaction.audioLabel;
        }
      } else {
        const audioTitle = rawSlide.referenceContent.title || '';
        const audioUrl = rawSlide.referenceContent.url && rawSlide.referenceContent.url !== 'placeholder:audio-track'
          ? rawSlide.referenceContent.url
          : undefined;

        const trackInfo = extractAudioTrackInfo(slideTextForAudio);
        const audioLabel = trackInfo?.audioLabel || (audioTitle !== 'placeholder:audio-track' ? audioTitle : 'Audio');
        const finalAudioUrl = audioUrl || trackInfo?.audioUrl || `/audio/${audioLabel.replace(/[^a-zA-Z0-9.-]+/g, '_')}.mp3`;

        if (rawSlide.interaction) {
          // Mapear exclusivamente a los metadatos de la interacción
          if (!rawSlide.interaction.verificationAudioUrl) {
            rawSlide.interaction.verificationAudioUrl = finalAudioUrl;
          }
          if (!rawSlide.interaction.audioLabel) {
            rawSlide.interaction.audioLabel = audioLabel;
          }
          // Descartar referenceContent para que no active split_50_50
          rawSlide.referenceContent = null;
          rawSlide.layout = 'single_column';
        } else {
          // Diapositiva puramente de escucha (sin interacción activa): layout single_column
          rawSlide.layout = 'single_column';
        }
      }
    } else if (rawSlide.interaction) {
      if (!hasAudioEvidence && rawSlide.interaction.verificationAudioUrl) {
        // Audio sintético generado sin evidencia física auditiva: erradicar
        delete rawSlide.interaction.verificationAudioUrl;
        delete rawSlide.interaction.audioLabel;
      } else if (hasAudioEvidence && !rawSlide.interaction.verificationAudioUrl) {
        const trackInfo = extractAudioTrackInfo(slideTextForAudio);
        if (trackInfo) {
          rawSlide.interaction.verificationAudioUrl = trackInfo.audioUrl;
          if (!rawSlide.interaction.audioLabel) {
            rawSlide.interaction.audioLabel = trackInfo.audioLabel;
          }
        }
      }
    }

    // Detección y normalización ontológica de metadatos espurios en referenceContent:
    // Las oraciones modelo ("Example"), instrucciones y demostraciones pedagógicas resueltas
    // son metadatos de la actividad: DEBEN residir dentro del encabezado ('instruction' o el primer ítem con isExample),
    // NUNCA separarse como si fueran un bloque de lectura independiente ('referenceContent').
    if (rawSlide.referenceContent && isSpuriousReferenceMetadata(rawSlide.referenceContent, rawSlide.interaction, rawSlide.subtitle, rawSlide.title)) {
      const spuriousText = (rawSlide.referenceContent.body || rawSlide.referenceContent.content || '').trim();
      const isAnsKey = isAnswerKeyContent(spuriousText, rawSlide.referenceContent.title, rawSlide.referenceContent.subtitle);
      const isWb = isWordBankContent(rawSlide.referenceContent, rawSlide.interaction);

      if (isWb) {
        const extractedTerms = extractWordBankTerms(rawSlide.referenceContent);
        if (rawSlide.interaction) {
          if (!Array.isArray(rawSlide.interaction.wordBank) || rawSlide.interaction.wordBank.length === 0) {
            rawSlide.interaction.wordBank = extractedTerms;
          } else {
            rawSlide.interaction.wordBank = Array.from(new Set([...rawSlide.interaction.wordBank, ...extractedTerms]));
          }
          decoupleWordBankTokensAndPreserveContext(rawSlide, effectiveContext);
        }
      } else if (isAnsKey) {
        const keys = parseAllAnswerKeys(spuriousText);
        for (const [secKey, secMap] of Object.entries(keys)) {
          harvestedAnswerKeys[secKey] = { ...(harvestedAnswerKeys[secKey] || {}), ...secMap };
        }
      } else {
        foldSpuriousMetadata(spuriousText, rawSlide);
      }

      rawSlide.referenceContent = null;
      if (rawSlide.contextBody && (rawSlide.contextBody === spuriousText || spuriousText.includes(rawSlide.contextBody))) {
        rawSlide.contextBody = undefined;
      }
    }

    // Principio de Asignación Única y Exclusión Mutua de Contenido:
    // Ningún fragmento del recorte debe duplicarse entre 'referenceContent' e 'interaction'.
    // Si la totalidad del recorte corresponde a los reactivos del ejercicio (instrucción + enunciados interactivos),
    // 'referenceContent' DEBE ser estrictamente null.
    if (rawSlide.referenceContent && rawSlide.interaction) {
      const refText = (rawSlide.referenceContent.body || rawSlide.referenceContent.content || '').trim();
      if (refText) {
        const interactionItems = extractInteractionItemsForDeduplication(rawSlide.interaction);
        if (isDuplicateReferenceContent(refText, interactionItems)) {
          rawSlide.referenceContent = null;
          if (rawSlide.contextBody && (rawSlide.contextBody === refText || refText.includes(rawSlide.contextBody))) {
            rawSlide.contextBody = undefined;
          }
        }
      }
    }

    if (!rawSlide.interaction && rawSlide.subtitle) {
      rawSlide.subtitle = normalizeNonInteractiveInstruction(rawSlide.subtitle);
    }

    if (!rawSlide.referenceContent && rawSlide.contextBody && rawSlide.interaction) {
      if (isAnswerKeyContent(rawSlide.contextBody, rawSlide.title, rawSlide.subtitle)) {
        const keys = parseAllAnswerKeys(rawSlide.contextBody);
        for (const [secKey, secMap] of Object.entries(keys)) {
          harvestedAnswerKeys[secKey] = { ...(harvestedAnswerKeys[secKey] || {}), ...secMap };
        }
        rawSlide.contextBody = undefined;
      } else if (isWordBankContent({ type: 'text', content: rawSlide.contextBody }, rawSlide.interaction)) {
        const extractedTerms = extractWordBankTerms(rawSlide.contextBody);
        if (!Array.isArray(rawSlide.interaction.wordBank) || rawSlide.interaction.wordBank.length === 0) {
          rawSlide.interaction.wordBank = extractedTerms;
        } else {
          rawSlide.interaction.wordBank = Array.from(new Set([...rawSlide.interaction.wordBank, ...extractedTerms]));
        }
        rawSlide.contextBody = undefined;
      } else if (isSpuriousReferenceMetadata({ type: 'text', content: rawSlide.contextBody }, rawSlide.interaction, rawSlide.subtitle, rawSlide.title)) {
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
    //   necesita leer a la izquierda mientras interactúa a la derecha. NUNCA para audio o media.
    // - 'single_column': Es el layout por defecto para cualquier ejercicio de oraciones, listas o
    //   reactivos donde el contenido sea autosuficiente, o cuando no hay interacción activa.
    const hasAutonomousReadingOrTable = Boolean(
      rawSlide.referenceContent && (
        rawSlide.referenceContent.type === 'reference_table' ||
        rawSlide.referenceContent.type === 'table_reference' ||
        (rawSlide.referenceContent.type === 'text' && !isSpuriousReferenceMetadata(rawSlide.referenceContent, rawSlide.interaction, rawSlide.subtitle, rawSlide.title))
      )
    );
    rawSlide.layout = (hasAutonomousReadingOrTable && rawSlide.interaction) ? 'split_50_50' : 'single_column';

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

    // Observabilidad y Diagnóstico de Contexto Faltante / Resolución de Referencias
    const textToScan = `${rawSlide.title || ''} ${rawSlide.subtitle || ''} ${(rawSlide.interaction as any)?.instruction || ''} ${(rawSlide.referenceContent as any)?.instruction || ''} ${(rawSlide.referenceContent as any)?.content || ''}`.trim();
    const crossRef = detectCrossActivityReference(textToScan);

    if (crossRef) {
      if (effectiveContext) {
        // Grounding legítimo con contexto previo
        const extracted = extractItemsFromSlideContext(effectiveContext);

        if (rawSlide.referenceContent && rawSlide.referenceContent.type === 'text' && rawSlide.referenceContent.category === 'dialogue') {
          if (!Array.isArray(rawSlide.referenceContent.cues) || rawSlide.referenceContent.cues.length === 0) {
            const candidatePool = extracted.phrases.length > 0 ? extracted.phrases : extracted.words;
            if (candidatePool.length > 0) {
              rawSlide.referenceContent.cues = candidatePool.slice(0, 12);
            }
          }
        }

        if (rawSlide.interaction && rawSlide.interaction.type === 'input_fields') {
          if (!Array.isArray(rawSlide.interaction.wordBank) || rawSlide.interaction.wordBank.length === 0) {
            const candidatePool = extracted.words.length > 0 ? extracted.words : extracted.phrases;
            if (candidatePool.length > 0) {
              rawSlide.interaction.wordBank = candidatePool.slice(0, 12);
            }
          }
        } else if (rawSlide.interaction && rawSlide.interaction.type === 'selection') {
          if ((!Array.isArray(rawSlide.interaction.options) || rawSlide.interaction.options.length === 0) &&
              (!Array.isArray(rawSlide.interaction.questions) || rawSlide.interaction.questions.length === 0)) {
            if (extracted.phrases.length >= 2) {
              rawSlide.interaction.options = extracted.phrases.slice(0, 8).map((p, pIdx) => ({
                id: `opt-${pIdx + 1}`,
                text: p,
                isCorrect: pIdx === 0,
              }));
            }
          }
        }

        rawSlide.metadata = {
          ...(rawSlide.metadata || {}),
          diagnostics: {
            ...((rawSlide.metadata as any)?.diagnostics || {}),
            unresolvedContextReference: false,
            resolvedFromPreviousContext: true,
            referencedActivity: crossRef,
          },
        };
      } else {
        // Contexto no disponible: emitir advertencia estructurada y diagnóstico formal
        const activityLabel = rawSlide.title || (rawSlide.interaction as any)?.instruction || (rawSlide.referenceContent as any)?.instruction || '';
        console.warn(
          `[digitizeBook] Actividad con referencia cruzada sin diapositiva previa suministrada: "${crossRef}" en "${activityLabel}"`
        );
        rawSlide.metadata = {
          ...(rawSlide.metadata || {}),
          diagnostics: {
            ...((rawSlide.metadata as any)?.diagnostics || {}),
            unresolvedContextReference: true,
            referencedActivity: crossRef,
            warning: `Actividad con referencia cruzada detectada sin diapositiva previa suministrada: "${crossRef}"`,
          },
        };

        // Principio de Zero-Hallucination: no inventar bancos de palabras sustitutos ni pautas artificiales
        if (rawSlide.interaction && rawSlide.interaction.type === 'input_fields') {
          if (Array.isArray(rawSlide.interaction.wordBank) && rawSlide.interaction.wordBank.length > 0) {
            const isSyntheticBank = rawSlide.interaction.wordBank.every(
              (w: string) => !textToScan.toLowerCase().includes(w.toLowerCase()) && !(rawSlide.referenceContent?.content || '').toLowerCase().includes(w.toLowerCase())
            );
            if (isSyntheticBank && !rawSlide.referenceContent) {
              rawSlide.interaction.wordBank = [];
            }
          }
        }
      }
    } else if (rawSlide.metadata?.diagnostics?.unresolvedContextReference) {
      console.warn(
        `[digitizeBook] Actividad con referencia cruzada sin diapositiva previa suministrada reportada por el modelo en "${rawSlide.title || (rawSlide.interaction as any)?.instruction || ''}"`
      );
    }

    if (rawSlide.interaction && typeof rawSlide.interaction === 'object') {
      if (!rawSlide.interaction.instruction) {
        rawSlide.interaction.instruction = (rawSlide as any).instruction || rawSlide.subtitle || rawSlide.title || 'Complete the exercise.';
      }
      if (rawSlide.interaction.type === 'input_fields') {
        decoupleWordBankTokensAndPreserveContext(rawSlide, effectiveContext);
      } else if (rawSlide.interaction.type === 'buckets_matching') {
        normalizeBucketsMatchingInteraction(rawSlide, (rawSlide as any)._rawInstructionText);
      }
    }

    delete (rawSlide as any)._rawInstructionText;

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
    metadata: slide.metadata,
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
      metadata: slide.metadata,
      diagnostics: (slide.metadata as any)?.diagnostics,
    },
  };
}

/**
 * Builds the strict, unambiguous pedagogical System Prompt enforcing native Slide structured outputs.
 */
export function buildExtractionPrompt(
  imageCount: number,
  forcedTargetType?: ForcedTargetArchetype,
  previousSlideContext?: Slide | null
): string {
  return `You are an expert ELT (English Language Teaching) author, textbook editor, and master teacher.
You must analyze the provided ${imageCount} clipping(s) and emit directly a JSON object containing an array of "slides" matching the canonical ELT Slide schema.
${previousSlideContext ? `
================================================================================
PREVIOUS_SLIDE_CONTEXT: Contenido y material léxico pasivo de la diapositiva inmediatamente anterior para resolver referencias cruzadas legítimas.
[BANCO LÉXICO DE SOLO LECTURA (READ-ONLY): Este bloque contiene únicamente el texto de referencia y vocabulario previo para resolver referencias cruzadas legítimas (ej. "Use the phrases in 2a"). QUEDA ESTRICTAMENTE PROHIBIDO CLONAR, ARRASTRAR O REEMITIR LA INTERACCIÓN, PREGUNTAS O AUDIOS DE ESTE CONTEXTO EN LA NUEVA DIAPOSITIVA.]
${formatPreviousSlideContext(previousSlideContext)}
================================================================================
` : ''}
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
      "interaction": null or { ...InteractionBlock... },
      "metadata": { "diagnostics": { "unresolvedContextReference": true or false } }
    }
  ]
}

MULTI-SLIDE SEGMENTATION & CROSS-REFERENCING DIRECTIVES:
1. MULTI-SLIDE SEGMENTATION INVARIANT:
   - When the input image contains TWO OR MORE pedagogically independent and delimited activities (e.g., sequential numbering or labeling such as "1", "2" or "a", "b", or separate exercise headers/instructions):
     * The model MUST emit one distinct element in the "slides" array for EACH identified activity (e.g. [slide-1, slide-2, ...]).
     * It is STRICTLY FORBIDDEN to ignore visible activities or to arbitrarily merge separate, independent exercises into a single slide.
2. CROSS-REFERENCING RESOLUTION INVARIANT & STRICT ISOLATION OF INTERACTIVE ITEMS:
   - AISLAMIENTO ESTRICTO DE REACTIVOS (ZERO CROSS-SLIDE CLONING):
     * Los reactivos interactivos (preguntas, reactivos, selecciones, casillas, y audios de verificación) de CADA diapositiva se originan ÚNICA Y EXCLUSIVAMENTE a partir de los elementos impresos y visibles en el recorte actual.
     * Queda estrictamente prohibido arrastrar, clonar, fusionar o reemitir preguntas, opciones interactivas, audios ('verificationAudioUrl') o consignas presentes en 'PREVIOUS_SLIDE_CONTEXT'.
     * 'PREVIOUS_SLIDE_CONTEXT' es un banco léxico pasivo de solo lectura (read-only): sirve ÚNICAMENTE para consultar vocabulario, frases o expresiones solicitadas por la consigna (ejemplo: "Use the phrases in 2a to talk...").
     * Si el recorte actual corresponde a una dinámica oral/speaking ("Work in pairs", "Speaking"), NO debe crearse ninguna interacción evaluable ni copiarse la interacción de la diapositiva anterior: debe estructurarse con interaction: null, isGraded: false, y layout: 'single_column'.
   - CAPACIDAD DEDUCTIVA LEGÍTIMA: El modelo debe usar su razonamiento pedagógico para deducir claves de respuesta ('isCorrect', 'expectedAnswer') y configurar la interacción idónea a partir de la evidencia disponible en el recorte y el vocabulario provisto en 'PREVIOUS_SLIDE_CONTEXT'.
   - PROHIBICIÓN DE SÍNTESIS NO FUNDAMENTADA (ZERO-HALLUCINATION): El modelo tiene estrictamente prohibido inventar bancos de vocabulario o contenidos sustitutos que no existan ni en el recorte actual ni en 'PREVIOUS_SLIDE_CONTEXT'.
   - OBSERVABILIDAD DE CONTEXTO FALTANTE: Si la consigna del recorte refiere a un ejercicio previo pero 'PREVIOUS_SLIDE_CONTEXT' no fue suministrado (o es nulo) y el material previo no es visible en la captura, el modelo NO debe inventar contenido sustituto; debe emitir los reactivos observables y registrar en metadatos:
     "metadata": { "diagnostics": { "unresolvedContextReference": true } }
3. PRINCIPIO UNIVERSAL DE DENSIDAD MÁXIMA Y ERGONOMÍA (SLIDE ERGONOMICS & COGNITIVE LOAD):
   - Al digitalizar cualquier actividad interactiva basada en un texto o diálogo de referencia:
     * INTEGRIDAD DEL CONTENIDO DE SOPORTE: El texto de lectura o soporte DEBE mantenerse íntegro en el contenedor de referencia ('contextBody' / 'referenceContent'). Queda estrictamente prohibido recortar, resumir o mutilar el material de lectura de apoyo.
     * MUESTRA FOCALIZADA Y REPRESENTATIVA: El panel interactivo (preguntas, reactivos, selecciones o huecos) DEBE ser una muestra focalizada y representativa del objetivo pedagógico (máximo 4 a 8 reactivos clave), nunca un despiece exhaustivo línea por línea del texto de apoyo.
     * PROHIBICIÓN DE BATERÍAS MASIVAS: Queda estrictamente prohibido generar baterías masivas de reactivos que desborden visualmente la diapositiva o saturen el layout interactivo en dos columnas densas. Priorizar la síntesis pedagógica sobre la exhaustividad mecánica.
4. PRINCIPIO EPISTÉMICO DEL SOLUCIONARIO / ANSWER KEY (GROUND TRUTH SUPREMO):
   - Cuando entre los recortes de entrada (imágenes procesadas o contexto) se incluya un Solucionario, Clave de Respuestas (Answer Key) o Teacher's Notes:
     * FUENTE SUPREMA DE VERDAD (GROUND TRUTH): Dicho material actúa como la FUENTE SUPREMA DE VERDAD (Ground Truth) para resolver 'expectedAnswer', 'isCorrect', 'tokens' o emparejamientos en los reactivos interactivos.
     * ALINEACIÓN UNÍVOCA DE CLAVES: Si detectas un recorte o sección con formato de Solucionario / Answer Key (e.g. listas tipo "1a) 2...", "1b) 2 tidy up...", "Answers: 1 B, 2 A..."):
       a) Alinear unívocamente cada clave del solucionario con el reactivo correspondiente del ejercicio.
       b) Asignar 'expectedAnswer' y 'isCorrect' basándose de forma estricta y literal en la clave oficial, anulando cualquier conjetura probabilística o deducción libre del LLM.
       c) En ejercicios de completado con banco de palabras ('input_fields' con 'wordBank'), asegurar que los estímulos se completen usando las colocaciones y complementos certificados por la clave, manteniendo limpios los espacios en blanco sin inyectar variables rotas ('[blank]' o '[?]').
     * CERO DIAPOSITIVAS DE SOLUCIONARIO: Bajo ninguna circunstancia el Solucionario debe transformarse en una diapositiva independiente en el arreglo "slides". Queda estrictamente prohibido emitir diapositivas cuyo contenido sea la clave o solucionario. Su función es puramente resolutiva/epistémica en tiempo de extracción.
     * CERO FILTRACIÓN EN CONTENIDO VISIBLE: El Solucionario NUNCA debe filtrarse como 'referenceContent', 'contextBody' o texto de lectura visible para el estudiante.

CANONICAL ARCHETYPES:
1. "referenceContent" (Passive consultation material) & STRICT DOCUMENTARY FIDELITY:
   - ASIGNACIÓN ESTRUCTURAL DE CAJAS DE PALABRAS (WORDBANK vs REFERENCECONTENT):
     * Si el recorte del ejercicio contiene una caja o lista de palabras a insertar ('wordBank', "words in the box", "vocabulary box"):
       - Los términos se asignan EXCLUSIVAMENTE a 'interaction.wordBank'.
       - 'referenceContent' DEBE ser estrictamente null y el layout DEBE ser 'single_column' (salvo que exista un texto de lectura continuo o tabla legítima independiente del banco).
       - Queda estrictamente prohibido aislar una caja de palabras como 'referenceContent' (ni como texto ni como tabla) ni activar 'split_50_50' por causa del banco de palabras.
   - PROHIBICIÓN ABSOLUTA DE SOLUCIONARIOS EN 'referenceContent':
     * Bajo ninguna circunstancia un solucionario, clave de respuestas o notas del docente deben situarse en 'referenceContent'. Su función es puramente resolutiva/epistémica a nivel de extracción.
   - PRINCIPIO DE ASIGNACIÓN ÚNICA Y EXCLUSIÓN MUTUA DE CONTENIDO:
     * Ningún fragmento del recorte debe duplicarse entre 'referenceContent' e 'interaction'.
     * Si la totalidad del recorte corresponde a los reactivos del ejercicio (instrucción + enunciados interactivos), 'referenceContent' DEBE ser estrictamente null.
     * 'referenceContent' existe únicamente cuando hay un cuerpo de lectura independiente previo y separado de las preguntas.
   - PRINCIPIO DE CERO ALUCINACIÓN / CERO SÍNTESIS EN 'referenceContent' (FIDELIDAD DOCUMENTAL ESTRICTA):
     * 'referenceContent' debe contener EXCLUSIVAMENTE texto que esté visible e impreso físicamente en el recorte (OCR verbatim: un artículo, una transcripción de audio, un diálogo con hablantes o una tabla de consulta).
     * Queda estrictamente prohibido generar, resumir o redactar texto explicativo que no figure en la imagen fuente (como descripciones de la tarea tipo "Practice expressing...", explicaciones sintéticas, resúmenes de propósito pedagógico o notas del docente).
     * Si el recorte no incluye un bloque de texto de lectura o soporte impreso, 'referenceContent' DEBE ser estrictamente null.
   - DETERMINACIÓN ONTOLÓGICA DEL LAYOUT (SIN FILTROS HEURÍSTICOS):
     * 'split_50_50': Se utiliza ÚNICAMENTE cuando existe un texto continuo de consulta autónomo (un artículo, un audioscript, un diálogo completo, o una tabla de consulta) visiblemente impreso en la imagen que el estudiante necesita leer a la izquierda mientras interactúa a la derecha.
     * 'single_column': Es el layout por defecto para cualquier ejercicio de oraciones, listas o reactivos donde el contenido sea autosuficiente (sin texto de lectura impreso en la imagen), así como para diapositivas puramente expositivas/teóricas sin elementos interactivos.
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
   - CRITERIO DE CALIFICACIÓN ONTOLÓGICA POSITIVA PARA 'referenceContent':
     * Un bloque de texto califica como 'referenceContent' ÚNICAMENTE si constituye material de lectura continuo autónomo (artículo, historia, diálogo estructurado con >= 2 hablantes identificados, transcripción o tabla formal).
     * Si el texto es una consigna, directiva huérfana o un modelo de pregunta aislado (e.g. "Use the phrases in 2a...", "Work in pairs..."), DEBE ser absorbido en el encabezado de la interacción ('instruction' / 'prompt') o descartado, dejando 'referenceContent: null' y layout: 'single_column'.
   - TRATAMIENTO UNÍVOCO DEL AUDIO Y PRINCIPIO EPISTÉMICO DE EVIDENCIA FÍSICA (ZERO SYNTHETIC AUDIO):
     * EVIDENCIA FÍSICA UNÍVOCA: Un recurso de audio (pista de comprobación o ejercicio de escucha) solo existe SI Y SOLO SI en los píxeles del recorte figura evidencia auditiva explícita (directivas verbales de escucha como "Listen", "Hear", "Recording", "CD Track", "Audio" o glifos inequívocos de auriculares/altavoz).
     * AISLAMIENTO DE METADATOS DE ÍNDICE: Códigos alfanuméricos aislados (referencias a apéndices de vocabulario como 'VR1.2', 'V1.1', tablas gramaticales 'G2.1', o páginas 'p. 145') constituyen EXCLUSIVAMENTE metadatos de referencia documental, JAMÁS pistas multimedia. Queda estrictamente prohibido deducir reproductores de audio a partir de etiquetas de apéndice o sintetizar frases ficticias no presentes en la imagen. En ausencia de evidencia auditiva física explícita, 'verificationAudioUrl' DEBE permanecer 'undefined'.
     * Si existe evidencia física de audio asociada a un ejercicio de práctica o autoverificación: DEBE mapearse exclusivamente como metadato del ejercicio ('interaction.verificationAudioUrl' y 'interaction.audioLabel').
     * Bajo NINGUNA circunstancia un audio de ejercicio interactivo debe registrarse como 'referenceContent' ni activar 'split_50_50'. En tales casos, 'referenceContent' DEBE ser estrictamente null y el layout 'single_column'.
     * 'referenceContent' de tipo 'media' (audio) se reserva ÚNICAMENTE para audios de comprensión/escucha pasiva autónoma sin reactivos interactivos (interaction: null, isGraded: false).
   - PRESERVACIÓN OBLIGATORIA DE MARCADORES DE POSICIÓN / ANCLAS DE INSERCIÓN:
     * En textos de lectura, artículos o diálogos que contengan números de inserción de huecos (e.g. números volados/superscripts ¹, ², números de reactivo 1, 2, 3... al inicio de párrafos, encabezados de sección o dentro del flujo de lectura):
       - Preservar OBLIGATORIAMENTE la marca posicional dentro del texto en formato canónico visible: '[ 1 ]', '[ 2 ]', '[ 3 ]', etc.
       - Queda estrictamente PROHIBIDO purgar, omitir o eliminar estos dígitos del cuerpo de lectura ('referenceContent.content' / 'referenceContent.body') cuando representen anclas de inserción para los reactivos interactivos.
   - STRICT FIDELITY: Strictly transcribe literal text. NEVER generate synthetic summaries or pedagogical explanations.

2. "interaction" (Active evaluated exercise):
   - "input_fields": For fill-in-the-blanks, Cloze sentences, or 2D fill-in grids (layoutMode: "table").
     * NORMALIZACIÓN DE EJEMPLOS RESUELTOS (isExample: true):
       - Evitar recortar o truncar sintagmas del prompt si la respuesta ya contiene la estructura completa.
       - 'prompt' debe contener únicamente el prefijo u ordinal canónico ('1.') y 'expectedAnswer' la oración completa resuelta, renderizándose como bloque cerrado de lectura de modelo.
     * STRICT PROHIBITION AGAINST DEGRADING CLOSED SELECTION: It is STRICTLY FORBIDDEN to degrade closed-selection exercises (e.g. options separated by slashes "was / were", bold contrasting words, or instructions like "Circle/Choose the correct word/number") into free-text input fields ("input_fields"). Never fragment sentences artificially or force the student to type what they were only meant to select!
     * MISSING LETTERS / VOWELS EXERCISES (e.g. "Write the vowels", "Fill in the missing letters"):
       - NO MICROSCOPIC LETTER FRAGMENTATION: DO NOT fragment words into multiple tiny single-letter inputs (e.g. NEVER generate separate inputs for each missing letter in "v_ll_yb_ll"). Each interactive input field MUST correspond to the whole completed word that the student writes (expectedAnswer: "volleyball"). The prompt or prefix can show the partial word pattern (e.g. "v_ll_yb_ll").
       - PRESERVE COLLOCATION / SENTENCE STRUCTURE: Keep the root verb or phrase (e.g. "play", "go", "go to") as a clear textual prefix or prompt of the item.
       - ZERO DUPLICATION / SELF-SUFFICIENT: This direct vocabulary task is completely self-contained; referenceContent MUST be strictly null and layout MUST be "single_column".
     * MATCHING VIA INPUT FIELDS: If an exercise asking to match options/headings to sections or sentences is modeled using input_fields, it MANDATORILY MUST include the "wordBank" containing the exact printed list of options/headings to match.
     * NEVER EMIT ORPHAN BLANKS: Never emit empty fill-in inputs without providing the printed bank of candidate options/headings in "wordBank" or as matching tokens.
     * PRINCIPIO DE PRESERVACIÓN CONTEXTUAL Y DESACOPLAMIENTO DE TOKENS ('input_fields' + 'wordBank'):
       - PROHIBICIÓN DE REACTIVOS VACÍOS DE CONTEXTO:
         * Queda estrictamente prohibido que un reactivo de 'input_fields' tenga como 'prompt' únicamente el ordinal o índice numérico (e.g. "2.", "3.") dejando al estudiante sin estímulo visible sobre el que interactuar.
       - REGLA UNIVERSAL DE DESACOPLAMIENTO (TOKEN VS. CONTEXTO RECEPTOR):
         * Si la clave oficial ('expectedAnswer' o Answer Key) corresponde a una colocación o sintagma compuesto (e.g. "A + B") y el subelemento "A" (o "B") está presente en 'interaction.wordBank':
           a) El elemento provisto por el banco se asigna como 'expectedAnswer' (el valor a ingresar/arrastrar en el espacio).
           b) El elemento contextual complementario debe permanecer visible dentro del 'prompt', delimitando con precisión la posición del hueco mediante la sintaxis canónica: e.g. "{{blank}} [complemento]" o "[prefijo] {{blank}}".
         * Si la consigna exige escribir la construcción completa pero la base textual receptora proviene de un recorte previo o estímulo visible, el 'prompt' debe presentar el estímulo de referencia antes del campo de entrada para que el alumno cuente con el andamiaje semántico necesario para responder.
       - Printed word boxes or candidate vocabulary lists belong strictly in "interaction.wordBank".
       - Blanks must be clean without orphan or broken gap markers (never inject '[blank]', '[?]', etc.). Keep stimuli naturally readable with canonical '{{blank}}'.
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
     * DESAMBIGUACIÓN ONTOLÓGICA DE DELIMITADORES SLASH ('/'): DISYUNCIÓN (SELECTION) vs. FRAGMENTACIÓN SINTÁCTICA (INPUT_FIELDS / ORDERING):
       - El símbolo '/' (o comas/guiones entre tokens) tiene dos funciones ontológicas incompatibles que deben discriminarse mediante análisis contextual multidimensional:

       A. Arquetipo SELECTION (Disyunción / Opciones Alternativas):
          - Criterios concurrentes:
            * Consigna directiva orientada a discriminación, exclusión o elección (e.g. 'which... does not go', 'cross out', 'choose', 'circle').
            * Baja densidad de fragmentos (habitualmente 2 a 4 por reactivo).
            * Los fragmentos son sintagmas homogéneos paralelos que compiten entre sí dependientes de una palabra o verbo ancla (e.g. "work in a school / an office / a receptionist").
            * Ausencia de signos de puntuación oracional terminal ('?', '.') como token aislado.
          - Mapeo:
            * El segmento base común constituye el 'prompt' de la pregunta (e.g. "work in").
            * Cada elemento delimitado se mapea directamente como un ítem individual dentro de 'options' (["a school", "an office", "a receptionist"]).
            * Queda estrictamente prohibido transformar estas estructuras en oraciones con huecos ("[ ? ]", "{{blank}}") o incluir opciones dentro del prompt de la pregunta.

       B. Arquetipo INPUT_FIELDS / ORDERING (Fragmentación / Reconstrucción de Oraciones):
          - Criterios concurrentes:
            * Consigna directiva orientada a construcción o ensamblaje oracional (e.g. 'make questions', 'put the words in order', 'unscramble', 'write sentences').
            * Alta densidad de fragmentos (5 o más tokens heterogéneos: auxiliares, pronombres, sustantivos, preposiciones).
            * Presencia de signos de puntuación aislados o terminales (e.g. '?', '.') dentro de la secuencia (e.g. "been / in / the / you / last / clubbing / month / Have ?").
            * Presencia de línea física de escritura (continua o punteada) para producir la oración entera.
          - Comportamiento de Mapeo:
            * Se modela obligatoriamente como interaction.type: 'input_fields' con layoutMode: 'list'.
            * 'prompt': La secuencia desordenada literal verbatim (e.g. "been / in / the / you / last / clubbing / month / Have ?").
            * 'expectedAnswer': La oración completa ordenada, extraída directamente del Solucionario/Answer Key provisto (e.g. "Have you been clubbing in the last month?").
            * Queda estrictamente PROHIBIDO desglosar la secuencia en múltiples casillas, degradarla a radio buttons de selección o inyectar placeholders {{blank}} que rompan los tokens.
     * ENUNCIADOS DE DISCRIMINACIÓN NEGATIVA ("Cross out" / "Odd one out"):
       - En tareas donde la instrucción solicite identificar o descartar el elemento incorrecto/sobrante (ejemplo: "Cross out the incorrect word", "Which one doesn't fit?", "Cross out the word/phrase that does not go with"):
         * La opción que debe marcarse como 'isCorrect: true' es aquella que NO encaja con la base léxica (el elemento intruso o distractor a tachar).
         * Las opciones que sí colocalizan correctamente con la base léxica deben tener 'isCorrect: false'.
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
   - "writing": STRICT RESTRICTION (GENUINELY OPEN WRITTEN TASKS ONLY):
     * Reserve interaction.type: "writing" EXCLUSIVELY for genuinely open-ended written communicative production tasks (personal opinion essays, paragraphs, emails, compositions). Set isGraded: false.
     * PROHIBICIÓN ESTRICTA SOBRE DINÁMICAS ORALES (Speaking / Pairwork): Queda estrictamente prohibido degradar consignas de expresión oral ("Work in pairs", "Speaking", "Ask questions", "Talk to a partner") hacia el arquetipo de redacción escrita ('writing'). En dinámicas orales: NO debe generarse textarea de redacción, ni contador de palabras ('minWords'), ni rúbricas de ensayo. Deben estructurarse como diapositiva comunicativa en 'single_column' con 'interaction: null', 'isGraded: false', y la consigna y preguntas/modelos visibles en 'referenceContent'.
     * PROHIBICIÓN DE ANDAMIAJES SINTÉTICOS (CERO GUIDELINES / MINWORDS INVENTADOS): Queda estrictamente prohibido inventar o sintetizar 'guidelines', 'rubric' o metas de palabras ('minWords', 'maxWords') si no están impresas explícitamente en la imagen fuente. Solo incluir 'minWords' o 'maxWords' si el texto impreso especifica una cantidad ("Write at least 50 words").
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
  options?: { forcedTargetType?: ForcedTargetArchetype; previousSlideContext?: Slide | null }
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

  const promptText = buildExtractionPrompt(imageList.length, options?.forcedTargetType, options?.previousSlideContext);

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
            const validatedSlides = validateAndParseSlides(rawText, options?.previousSlideContext);
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
            const validatedSlides = validateAndParseSlides(rawContent, options?.previousSlideContext);
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
    const isExample = Boolean(it.isExample);
    
    let prompt = (isPureNumber && explanation)
      ? (rawPrompt ? `${rawPrompt} _______ : ${explanation}` : `${idx + 1}. _______ : ${explanation}`)
      : (rawPrompt || `Item ${idx + 1}`);

    if (isExample) {
      const ordMatch = rawPrompt.match(/^(\(?\d+[.)]?)/);
      const canonicalOrdinal = ordMatch
        ? (ordMatch[1].replace(/[()]/g, '').endsWith('.') ? ordMatch[1].replace(/[()]/g, '') : `${ordMatch[1].replace(/[()]/g, '')}.`)
        : `${idx + 1}.`;
      const rawPromptWithoutOrd = rawPrompt.replace(/^(\(?\d+[.)]?\s*)/, '').trim();
      const expected = stripOrphanTypographicalMarkers(String(it.expectedAnswer || '').trim());
      const isCompleteStructure =
        Boolean(expected) &&
        (
          expected.split(/\s+/).length >= 3 ||
          expected.includes('?') ||
          /^\s*(?:\(?\d+[.)]?|[a-z][.)])?\s*$/i.test(rawPrompt) ||
          (Boolean(rawPromptWithoutOrd) && (
            expected.toLowerCase() === rawPromptWithoutOrd.toLowerCase() ||
            expected.toLowerCase().includes(rawPromptWithoutOrd.toLowerCase()) ||
            rawPromptWithoutOrd.toLowerCase().includes(expected.toLowerCase())
          ))
        );

      if (isCompleteStructure) {
        prompt = canonicalOrdinal;
      }
    }

    const expectedAnswer = stripOrphanTypographicalMarkers(String(it.expectedAnswer || '').trim()) || (isOpenProductionTask ? '' : `Respuesta ${idx + 1}`);

    // If this is an identification task ("Underline / Circle / Identify"), restore full intact sentence if blank was created
    if (isIdentifyDirective && /_{2,}/.test(prompt) && expectedAnswer && !isExample) {
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
      isExample,
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

  // Detection and sanitization of verification audio ("Listen and check", "CD1 Track X")
  const combinedSearchText = `${title} ${instruction} ${followUpPrompt || ''} ${referenceContent || ''} ${finalItems.map((i) => i.prompt).join(' ')}`;

  if (hasExplicitAudioEvidence(combinedSearchText)) {
    const audioInfo = extractAudioTrackInfo(combinedSearchText);
    if (audioInfo) {
      if (!audioLabel) audioLabel = audioInfo.audioLabel;
      if (!verificationAudioUrl) verificationAudioUrl = audioInfo.audioUrl;
    }
  } else {
    // Zero Synthetic Audio: En ausencia de evidencia física auditiva explícita, verificationAudioUrl permanece undefined
    audioLabel = undefined;
    verificationAudioUrl = undefined;
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
