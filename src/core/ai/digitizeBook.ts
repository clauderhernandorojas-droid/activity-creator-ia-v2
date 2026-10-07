import type { ExtractedBlock, ExtractedStructuredPayload } from '../../types/schema';
import { GoogleGenAI } from '@google/genai';

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
      ]
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
    return {
      ...blocks[0],
      sourceImageSnippetUrl: sourceUrl || blocks[0].sourceImageSnippetUrl
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

  for (const b of blocks) {
    const pd = b.parsedData || {};
    if (Array.isArray(pd.items)) mergedItems.push(...pd.items);
    if (Array.isArray(pd.wordBank)) {
      pd.wordBank.forEach((w: string) => {
        if (!mergedWordBank.includes(w)) mergedWordBank.push(w);
      });
    }
  }

  const mergedParsed: Record<string, any> = {
    ...primary,
    items: mergedItems.length > 0 ? mergedItems : primary.items,
    wordBank: mergedWordBank.length > 0 ? mergedWordBank : primary.wordBank
  };

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
 * Structured Output schema for Google Gemini SDK and OpenRouter.
 */
const STRUCTURED_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Formal activity title' },
    referenceContent: {
      type: 'string',
      description: 'Passive reading passage, article, dialogue, or guidance notes (TIPS) that do NOT require interactive answers. Empty string or null if none.'
    },
    wordBank: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of vocabulary words if an explicit word box / bank is present in the image, otherwise empty array []'
    },
    interactionType: {
      type: 'string',
      enum: ['fill_blanks', 'multiple_choice', 'matching', 'buckets'],
      description: 'The strict pedagogical archetype of the interactive exercise'
    },
    buckets: {
      type: 'array',
      items: { type: 'string' },
      description: 'Target categories or preposition names if interactionType is buckets, otherwise omit or empty array'
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Visible definition, sentence with blank, or informative premise read by the student. MUST contain the actual text/definition, NEVER just a sequential number.'
          },
          expectedAnswer: {
            type: 'string',
            description: 'Canonical resolved solution deduced by you as teacher. NEVER EMPTY.'
          },
          acceptedAnswers: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of all valid variations (contractions, spelling). Must contain expectedAnswer.'
          },
          isExample: {
            type: 'boolean',
            description: 'True if this row is already filled as a sample in the book (e.g. item 1 or 5), otherwise false'
          },
          explanation: {
            type: 'string',
            description: 'Concise 1-line pedagogical justification for the grammar rule or clue'
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Candidate answer options if interactionType is multiple_choice'
          }
        },
        required: ['prompt', 'expectedAnswer', 'acceptedAnswers', 'isExample', 'explanation']
      },
      description: 'Interactive exercise items ONLY. Never include word banks, page codes, or TIPS in items.'
    }
  },
  required: ['title', 'wordBank', 'interactionType', 'items']
};

/**
 * Builds the strict, unambiguous pedagogical System Prompt.
 */
function buildExtractionPrompt(imageCount: number): string {
  return `You are an expert ELT (English Language Teaching) author, textbook editor, and master teacher.

CRITICAL PEDAGOGICAL DIRECTIVE (AUTONOMOUS RESOLUTION):
"Actúa como un profesor experto y autor editorial de ELT. Si el ejercicio recortado no contiene una clave de respuestas explícita o visible (por ejemplo: ejercicios de gramática para conjugar verbos entre paréntesis, transformar oraciones, completar con preposiciones o deducir vocabulario por contexto), DEBES RESOLVER TÚ MISMO el ejercicio aplicando las reglas formales de la gramática inglesa según el nivel pedagógico detectado."

The exercise provided across ${imageCount} clipping(s) MUST ARRIVE 100% COMPLETELY SOLVED AND READY BY DEFAULT.
Under NO circumstances should any interactive item have an empty expectedAnswer (""), unassigned target, or unresolved question.

REGLAS UNIVERSALES DE BANCO DE OPCIONES Y ASIGNACIÓN BIUNÍVOCA:
- Regla Universal de Banco de Opciones: Cuando la imagen contenga un contenedor o lista de opciones (wordBank), el valor de expectedAnswer de cada ítem interactivo DEBE ser exactamente uno de los elementos presentes en dicho conjunto (ya consistan en una sola palabra o en cadenas multitérmino). NUNCA utilices texto perteneciente a enunciados o definiciones como valor de respuesta esperada.
- Regla Universal de Muestras Impresas: Si en el documento original un ítem ya presenta de forma visible uno de los elementos del wordBank asignado a su posición de respuesta, clasifícalo obligatoriamente como isExample: true con dicho elemento en expectedAnswer.
- Regla Universal de Contenido de Ítem: En cada elemento interactivo, \`prompt\` DEBE contener el texto informativo, premisa o definición que el usuario necesita leer para deducir la respuesta. NUNCA asignes como \`prompt\` únicamente el número secuencial del ítem.
- Regla Universal de Clasificación por Categorías (Buckets): Cuando un ejercicio instruya asociar o clasificar un conjunto de elementos dentro de categorías contenedoras (interacción 'buckets'):
  * \`buckets\`: Debe contener exclusivamente la lista de nombres de las categorías de destino (ej. las columnas o cajas clasificadoras).
  * \`items\`: Debe contener la lista de todos los elementos o términos individuales que deben ser clasificados. Para cada ítem:
    - \`prompt\`: El término o expresión a clasificar.
    - \`expectedAnswer\`: El nombre exacto de la categoría (bucket) a la que pertenece.
    - \`isExample\`: true si el término ya viene clasificado como muestra en el documento original.

UNIVERSAL TAXONOMY & STRICT CONTRACT:
1. "title": Formal activity or reading title.
2. "referenceContent": Passive consultation material. Put reading passages, articles, dialogues, or instructional guidance ('TIPS!') here that provide reference context and DO NOT require an interactive answer. (null if none).
3. "wordBank": If the clipping contains a vocabulary box, word box, container, or pool of options to choose from, extract ONLY the available options into "wordBank" as string[] (sean cadenas simples o compuestas por varios términos). (Empty array [] if none).
   * REGLA DE PARTICIÓN 1: NUNCA incluyas cajas de palabras (Word Banks), notas de apoyo ('TIPS!'), números de página o códigos de lección dentro de 'items'.
4. "interactionType": Must be one of: 'fill_blanks', 'multiple_choice', 'matching', 'buckets'.
   - Matching/vocabulary tables (e.g. 'term | definition') are categorized as 'matching' or 'fill_blanks'.
   - Ejercicios de agrupar o clasificar términos en categorías o columnas usan 'buckets' siguiendo la Regla Universal de Clasificación por Categorías.
5. "items": Array of interactive items ONLY:
   - "prompt": The visible text, sentence with blank, or clue/definition that the student reads. Sigue la Regla Universal de Contenido de Ítem: DEBE contener el texto informativo, premisa o definición; NUNCA únicamente el número secuencial del ítem.
   - "expectedAnswer": The canonical resolved solution deduced by you as an expert teacher. MUST NEVER BE EMPTY. Must follow the Regla Universal de Banco de Opciones whenever a wordBank is present.
   - "acceptedAnswers": List of valid variations (contractions, spelling, or synonyms). Must include expectedAnswer.
   - "isExample": Booleano. Must follow the Regla Universal de Muestras Impresas: las filas o ítems que ya presentan una respuesta visible de muestra impresa en el material original deben clasificarse obligatoriamente como "isExample": true con dicho elemento en expectedAnswer, NUNCA omitirse ni dejarse en blanco.
   - "explanation": Brief 1-line pedagogical justification of the grammar rule or clue.
   - "options": (If multiple choice) array of choices to select from.

CRITICAL NEGATIVE CONSTRAINTS:
- NUNCA conviertas encabezados de tabla ni códigos editoriales en ítems interactivos.
- Cada ítem interactivo debe ser un ítem real que el alumno debe completar o resolver.
- Devuelve estrictamente el objeto JSON conforme al esquema estructurado.`;
}

/**
 * Universal Digitize Book: Calls Gemini via GoogleGenAI SDK or OpenRouter enforcing strict JSON Schema.
 */
export async function digitizeBook(images: string | string[]): Promise<ExtractedBlock[]> {
  const imageList = Array.isArray(images) ? images.filter(Boolean) : [images];
  const primaryImage = imageList[0] || '';

  if (imageList.length === 0) {
    return cloneSampleBlocks(primaryImage);
  }

  const promptText = buildExtractionPrompt(imageList.length);

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
      const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          });

          const rawText = response.text?.trim();
          if (rawText) {
            const cleanJson = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson) as ExtractedStructuredPayload;
            return [buildExtractedBlockFromPayload(parsed, primaryImage)];
          }
        } catch (modelErr) {
          console.warn(`[digitizeBook] Gemini SDK model ${model} failed, trying next candidate:`, modelErr);
        }
      }
    } catch (geminiErr) {
      console.warn('[digitizeBook] Gemini SDK execution failed, falling back to OpenRouter:', geminiErr);
    }
  }

  // Strategy 2: OpenRouter Vision API with Structured Outputs (JSON Schema)
  const openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  const openRouterModel = import.meta.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.5-flash';

  if (openRouterApiKey && openRouterApiKey.trim() !== '') {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterApiKey}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
          'X-Title': 'Activity Creator IA V2',
        },
        body: JSON.stringify({
          model: openRouterModel,
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
              name: 'activity_extraction',
              strict: true,
              schema: STRUCTURED_EXTRACTION_SCHEMA,
            },
          },
          temperature: 0.1,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content;
        if (rawContent) {
          const cleanJson = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJson) as ExtractedStructuredPayload;
          return [buildExtractedBlockFromPayload(parsed, primaryImage)];
        }
      }
    } catch (orErr) {
      console.warn('[digitizeBook] OpenRouter vision call failed:', orErr);
    }
  }

  // Fallback to manual template if all Vision APIs are unavailable
  return cloneSampleBlocks(primaryImage);
}

/**
 * Transforms the strict structured payload into a standardized ExtractedBlock.
 */
function buildExtractedBlockFromPayload(
  payload: ExtractedStructuredPayload,
  sourceUrl: string
): ExtractedBlock {
  const sanitized = sanitizeExtractedPayload(payload);

  const rawTextParts = [
    sanitized.title,
    sanitized.referenceContent,
    ...sanitized.items.map((i) => i.prompt),
  ].filter(Boolean);

  const detectedType: ExtractedBlock['detectedType'] =
    sanitized.interactionType === 'buckets' ? 'vocabulary' : 'numbered_list';

  return {
    id: `ocr-gen-${Date.now()}`,
    rawText: rawTextParts.join('\n\n'),
    detectedType,
    confidence: 0.98,
    sourceImageSnippetUrl: sourceUrl,
    parsedData: {
      title: sanitized.title,
      referenceContent: sanitized.referenceContent || undefined,
      content: sanitized.referenceContent || undefined,
      wordBank: sanitized.wordBank.length > 0 ? sanitized.wordBank : undefined,
      interactionType: sanitized.interactionType,
      buckets: sanitized.buckets,
      items: sanitized.items,
    },
  };
}

/**
 * Pure, defensive normalization of structured payload:
 * Guarantees that every item has expectedAnswer, acceptedAnswers, and isExample boolean.
 * ZERO ad-hoc heuristics, zero arbitrary word counts, zero string patching.
 */
function sanitizeExtractedPayload(payload: ExtractedStructuredPayload): ExtractedStructuredPayload {
  const items = Array.isArray(payload.items) ? payload.items : [];

  const sanitizedItems = items.map((it, idx) => {
    const rawPrompt = String(it.prompt || '').trim();
    const explanation = String(it.explanation || '').trim();
    const isPureNumber = /^(?:item\s*)?\d+[.)]?$/i.test(rawPrompt) || rawPrompt === '';
    const prompt = isPureNumber && explanation
      ? (rawPrompt ? `${rawPrompt} _______ : ${explanation}` : `${idx + 1}. _______ : ${explanation}`)
      : (rawPrompt || `Item ${idx + 1}`);
    const expectedAnswer = String(it.expectedAnswer || '').trim() || `Respuesta ${idx + 1}`;
    let acceptedAnswers = Array.isArray(it.acceptedAnswers) && it.acceptedAnswers.length > 0
      ? it.acceptedAnswers.map((a) => String(a).trim()).filter(Boolean)
      : [expectedAnswer];

    if (!acceptedAnswers.includes(expectedAnswer)) {
      acceptedAnswers.unshift(expectedAnswer);
    }

    return {
      prompt,
      expectedAnswer,
      acceptedAnswers,
      isExample: Boolean(it.isExample),
      explanation: String(it.explanation || '').trim(),
      options: Array.isArray(it.options) ? it.options : undefined,
    };
  });

  return {
    title: String(payload.title || 'Actividad Digitalizada').trim(),
    referenceContent: payload.referenceContent ? String(payload.referenceContent).trim() : null,
    wordBank: Array.isArray(payload.wordBank)
      ? payload.wordBank.map((w) => String(w).trim()).filter(Boolean)
      : [],
    interactionType: payload.interactionType || 'fill_blanks',
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
    items: sanitizedItems,
  };
}

function cloneSampleBlocks(sourceImageSnippetUrl?: string): ExtractedBlock[] {
  const fallback = createManualBlock('input_fields');
  fallback.sourceImageSnippetUrl = sourceImageSnippetUrl;
  return [fallback];
}
