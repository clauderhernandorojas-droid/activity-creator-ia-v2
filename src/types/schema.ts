import { z } from 'zod';

// ==========================================
// A. CONTENIDO DE CONSULTA / REFERENCIA PASIVA
// ==========================================

export const ReferenceTextBlockSchema = z.object({
  type: z.literal('text'),
  id: z.string(),
  title: z.string().optional(),
  content: z.string(),
  category: z.enum(['reading', 'grammar_note', 'instructions', 'dialogue']).default('grammar_note'),
  imageUrl: z.string().optional(),
  images: z.array(z.string()).optional(),
});

export const ReferenceTableBlockSchema = z.object({
  type: z.literal('table_reference'),
  id: z.string(),
  title: z.string().optional(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  caption: z.string().optional(),
});

export const ReferenceMediaBlockSchema = z.object({
  type: z.literal('media'),
  id: z.string(),
  mediaType: z.enum(['audio', 'image']),
  url: z.string(),
  title: z.string().optional(),
  transcript: z.string().optional(),
});

export const ReferenceBlockSchema = z.discriminatedUnion('type', [
  ReferenceTextBlockSchema,
  ReferenceTableBlockSchema,
  ReferenceMediaBlockSchema,
]);

export type ReferenceTextBlock = z.infer<typeof ReferenceTextBlockSchema>;
export type ReferenceTableBlock = z.infer<typeof ReferenceTableBlockSchema>;
export type ReferenceMediaBlock = z.infer<typeof ReferenceMediaBlockSchema>;
export type ReferenceBlock = z.infer<typeof ReferenceBlockSchema>;

// ==========================================
// B. LAS 4 ÚNICAS PLANTILLAS UNIVERSALES DE INTERACCIÓN
// ==========================================

// 1. INPUT FIELDS (Rellenar espacios / respuesta escrita)
export const InputFieldListItemSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  expectedAnswer: z.string().optional(),
  acceptedAnswers: z.array(z.string()),
  hint: z.string().optional(),
  explanation: z.string().optional(),
  isExample: z.boolean().optional(),
});

export const InputFieldTableCellSchema = z.object({
  text: z.string().default(''),
  isInput: z.boolean().default(false),
  inputId: z.string().optional(),
  acceptedAnswers: z.array(z.string()).default([]),
  expectedAnswer: z.string().optional(),
  isExample: z.boolean().default(false),
  hint: z.string().optional(),
});

export const InputFieldsBlockSchema = z.object({
  type: z.literal('input_fields'),
  id: z.string(),
  instruction: z.string(),
  layoutMode: z.enum(['list', 'table', 'inline_paragraph']),
  wordBank: z.array(z.string()).optional(),
  // Para layoutMode: 'list'
  listItems: z.array(InputFieldListItemSchema).default([]),
  // Para layoutMode: 'table'
  tableHeaders: z.array(z.string()).default([]),
  tableRows: z.array(z.array(InputFieldTableCellSchema)).default([]),
  // Para layoutMode: 'inline_paragraph'
  paragraphTemplate: z.string().default(''), // Ej: "Yesterday, Mick {{input_1}} at 8:00 AM and {{input_2}} his coffee."
  paragraphInputs: z.record(z.string(), z.array(z.string())).default({}), // key: input_1 -> ["arrived", "got in"]
});

export type InputFieldListItem = z.infer<typeof InputFieldListItemSchema>;
export type InputFieldTableCell = z.infer<typeof InputFieldTableCellSchema>;
export type InputFieldsBlock = z.infer<typeof InputFieldsBlockSchema>;

// 2. SELECTION (Opciones y marcación)
export const SelectionOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  isCorrect: z.boolean().optional(),
  feedback: z.string().optional(),
});

export const SelectionQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  contextText: z.string().optional(),
  mode: z.enum(['single_choice', 'multiple_choice', 'dropdown']),
  options: z.array(SelectionOptionSchema),
});

export const SelectionBlockSchema = z.object({
  type: z.literal('selection'),
  id: z.string(),
  instruction: z.string(),
  // Dual support:
  // a) Quiz / Questionnaire Mode: per-item questions
  questions: z.array(SelectionQuestionSchema).optional().default([]),
  // b) Flat Selection Mode: flat list of selectable items/cards
  options: z.array(SelectionOptionSchema).optional(),
  allowMultiple: z.boolean().optional(),
});

export type SelectionOption = z.infer<typeof SelectionOptionSchema>;
export type SelectionQuestion = z.infer<typeof SelectionQuestionSchema>;
export type SelectionBlock = z.infer<typeof SelectionBlockSchema>;

// 3. BUCKETS MATCHING (Clasificación y emparejamiento)
// 3. BUCKETS / EMPAREJAMIENTO UNIVERSAL (MATCHING)
export const TargetSlotSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  color: z.string().optional(),
});

export const SourceItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  correctTargetId: z.string().optional(),
  isExample: z.boolean().optional(),
  hint: z.string().optional(),
});

export const CorrectPairSchema = z.object({
  sourceId: z.string(),
  targetId: z.string(),
});

export const MatchingPayloadSchema = z.object({
  sourceItems: z.array(SourceItemSchema),
  targetSlots: z.array(TargetSlotSchema),
  correctPairs: z.record(z.string(), z.string()).or(z.array(CorrectPairSchema)).optional(),
});

// Backward-compatible alias schemas
export const BucketTargetSchema = TargetSlotSchema;
export const BucketTokenSchema = z.object({
  id: z.string(),
  text: z.string(),
  correctBucketId: z.string(),
  isExample: z.boolean().optional(),
  hint: z.string().optional(),
});

export const BucketsMatchingBlockSchema = z.object({
  type: z.literal('buckets_matching'),
  id: z.string(),
  instruction: z.string(),
  buckets: z.array(BucketTargetSchema),
  tokens: z.array(BucketTokenSchema),
  // Canonical Universal Matching relation (N to M or 1 to 1)
  targetSlots: z.array(TargetSlotSchema).optional(),
  sourceItems: z.array(SourceItemSchema).optional(),
  correctPairs: z.record(z.string(), z.string()).or(z.array(CorrectPairSchema)).optional(),
});

export type TargetSlot = z.infer<typeof TargetSlotSchema>;
export type SourceItem = z.infer<typeof SourceItemSchema>;
export type CorrectPair = z.infer<typeof CorrectPairSchema>;
export type MatchingPayload = z.infer<typeof MatchingPayloadSchema>;
export type BucketTarget = z.infer<typeof BucketTargetSchema>;
export type BucketToken = z.infer<typeof BucketTokenSchema>;
export type BucketsMatchingBlock = z.infer<typeof BucketsMatchingBlockSchema>;
export type MatchingBlock = BucketsMatchingBlock;

// 4. SEQUENCE (Orden secuencial)
export const SequenceItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  correctOrder: z.number(), // 1-indexed
  speaker: z.string().optional(),
  hint: z.string().optional(),
});

export const SequenceBlockSchema = z.object({
  type: z.literal('sequence'),
  id: z.string(),
  instruction: z.string(),
  items: z.array(SequenceItemSchema),
});

export type SequenceItem = z.infer<typeof SequenceItemSchema>;
export type SequenceBlock = z.infer<typeof SequenceBlockSchema>;

// UNIÓN DE INTERACCIONES EVALUABLES
export const InteractionBlockSchema = z.discriminatedUnion('type', [
  InputFieldsBlockSchema,
  SelectionBlockSchema,
  BucketsMatchingBlockSchema,
  SequenceBlockSchema,
]);

export type InteractionBlock = z.infer<typeof InteractionBlockSchema>;

// ==========================================
// C. ESTRUCTURA DE LA DIAPOSITIVA (SLIDE)
// ==========================================

export const SlideLayoutSchema = z.enum(['single_column', 'split_50_50', 'header_stacked']);
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;

export const SlideSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  layout: SlideLayoutSchema.default('split_50_50'),
  referenceContent: ReferenceBlockSchema.nullable().optional(),
  interaction: InteractionBlockSchema.nullable().optional(),
  cachedInteraction: InteractionBlockSchema.nullable().optional(),
  notes: z.string().optional(),
  isGraded: z.boolean().default(true).optional(),
});

export type Slide = z.infer<typeof SlideSchema>;

// ==========================================
// D. LECCIÓN / CURSO
// ==========================================

export const LessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  level: z.enum(['A1-A2', 'B1', 'B2', 'C1']),
  unit: z.string(),
  slides: z.array(SlideSchema),
});

export type Lesson = z.infer<typeof LessonSchema>;

// ==========================================
// E. FLUJO OCR Y EXTRACCIÓN LIMPIA (PASO 1 -> PASO 2)
// ==========================================

export const ExtractedTableCellSchema = z.object({
  text: z.string().default(''),
  isInput: z.boolean().default(false),
  expectedAnswer: z.string().optional(),
  acceptedAnswers: z.array(z.string()).default([]),
  isExample: z.boolean().default(false),
  hint: z.string().optional(),
});

export const ExtractedItemSchema = z.object({
  prompt: z.string(),
  expectedAnswer: z.string(),
  acceptedAnswers: z.array(z.string()).default([]),
  isExample: z.boolean().default(false),
  explanation: z.string().optional().default(''),
  options: z.array(z.string()).optional(),
  prefix: z.string().optional(),
});

export const ExtractedStructuredPayloadSchema = z.object({
  title: z.string(),
  instruction: z.string().optional(),
  referenceContent: z.string().nullable().optional(),
  wordBank: z.array(z.string()).default([]),
  interactionType: z.enum(['fill_blanks', 'multiple_choice', 'matching', 'buckets', 'reference']).default('fill_blanks'),
  buckets: z.array(z.string()).optional(),
  items: z.array(ExtractedItemSchema).default([]),
  tableHeaders: z.array(z.string()).optional(),
  tableRows: z.array(z.array(ExtractedTableCellSchema)).optional(),
  isGraded: z.boolean().default(true).optional(),
  visualImageIndices: z.array(z.number()).optional(),
});

export type ExtractedTableCell = z.infer<typeof ExtractedTableCellSchema>;
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;
export type ExtractedStructuredPayload = z.infer<typeof ExtractedStructuredPayloadSchema>;

export const ExtractedBlockSchema = z.object({
  id: z.string(),
  rawText: z.string(),
  detectedType: z.enum(['paragraph', 'table', 'numbered_list', 'dialogue', 'vocabulary']),
  confidence: z.number().min(0).max(1),
  sourceImageSnippetUrl: z.string().optional(),
  sourceImages: z.array(z.string()).optional(),
  parsedData: z.record(z.string(), z.any()).optional(),
});

export type ExtractedBlock = z.infer<typeof ExtractedBlockSchema>;

