import type { ExtractedBlock, ExtractedStructuredPayload } from '../../types/schema';
import { GoogleGenAI } from '@google/genai';
import { isDuplicateReferenceContent } from '../text/textDeduplication';

export type ManualTemplateType = 'input_fields' | 'buckets' | 'selection' | 'reference_table' | 'table_grid';

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

  const mergedParsed: Record<string, any> = {
    ...primary,
    ...(mergedInstruction ? { instruction: mergedInstruction } : {}),
    ...(mergedTitle ? { title: mergedTitle } : {}),
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
 * Structured Output schema for Google Gemini SDK and OpenRouter.
 */
const STRUCTURED_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Concise formal activity title (e.g. "Speaking: Tell other students about yourself")' },
    instruction: {
      type: 'string',
      description: 'The explicit pedagogical directive, task instruction, or rubric prompt present in the clipping (e.g. "Work in groups. Tell other students about yourself. Use the phrases from 1 or your own ideas"). MUST NEVER BE EMPTY if the image contains an instructional order or directive.'
    },
    isGraded: {
      type: 'boolean',
      description: 'Default true. If the exercise instruction corresponds to a personal survey, opinion, self-reflection, or discussion task where there are no absolute correct/wrong answers (e.g. contains phrases like "true for you", "about yourself", "your opinion", "discuss in pairs"), extract as false.'
    },
    visualImageIndices: {
      type: 'array',
      items: { type: 'integer' },
      description: '1-based index numbers (1, 2, 3...) of the input image clippings that contain actual photographs, illustrations, drawings, or visual realia. CRITICAL: NEVER include clippings that contain only printed text, instructions, exercise sentences, or questions. Return empty array [] if no clippings contain photos.'
    },
    referenceContent: {
      type: 'string',
      description: 'Passive reading passage, article, dialogue, or guidance notes (TIPS) that do NOT require interactive answers. Empty string or null if none. CRITICAL: NEVER duplicate or copy the exercise sentences or interactive items here. If the clipping is only the exercise items/sentences itself (e.g. self-contained checklist, opinion poll, or fill-in-the-blank), this MUST be empty string or null.'
    },
    wordBank: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of vocabulary words if an explicit word box / bank is present in the image, otherwise empty array []'
    },
    interactionType: {
      type: 'string',
      enum: ['fill_blanks', 'multiple_choice', 'matching', 'buckets', 'reference'],
      description: 'The strict pedagogical archetype of the interactive exercise. Use "reference" for communicative activities, speaking cards, or discussion material where no digital answer is evaluated.'
    },
    buckets: {
      type: 'array',
      items: { type: 'string' },
      description: 'Target categories or preposition names if interactionType is buckets, otherwise omit or empty array'
    },
    tableHeaders: {
      type: 'array',
      items: { type: 'string' },
      description: 'Column header titles if the exercise is structured as a 2D table or double-entry grid, otherwise omit or empty array'
    },
    tableRows: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Fixed guidance or read-only text in cell' },
            isInput: { type: 'boolean', description: 'True if student must complete or fill this cell' },
            expectedAnswer: { type: 'string', description: 'Canonical answer deduced by teacher if isInput is true' },
            acceptedAnswers: { type: 'array', items: { type: 'string' }, description: 'Valid variants including expectedAnswer' },
            isExample: { type: 'boolean', description: 'True if cell is already filled as a model/sample in the book' },
            hint: { type: 'string', description: 'Optional clue or tip' }
          },
          required: ['text', 'isInput', 'isExample']
        }
      },
      description: '2D matrix of cells if the exercise is structured as a table or grid, otherwise omit or empty array'
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
  required: ['title', 'instruction', 'wordBank', 'interactionType', 'items']
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
- Regla Universal de Tablas/Cuadrículas: Si el ejercicio se presenta estructuralmente como una matriz o tabla de doble entrada con filas y columnas:
  * Genera \`tableHeaders\` con los títulos de las columnas.
  * Genera \`tableRows\` como una matriz de celdas bidimensionales.
  * Si una celda contiene texto fijo o de guía que el alumno debe leer, márcala con \`isInput: false\` y su contenido en \`text\`.
  * Si una celda es un espacio en blanco para responder, márcala con \`isInput: true\` y su respuesta canónica en \`expectedAnswer\`.
  * Si una celda de respuesta ya viene resuelta en el libro como modelo, márcala con \`isInput: true\`, \`isExample: true\` y su contenido en \`expectedAnswer\`.
- Regla Universal de Referencia Cruzada: Si un recorte de ejercicio contiene una instrucción que remite a otro material (ej. 'Look again at...', 'Based on...', 'Read the text and answer...'):
  * El material o bloque al que se remite DEBE serializarse íntegramente dentro de \`referenceContent\` (como texto pasivo de consulta).
  * Únicamente las preguntas, oraciones o reactivos derivados de la instrucción activa deben serializarse en \`items\` interactivos.
  * NUNCA fusiones las preguntas del material de referencia con las preguntas de la tarea activa en una sola lista de items interactivos.
- Regla Universal de Formato y Estructura en Referencias: Al capturar contenido para \`referenceContent\` (pasajes de lectura, diálogos, explicaciones o listas de consulta):
  * DEBES preservar fielmente la estructura visual y los saltos de línea del documento original.
  * Separa párrafos o secciones temáticas utilizando saltos de línea explícitos dobles (\`\\n\\n\`).
  * En líneas de diálogo (ej. 'Speaker A: ...\\nSpeaker B: ...'), listas numeradas, viñetas o reglas paso a paso, preserva cada elemento en su línea respectiva mediante saltos de línea (\`\\n\`), evitando que el texto se colapse en un único bloque apelmazado.
- Regla Universal de Extracción Estricta de instruction y title:
  * Si en la imagen existe una directiva pedagógica, orden o consigna de trabajo (p. ej. "Work in groups. Tell other students about yourself. Use the phrases from 1 or your own ideas"), DEBE poblar obligatoriamente el campo 'instruction'. NUNCA dejes 'instruction' vacío si existe una consigna.
  * 'title' debe ser un título conciso y representativo (ej. "Speaking: Tell other students about yourself"), reservando la directiva completa para 'instruction'.
- Regla Universal de Prohibición de Meta-Comentarios Pedagógicos:
  * NUNCA generes explicaciones pedagógicas, metatexto editorial ni justificaciones dirigidas al profesor (ej. "This is an open-ended activity designed to...", "In this activity students will...", "Students can discuss...").
  * El contenido de 'referenceContent' y de toda la diapositiva DEBE ser exclusivamente material didáctico directo para el estudiante (lecturas, modelos conversacionales, tablas, listas de frases).
- Regla de Sin Repetición de Encabezado en 'referenceContent':
  * Si 'title' ya contiene el título o la sección del ejercicio (ej. "Speaking: Tell other students about yourself"), NUNCA repitas ese mismo título como primera línea o encabezado (# o ##) dentro de 'referenceContent'. Ve directamente al contenido didáctico, vocabulario o modelo conversacional.
- Regla de Estructura Limpia para Preguntas y Tareas Abiertas:
  * Si la consigna instruye nombrar, listar, reflexionar o describir elementos abiertos (ej. "Write the names of five famous people and why you like them", "List three things you did..."):
  * NUNCA redactes párrafos descriptivos abstractos ni explicaciones discursivas.
  * Provee una plantilla limpia y estructurada con viñetas o líneas modelo directamente para el estudiante (ej. "1. [Name] — Why: ...\n2. [Name] — Why: ..."), facilitando la producción guiada.
- Regla Universal de Consolidación Multirrecorte en Formato 'reference':
  * Si se proporcionan múltiples recortes donde uno contiene una tarea comunicativa/speaking y el otro contiene vocabulario, listas de frases de apoyo o contexto previo referenciado en la instrucción (ej. "Use the phrases from 1"):
    1. 'instruction': La directiva completa de la tarea comunicativa.
    2. 'referenceContent': DEBE consolidar AMBOS recortes de manera organizada y legible:
       - Primero: El banco de frases o vocabulario de apoyo (las frases del recorte complementario estructuradas con viñetas o saltos de línea bajo un título claro como 'Useful phrases:' o 'Support vocabulary:').
       - Segundo: El modelo conversacional o diálogo de ejemplo (los bocadillos/globos de diálogo o modelo provisto).
    3. NUNCA descartes el recorte complementario de vocabulario o frases. La regla de no duplicación aplica exclusivamente para evitar duplicar oraciones entre referenceContent y reactivos evaluables en ejercicios mecánicos ('fill_blanks'/'multiple_choice'); NUNCA debe descartar material en actividades 'reference'.
- Regla Universal de Actividades No Calificables / Encuestas Personales:
  * isGraded: Por defecto debe ser true. Si la consigna del ejercicio corresponde a una encuesta personal, opinión o reflexión subjetiva donde no existen respuestas correctas o incorrectas absolutas (p. ej., contiene frases como "true for you", "about yourself", "your opinion", "discuss in pairs"), debe extraerse obligatoriamente con "isGraded": false.
- Regla Estricta de NO Duplicación en referenceContent para ejercicios mecánicos:
  * referenceContent debe ser null o string vacío a menos que el recorte contenga un texto de lectura externo real (artículo, diálogo base, caja de reglas gramaticales) que el estudiante deba consultar de forma pasiva.
  * En ejercicios evaluables mecánicos (como checklists de oraciones, oraciones para completar, preguntas de selección), NUNCA dupliques en referenceContent las mismas frases que van en los ítems interactivos.
- PRINCIPIO DE INTERACCIÓN HUMANA / COMUNICATIVA (Formato 'reference'):
  * Si la actividad didáctica tiene como objetivo la producción oral libre, la conversación en parejas/grupos o el intercambio comunicativo entre estudiantes (donde la tarea pedagógica ocurre fuera de la pantalla y el software no debe capturar una respuesta evaluable), clasifícala siempre como interactionType: 'reference' (Speaking Card).
  * Los diálogos o ejemplos modelo deben conservarse íntegros como material de consulta y guía para los alumnos dentro de 'referenceContent'; NUNCA deben convertirse artificialmente en ejercicios de rellenar espacios ('fill_blanks') ni generar huecos sintéticos.
- PRINCIPIO DE ESTÍMULO VISUAL (Visual Prompts):
  * En actividades inductivas, de predicción, descripción o conversación basadas en observación de imágenes o fotografías ("Look at the pictures / photos", "Discuss what you see", "Look at the people in the photo..."):
  * NUNCA redactes descripciones en prosa, resúmenes ni desveles en texto lo que muestran las imágenes. Redactar lo que hay en la foto anula el propósito pedagógico inductivo para el estudiante.
  * La diapositiva debe presentar únicamente la consigna pedagógica ('instruction') y, si el recorte lo incluye, preguntas disparadoras de discusión para los alumnos (ej. "Where are they? What are they doing?").
  * Toda la información visual debe provenir exclusivamente de la imagen real observada directamente por el estudiante en la pantalla.
- REGLA DE PREGUNTAS INDUCTIVAS / PREDICTIVAS:
  * Si la consigna pedagógica contiene preguntas de opinión, predicción, deducción o inferencia basada en imágenes (ej. "do you think?", "predict", "guess", "why do you think...?", "what do you think they do?"):
  * NUNCA redactes respuestas factuales, datos enciclopédicos, biografías resumidas ni explicaciones informativas que resuelvan la pregunta (ej. NO escribas "Jamie Oliver is a famous British chef..."). Revelar quién es la persona o qué muestra la imagen destruye la tarea inductiva del estudiante.
  * El estudiante debe formular sus propias ideas a partir de la observación directa y debatir con sus pares.
  * Deja 'referenceContent' vacío o null, o si aplica incluye ÚNICAMENTE breves preguntas guía disparadoras para el debate entre alumnos (ej. "• What do you notice in the pictures?\n• What could their job be?"), SIN DAR LA RESPUESTA ni datos biográficos.
- DISCRIMINACIÓN ESTRICTA DE RECORTES VISUALES vs RECORTES TEXTUALES:
  * En 'visualImageIndices': reporta ÚNICAMENTE los números de índice 1-based (1, 2, 3...) de los recortes de entrada que contienen fotografías, retratos, ilustraciones o escenas visuales reales.
  * NUNCA incluyas en 'visualImageIndices' recortes que consistan únicamente en texto impreso (título, consigna, preguntas, cajas de ejercicios). Si ningún recorte contiene fotografías o ilustraciones, devuelve 'visualImageIndices': [].

UNIVERSAL TAXONOMY & STRICT CONTRACT:
1. "title": Concise formal activity or section title.
2. "instruction": The explicit pedagogical directive, task instruction, or rubric prompt present in the clipping (e.g. "Work in groups. Tell other students about yourself. Use the phrases from 1 or your own ideas"). MUST NEVER BE EMPTY if the clipping contains an instructional directive.
3. "visualImageIndices": Array of 1-based indices (1, 2, 3...) of clippings containing actual photos/illustrations. Empty array [] if none. Exclude text-only clippings.
4. "referenceContent": Passive consultation material. Put reading passages, articles, dialogues, speech bubbles, instructional guidance ('TIPS!'), or consolidated support phrases/vocabulary here that provide reference context and DO NOT require an interactive answer. (null if none). Preserva fielmente la estructura visual y saltos de línea del documento original ('\n\n' entre párrafos y '\n' entre turnos de diálogo o listas). NUNCA repitas el título aquí ni agregues meta-explicaciones ni descripciones de fotos ni spoilers a preguntas predictivas.
5. "wordBank": If the clipping contains a vocabulary box, word box, container, or pool of options to choose from, extract ONLY the available options into "wordBank" as string[] (sean cadenas simples o compuestas por varios términos). (Empty array [] if none).
   * REGLA DE PARTICIÓN 1: NUNCA incluyas cajas de palabras (Word Banks), notas de apoyo ('TIPS!'), números de página o códigos de lección dentro de 'items'.
6. "interactionType": Must be one of: 'fill_blanks', 'multiple_choice', 'matching', 'buckets', 'reference'.
   - Matching/vocabulary tables (e.g. 'term | definition') are categorized as 'matching' or 'fill_blanks'.
   - Ejercicios de agrupar o clasificar términos en categorías o columnas usan 'buckets' siguiendo la Regla Universal de Clasificación por Categorías.
   - Actividades comunicativas de producción oral libre, diálogo o speaking card usan 'reference', consolidando los modelos y bancos de frases de apoyo íntegros en 'referenceContent'.
7. "items": Array of interactive items ONLY (empty [] if interactionType is 'reference'):
   - "prompt": The visible text, sentence with blank, or clue/definition that the student reads. Sigue la Regla Universal de Contenido de Ítem: DEBE contener el texto informativo, premisa o definición; NUNCA únicamente el número secuencial del ítem.
   - "expectedAnswer": The canonical resolved solution deduced by you as an expert teacher. MUST NEVER BE EMPTY. Must follow the Regla Universal de Banco de Opciones whenever a wordBank is present.
   - "acceptedAnswers": List of valid variations (contractions, spelling, or synonyms). Must include expectedAnswer.
   - "isExample": Booleano. Must follow the Regla Universal de Muestras Impresas: las filas o ítems que ya presentan una respuesta visible de muestra impresa en el material original deben clasificarse obligatoriamente como "isExample": true con dicho elemento en expectedAnswer, NUNCA omitirse ni dejarse en blanco.
   - "explanation": Brief 1-line pedagogical justification of the grammar rule or clue.
   - "options": (If multiple choice) array of choices to select from.
8. "tableHeaders" y "tableRows": Si el ejercicio se presenta como una cuadrícula o tabla interactiva de doble entrada, genera las columnas en "tableHeaders" y la matriz de celdas en "tableRows" siguiendo la Regla Universal de Tablas/Cuadrículas.
9. "isGraded": Booleano. Por defecto debe ser true. Si la consigna del ejercicio corresponde a una encuesta personal, opinión o reflexión subjetiva donde no existen respuestas correctas o incorrectas absolutas (p. ej., contiene frases como "true for you", "about yourself", "your opinion", "discuss in pairs"), debe extraerse con "isGraded": false.

CRITICAL NEGATIVE CONSTRAINTS:
- NUNCA incluyas meta-comentarios pedagógicos, justificaciones didácticas ni notas dirigidas al profesor (ej. "This is an open-ended activity...", "This exercise is designed to encourage students..."). Todo el texto debe ser 100% material directo para el alumno.
- NUNCA redactes descripciones en texto ni resúmenes de lo que muestran las fotos en actividades basadas en observación visual ("Look at the photos..."); la imagen real observada por el estudiante es el estímulo y no debe sustituirse por prosa descriptiva.
- NUNCA redactes respuestas factuales, biografías ni datos enciclopédicos que resuelvan preguntas inductivas o de predicción ("Why is X famous, do you think?", "What do you think their job is?"); deja 'referenceContent' sin spoilers para que los alumnos piensen y debatan.
- NUNCA incluyas recortes puramente textuales en 'visualImageIndices'; solo fotografías o ilustraciones reales.
- NUNCA repitas el título principal de la actividad como primera línea o encabezado dentro de 'referenceContent'.
- NUNCA uses párrafos descriptivos abstractos para actividades que solicitan listas o mención de elementos; usa plantillas con viñetas o líneas modelo (ej. '1. ... — Why: ...').
- NUNCA descartes recortes complementarios de vocabulario o frases en actividades 'reference'; deben consolidarse en 'referenceContent' junto al modelo conversacional.
- NUNCA conviertas diálogos, role-plays o ejemplos modelo de actividades comunicativas / speaking en ejercicios de rellenar espacios ('fill_blanks') generando huecos sintéticos. Deben preservarse íntegros como material de consulta y guía ('referenceContent' con interactionType: 'reference').
- NUNCA dupliques en 'referenceContent' las mismas frases, oraciones o reactivos que forman parte de los ítems interactivos de ejercicios evaluables mecánicos.
- NUNCA conviertas encabezados de tabla ni códigos editoriales en ítems interactivos.
- NUNCA fusiones las preguntas o el texto del material de referencia con las preguntas de la tarea activa en una sola lista de ítems interactivos.
- Cada ítem interactivo debe ser un ítem real que el alumno debe completar o resolver.
- Devuelve estrictamente el objeto JSON conforme al esquema estructurado.`;
}

/**
 * Universal Digitize Book: Calls Gemini via GoogleGenAI SDK or OpenRouter enforcing strict JSON Schema.
 */
export async function digitizeBook(
  images: string | string[],
  signal?: AbortSignal
): Promise<ExtractedBlock[]> {
  if (signal?.aborted) {
    const err = new Error('Operación cancelada por el usuario');
    err.name = 'AbortError';
    throw err;
  }

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
      const envGeminiModel = import.meta.env.VITE_GEMINI_MODEL?.trim();
      const candidateModels = Array.from(new Set([
        ...(envGeminiModel ? [envGeminiModel] : []),
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash-001',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash',
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
            const cleanJson = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson) as ExtractedStructuredPayload;
            return [buildExtractedBlockFromPayload(parsed, primaryImage, imageList)];
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
                name: 'activity_extraction',
                strict: true,
                schema: STRUCTURED_EXTRACTION_SCHEMA,
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
            const cleanJson = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson) as ExtractedStructuredPayload;
            return [buildExtractedBlockFromPayload(parsed, primaryImage, imageList)];
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
  return cloneSampleBlocks(primaryImage, imageList);
}

/**
 * Transforms the strict structured payload into a standardized ExtractedBlock.
 */
function buildExtractedBlockFromPayload(
  payload: ExtractedStructuredPayload,
  sourceUrl: string,
  sourceImages?: string[]
): ExtractedBlock {
  const sanitized = sanitizeExtractedPayload(payload);
  const rawImages = (Array.isArray(sourceImages) && sourceImages.length > 0)
    ? sourceImages.filter(Boolean)
    : (sourceUrl ? [sourceUrl] : []);

  // Filter genuine visual assets (photos, illustrations) using visualImageIndices
  let visualImages: string[] = [];
  if (Array.isArray(sanitized.visualImageIndices) && sanitized.visualImageIndices.length > 0) {
    visualImages = sanitized.visualImageIndices
      .map((idx) => rawImages[idx - 1])
      .filter((img): img is string => Boolean(img));
  } else if (Array.isArray(sanitized.visualImageIndices) && sanitized.visualImageIndices.length === 0) {
    // Explicitly 0 photos in the clippings: leave visualImages empty so text clippings are not shown in gallery!
    visualImages = [];
  } else {
    visualImages = rawImages;
  }

  const rawTextParts = [
    sanitized.title,
    sanitized.instruction,
    sanitized.referenceContent,
    ...sanitized.items.map((i) => i.prompt),
  ].filter(Boolean);

  const detectedType: ExtractedBlock['detectedType'] =
    sanitized.tableRows && sanitized.tableRows.length > 0
      ? 'table'
      : sanitized.interactionType === 'buckets'
      ? 'vocabulary'
      : sanitized.interactionType === 'reference' || (Boolean(sanitized.referenceContent) && sanitized.items.length === 0)
      ? 'paragraph'
      : 'numbered_list';

  return {
    id: `ocr-gen-${Date.now()}`,
    rawText: rawTextParts.join('\n\n'),
    detectedType,
    confidence: 0.98,
    sourceImageSnippetUrl: visualImages[0] || undefined,
    sourceImages: visualImages.length > 0 ? visualImages : undefined,
    parsedData: {
      title: sanitized.title,
      instruction: sanitized.instruction,
      referenceContent: sanitized.referenceContent || undefined,
      content: sanitized.referenceContent || undefined,
      wordBank: sanitized.wordBank.length > 0 ? sanitized.wordBank : undefined,
      interactionType: sanitized.interactionType,
      buckets: sanitized.buckets,
      items: sanitized.items,
      tableHeaders: sanitized.tableHeaders,
      tableRows: sanitized.tableRows,
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

  const rawTableHeaders = Array.isArray(payload.tableHeaders) ? payload.tableHeaders : undefined;
  const tableHeaders = rawTableHeaders ? rawTableHeaders.map((h) => String(h).trim()).filter(Boolean) : undefined;

  const rawTableRows = Array.isArray(payload.tableRows) ? payload.tableRows : undefined;
  const tableRows = rawTableRows
    ? rawTableRows.map((row) => {
        if (!Array.isArray(row)) return [];
        return row.map((cell) => {
          const isInput = Boolean(cell?.isInput);
          const isExample = Boolean(cell?.isExample);
          const text = String(cell?.text || '').trim();
          const expectedAnswer = String(cell?.expectedAnswer || '').trim();
          let acceptedAnswers = Array.isArray(cell?.acceptedAnswers) && cell.acceptedAnswers.length > 0
            ? cell.acceptedAnswers.map((a) => String(a).trim()).filter(Boolean)
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
            hint: cell?.hint ? String(cell.hint).trim() : undefined,
          };
        });
      })
    : undefined;

  const rawInstruction = payload.instruction ? String(payload.instruction).trim() : '';
  const rawTitle = payload.title ? String(payload.title).trim() : '';

  let title = rawTitle;
  let instruction = rawInstruction;

  if (!instruction && title.length > 50) {
    instruction = title;
    title = 'Speaking / Activity Task';
  } else if (!title && instruction) {
    title = instruction.length <= 50 ? instruction : 'Speaking / Activity Task';
  } else if (!title && !instruction) {
    title = 'Actividad Digitalizada';
  }

  const rawRef = Array.isArray(payload.referenceContent)
    ? payload.referenceContent.map((s) => String(s).trim()).filter(Boolean).join('\n\n')
    : (payload.referenceContent ? String(payload.referenceContent).trim() : null);

  const contextDirective = `${title} ${instruction || ''}`;
  const cleanedRawRef = rawRef
    ? stripPredictiveSpoilers(stripLeadingDuplicateTitle(stripMetaComments(rawRef), title), contextDirective)
    : null;

  // In 'reference' activities, ALWAYS preserve referenceContent (never drop as duplicate)
  // and consolidate complementary support phrases/vocabulary into referenceContent
  let referenceContent = payload.interactionType === 'reference'
    ? cleanedRawRef
    : (isDuplicateReferenceContent(cleanedRawRef, sanitizedItems) ? null : cleanedRawRef);

  if (payload.interactionType === 'reference') {
    const existingRef = referenceContent || '';
    const supportPhrases = sanitizedItems
      .map((it) => it.prompt.replace(/_{2,}/g, '').trim())
      .filter((p) => p && p.length > 3 && !existingRef.includes(p));

    const extraWords = (payload.wordBank || [])
      .map((w) => String(w).trim())
      .filter((w) => w && w.length > 1 && !existingRef.includes(w));

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

  return {
    title,
    instruction: instruction || undefined,
    referenceContent,
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
    tableHeaders,
    tableRows,
    isGraded: payload.isGraded !== undefined
      ? Boolean(payload.isGraded)
      : !(/true for you|about yourself|your opinion|discuss in pairs|personal reflection/i.test(
          `${title} ${instruction} ${referenceContent || ''} ${sanitizedItems.map((i) => i.prompt).join(' ')}`
        )),
    visualImageIndices: Array.isArray(payload.visualImageIndices)
      ? payload.visualImageIndices
          .map((n) => Number(n))
          .filter((n) => !isNaN(n) && n > 0)
      : undefined,
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
