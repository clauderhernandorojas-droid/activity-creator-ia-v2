import type { ExtractedBlock } from '../../types/schema';

export type ManualTemplateType = 'input_fields' | 'buckets' | 'selection' | 'reference_table';

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
      items: [
        {
          text: '1. She _______ (live) in London for three years.',
          expectedAnswer: 'has lived',
          acceptedAnswers: ['has lived', 'has been living', 'lived'],
          hint: 'Present perfect (affirmative)'
        },
        {
          text: '2. We _______ (already / see) that documentary.',
          expectedAnswer: 'have already seen',
          acceptedAnswers: ['have already seen', 'already saw', 'have seen'],
          hint: 'Present perfect with already'
        },
        {
          text: '3. They _______ (not finish) their homework yet.',
          expectedAnswer: "haven't finished",
          acceptedAnswers: ["haven't finished", 'have not finished', 'did not finish'],
          hint: 'Present perfect (negative)'
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
      suggestedBuckets: ['FOR', 'IN', 'TO', 'WITH'],
      tokens: [
        { text: 'apply', target: 'FOR' },
        { text: 'apologize', target: 'FOR' },
        { text: 'succeed', target: 'IN' },
        { text: 'participate', target: 'IN' },
        { text: 'belong', target: 'TO' },
        { text: 'listen', target: 'TO' },
        { text: 'agree', target: 'WITH' },
        { text: 'deal', target: 'WITH' }
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
      questions: [
        {
          id: 'q-manual-1',
          prompt: 'Which sentence correctly expresses an action started in the past and continuing now?',
          mode: 'single_choice',
          options: [
            { id: 'opt-1', text: 'She has lived here since 2018.', isCorrect: true, feedback: 'Correct! Present perfect with "since".' },
            { id: 'opt-2', text: 'She is living here since 2018.', isCorrect: false, feedback: 'Incorrect: Present continuous cannot express duration with since.' },
            { id: 'opt-3', text: 'She lives here since 2018.', isCorrect: false, feedback: 'Incorrect: Present simple is for general habits.' }
          ]
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
      headers: ['Tense', 'Time Marker', 'Example'],
      rows: [
        ['Past Simple', 'yesterday, in 2020, 2 days ago', 'I visited Rome last year.'],
        ['Present Perfect', 'already, yet, ever, never, so far', 'I have visited Rome twice.']
      ],
      caption: 'Rule: Use Past Simple for completed past time and Present Perfect for unfinished or unspecified time.'
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
 * Consolidates multiple extracted blocks or fragments into ONE single holistic pedagogical block.
 * A single pasted clipping represents ONE pedagogical activity.
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
    return {
      ...blocks[0],
      sourceImageSnippetUrl: sourceUrl || blocks[0].sourceImageSnippetUrl
    };
  }

  // Combine multiple blocks into a single cohesive activity block
  const rawText = blocks
    .map((b) => b.rawText.trim())
    .filter(Boolean)
    .join('\n\n');

  // Determine primary detectedType: vocabulary > numbered_list > table > dialogue > paragraph
  let detectedType: ExtractedBlock['detectedType'] = 'paragraph';
  if (blocks.some((b) => b.detectedType === 'vocabulary')) {
    detectedType = 'vocabulary';
  } else if (blocks.some((b) => b.detectedType === 'numbered_list')) {
    detectedType = 'numbered_list';
  } else if (blocks.some((b) => b.detectedType === 'table')) {
    detectedType = 'table';
  } else if (blocks.some((b) => b.detectedType === 'dialogue')) {
    detectedType = 'dialogue';
  }

  const titles = blocks.map((b) => b.parsedData?.title).filter(Boolean);
  const instructions = blocks.map((b) => b.parsedData?.instruction).filter(Boolean);

  const mergedParsed: Record<string, any> = {
    title: titles[0] || 'Actividad Didáctica Digitalizada',
    instruction: instructions.join(' ') || ''
  };

  const bucketsSet = new Set<string>();
  const tokens: any[] = [];
  const items: any[] = [];
  let tableHeaders: string[] = [];
  const tableRows: any[] = [];

  for (const b of blocks) {
    const pd = b.parsedData || {};
    const bList = pd.buckets || pd.suggestedBuckets || pd.categories;
    if (Array.isArray(bList)) {
      bList.forEach((c) => {
        if (typeof c === 'string') bucketsSet.add(c.trim());
        else if (c && typeof c === 'object' && c.label) bucketsSet.add(String(c.label).trim());
      });
    }
    if (Array.isArray(pd.tokens)) tokens.push(...pd.tokens);
    if (Array.isArray(pd.items)) items.push(...pd.items);
    if (Array.isArray(pd.headers) && tableHeaders.length === 0) tableHeaders = pd.headers;
    if (Array.isArray(pd.rows)) tableRows.push(...pd.rows);
  }

  if (bucketsSet.size > 0) {
    mergedParsed.buckets = Array.from(bucketsSet);
    mergedParsed.suggestedBuckets = Array.from(bucketsSet);
  }
  if (tokens.length > 0) mergedParsed.tokens = tokens;
  if (items.length > 0) mergedParsed.items = items;
  if (tableHeaders.length > 0) mergedParsed.headers = tableHeaders;
  if (tableRows.length > 0) mergedParsed.rows = tableRows;

  return {
    id: `consolidated-${Date.now()}`,
    rawText,
    detectedType,
    confidence: Math.max(...blocks.map((b) => b.confidence || 0.9)),
    sourceImageSnippetUrl: sourceUrl,
    parsedData: mergedParsed
  };
}

/**
 * Calls OpenRouter AI Vision API or returns structured extracted blocks.
 * Supports simultaneous multi-clipping processing in a single unified multimodal array.
 */
export async function digitizeBook(images: string | string[]): Promise<ExtractedBlock[]> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  const model = import.meta.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.5-flash';

  const imageList = Array.isArray(images) ? images.filter(Boolean) : [images];
  const primaryImage = imageList[0] || '';

  if (!apiKey || apiKey.trim() === '' || imageList.length === 0) {
    console.warn('[digitizeBook] No VITE_OPENROUTER_API_KEY found, returning standard parsed sample blocks.');
    return cloneSampleBlocks(primaryImage);
  }

  const prompt = `You are an expert ELT (English Language Teaching) textbook digitizer.
CRITICAL INSTRUCTION:
The user has provided ${imageList.length} image clipping(s). These clippings represent ONE SINGLE unified pedagogical activity from a textbook (for example: clipping 1 may contain the reading passage/article/dialogue, and clipping 2 may contain the accompanying exercise questions, headings to match, cloze sentences, or vocabulary categorization).
DO NOT fragment or split the clippings into separate blocks or tabs.
Extract everything holistically into ONE single consolidated block object.

Analyze the image(s) carefully:
1. "title": The main section or reading title (e.g. "Reading: The Secrets of Happiness", "Vocabulary: Day-to-day phrases").
2. "instruction": The complete exercise instruction (e.g. "Read the article and match headings A-D to paragraphs 1-4", "Complete the sentences with the correct preposition").
3. "content": If any clipping contains a reading passage, article, dialogue, or grammar reference text, provide the FULL complete verbatim transcription of the text here (preserving paragraphs and line breaks).
4. "paragraphs": If the reading text has numbered or lettered paragraphs (e.g. 1, 2, 3, 4), extract them as:
   [{"id": "1", "label": "Paragraph 1", "text": "paragraph text..."}].
5. "detectedType": Choose the best matching type for the primary interactive activity:
   - "numbered_list": for questions, cloze sentences, matching headings to paragraphs, or fill-in-blanks.
   - "vocabulary": for categorization / buckets / prepositions / sorting phrases.
   - "dialogue": for sequential conversational turns.
   - "table": for grammar charts or tabular data.
   - "paragraph": for pure reading text without exercises.

SPECIAL RULE FOR READING TEXTS WITH EXERCISES:
If both a reading text and an exercise are provided across the clippings:
- Transcribe the entire reading passage into "content".
- Put the exercise items (e.g. headings to match, questions, or sentences with blanks) into "items".

SPECIAL RULE FOR CATEGORIZATION / BUCKETS:
- "buckets": Array of clean category names, e.g. ["Family (F)", "Work (W)", "Free time (FT)"].
- "tokens": Array of objects for EVERY single phrase or item found:
  {"text": "phrase text", "target": "Family (F)"}.

SPECIAL RULE FOR NUMBERED LISTS / FILL IN BLANKS / COMPREHENSION QUESTIONS:
- "items": Array of all sentences or questions. FOR EVERY SINGLE ITEM, YOU MUST EXTRACT:
  - "text": The complete sentence with blank (e.g. "1. She _______ (live) in London for three years.") or question.
  - "expectedAnswer": MANDATORY canonical correct answer derived directly from the reading passage text or grammar rule (e.g. "has lived", "twenty years old"). NEVER LEAVE EMPTY.
  - "acceptedAnswers": MANDATORY array of valid alternative variants (e.g. ["has lived", "has been living", "lived"], ["twenty years old", "20 years old", "twenty", "20"], with or without initial prepositions/articles like 'the', 'a', short forms, numerals). NEVER LEAVE EMPTY. Must always include expectedAnswer.
  - "hint": (optional) brief clue, explanation or reading passage excerpt justifying where this answer is found (e.g. "From paragraph 2: '...she has lived...'").

Return ONLY a valid JSON array containing exactly ONE consolidated block object:
[
  {
    "id": "block-consolidated",
    "rawText": "complete exact combined transcription of all clippings",
    "detectedType": "vocabulary" | "numbered_list" | "table" | "dialogue" | "paragraph",
    "confidence": 0.98,
    "parsedData": {
      "title": "Exercise or Reading Title",
      "instruction": "Exercise Instruction",
      "content": "Full reading passage text if present...",
      "paragraphs": [{"id": "1", "text": "..."}],
      "buckets": ["Category 1", "Category 2"],
      "tokens": [{"text": "phrase 1", "target": "Category 1"}],
      "items": [
        {
          "text": "1. She _______ (live) in London for three years.",
          "expectedAnswer": "has lived",
          "acceptedAnswers": ["has lived", "has been living", "lived"],
          "hint": "Present perfect: 'has lived'"
        }
      ],
      "headers": ["Col 1", "Col 2"],
      "rows": [["Val 1", "Val 2"]]
    }
  }
]`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
        'X-Title': 'Activity Creator IA V2'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              ...imageList.map((url) => ({
                type: 'image_url',
                image_url: {
                  url
                }
              }))
            ]
          }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[digitizeBook] OpenRouter responded with ${response.status}: ${errText}. Using fallback extraction.`);
      return cloneSampleBlocks(primaryImage);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.warn('[digitizeBook] Empty response content from OpenRouter. Using fallback extraction.');
      return cloneSampleBlocks(primaryImage);
    }

    // Clean JSON response (strip markdown fences if present)
    const jsonStr = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    const rawArray = Array.isArray(parsed) 
      ? parsed 
      : (parsed && typeof parsed === 'object' ? [parsed] : []);

    if (rawArray.length > 0) {
      const parsedBlocks: ExtractedBlock[] = rawArray.map((item, idx) => ({
        id: item.id || `ocr-gen-${Date.now()}-${idx}`,
        rawText: item.rawText || '',
        detectedType: item.detectedType || 'paragraph',
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.95,
        sourceImageSnippetUrl: primaryImage,
        parsedData: item.parsedData || {}
      }));

      // Consolidate into 1 unified holistic activity block
      return [consolidateBlocks(parsedBlocks, primaryImage)];
    }

    console.warn('[digitizeBook] Parsed JSON is empty. Using fallback extraction.');
    return cloneSampleBlocks(primaryImage);
  } catch (error) {
    console.error('[digitizeBook] Error during vision API call:', error);
    return cloneSampleBlocks(primaryImage);
  }
}

function cloneSampleBlocks(sourceImageSnippetUrl?: string): ExtractedBlock[] {
  const fallback = createManualBlock('input_fields');
  fallback.sourceImageSnippetUrl = sourceImageSnippetUrl;
  return [fallback];
}
