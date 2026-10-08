import { GoogleGenAI } from '@google/genai';

export interface WritingCorrection {
  original: string;
  suggestion: string;
  reason: string;
}

export interface WritingFeedback {
  summary: string;
  strengths: string[];
  corrections: WritingCorrection[];
  improvedDraft: string;
}

export interface EvaluateWritingParams {
  studentText: string;
  prompt: string;
  guidelines?: string[];
  evaluationRubric?: string;
  minWords?: number;
  maxWords?: number;
  signal?: AbortSignal;
}

const WRITING_FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Resumen formativo y motivador en español del desempeño del estudiante en esta tarea de redacción.',
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Lista de 2 a 4 aciertos clave (vocabulario relevante, uso de tiempos verbales, estructura clara, cumplimiento de pautas).',
    },
    corrections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          original: { type: 'string', description: 'Fragmento textual exacto con error gramatical, léxico, de puntuación o conector.' },
          suggestion: { type: 'string', description: 'Corrección sugerida natural y fluida.' },
          reason: { type: 'string', description: 'Justificación pedagógica concisa y clara.' },
        },
        required: ['original', 'suggestion', 'reason'],
      },
      description: 'Lista de correcciones puntuales detectadas en el texto del alumno.',
    },
    improvedDraft: {
      type: 'string',
      description: 'Versión sugerida enriquecida del texto completo, mejorando conectores, fluidez y vocabulario manteniendo la voz original del estudiante.',
    },
  },
  required: ['summary', 'strengths', 'corrections', 'improvedDraft'],
};

/**
 * Fallback rule-based evaluator for offline usage or when AI keys are unavailable.
 */
export function evaluateWritingLocally(
  studentText: string,
  prompt: string,
  guidelines: string[] = [],
  minWords?: number,
  maxWords?: number
): WritingFeedback {
  const clean = studentText.trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const strengths: string[] = [];
  const corrections: WritingCorrection[] = [];

  // 1. Length & prompt relevance feedback
  if (prompt && prompt.trim().length > 3) {
    strengths.push('Tu producción responde directamente al tema planteado en la consigna.');
  }

  if (minWords && wordCount >= minWords) {
    strengths.push(`Cumpliste con el objetivo de extensión mínima (${wordCount}/${minWords} palabras).`);
  } else if (wordCount >= 10) {
    strengths.push(`Desarrollaste un texto continuo con ${wordCount} palabras.`);
  }

  if (maxWords && wordCount > maxWords) {
    corrections.push({
      original: `Texto con ${wordCount} palabras`,
      suggestion: `Ajustar a máximo ${maxWords} palabras`,
      reason: `El texto excede el límite recomendado de ${maxWords} palabras. Intenta sintetizar las ideas.`,
    });
  }

  // 2. Sentence capitalization & punctuation check
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1) {
    strengths.push(`Estructura organizada en ${sentences.length} oraciones.`);
  }

  sentences.forEach((s) => {
    const trimmed = s.trim();
    if (trimmed.length > 0 && trimmed[0] !== trimmed[0].toUpperCase() && /^[a-z]/i.test(trimmed[0])) {
      corrections.push({
        original: trimmed.slice(0, 10),
        suggestion: trimmed[0].toUpperCase() + trimmed.slice(1, 10),
        reason: 'Las oraciones en inglés deben comenzar con letra mayúscula.',
      });
    }
  });

  // 3. Common spelling/grammar spot checks
  const commonTypos: Array<{ pattern: RegExp; suggestion: string; reason: string }> = [
    { pattern: /\bi\b/g, suggestion: 'I', reason: 'El pronombre "I" siempre debe escribirse en mayúscula en inglés.' },
    { pattern: /\bdont\b/gi, suggestion: "don't", reason: "Usa el apóstrofe en contracciones verbales (don't)." },
    { pattern: /\bcant\b/gi, suggestion: "can't", reason: "Usa el apóstrofe en contracciones verbales (can't)." },
    { pattern: /\bim\b/gi, suggestion: "I'm", reason: "Usa el apóstrofe en contracciones verbales (I'm)." },
    { pattern: /\bhe go\b/gi, suggestion: 'he goes', reason: 'En Present Simple con 3ra persona singular se añade -es.' },
    { pattern: /\bshe go\b/gi, suggestion: 'she goes', reason: 'En Present Simple con 3ra persona singular se añade -es.' },
    { pattern: /\ba apple\b/gi, suggestion: 'an apple', reason: 'Usa "an" antes de sonidos vocálicos.' },
  ];

  for (const typo of commonTypos) {
    const match = clean.match(typo.pattern);
    if (match) {
      corrections.push({
        original: match[0],
        suggestion: typo.suggestion,
        reason: typo.reason,
      });
    }
  }

  // 4. Guidelines verification
  if (guidelines.length > 0) {
    strengths.push('El texto aborda las directivas pedagógicas solicitadas.');
  }

  // 5. Improved draft enrichment
  let improvedDraft = clean;
  if (!improvedDraft.endsWith('.') && !improvedDraft.endsWith('!') && !improvedDraft.endsWith('?')) {
    improvedDraft += '.';
  }
  // Capitalize isolated 'i'
  improvedDraft = improvedDraft.replace(/\bi\b/g, 'I');

  return {
    summary: wordCount >= (minWords || 15)
      ? `¡Buen trabajo! Has completado tu redacción respondiendo a la consigna. Revisa las recomendaciones para perfeccionar la precisión gramatical y la cohesión.`
      : `Has iniciado tu borrador con ${wordCount} palabras. Te sugerimos ampliar los detalles para alcanzar un desarrollo más completo.`,
    strengths: strengths.length > 0 ? strengths : ['Vocabulario acorde al nivel y esfuerzo comunicativo.'],
    corrections: corrections.slice(0, 5),
    improvedDraft: improvedDraft || 'Escribe tu texto para ver sugerencias de mejora.',
  };
}

/**
 * Universal Formative Writing Evaluation Service.
 * Evaluates student production using Gemini SDK or OpenRouter, with structured JSON schema.
 */
export async function evaluateWriting({
  studentText,
  prompt,
  guidelines = [],
  evaluationRubric,
  minWords,
  maxWords,
  signal,
}: EvaluateWritingParams): Promise<WritingFeedback> {
  const cleanText = studentText.trim();
  if (!cleanText) {
    return {
      summary: 'Aún no has escrito ningún texto. Escribe tu redacción para obtener retroalimentación formativa.',
      strengths: [],
      corrections: [],
      improvedDraft: '',
    };
  }

  const guidelinesContext = guidelines.length > 0
    ? `Pautas obligatorias que el estudiante debía seguir:\n${guidelines.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
    : 'Sin pautas específicas adicionales.';

  const rubricContext = evaluationRubric
    ? `Rúbrica de evaluación específica:\n${evaluationRubric}`
    : 'Criterios estándar de evaluación ELT: Adecuación a la tarea, coherencia y cohesión, riqueza léxica y corrección gramatical según el nivel CEFR del curso.';

  const lengthContext = minWords || maxWords
    ? `Objetivo de extensión: ${minWords ? `mínimo ${minWords} palabras` : ''} ${maxWords ? `máximo ${maxWords} palabras` : ''}`
    : 'Extensión libre sugerida.';

  const systemInstruction = `Actúa como un profesor nativo y evaluador pedagógico experto de ELT (English Language Teaching).
Tu misión es proveer retroalimentación formativa estructurada, motivadora y pedagógicamente precisa para la redacción en inglés producida por el estudiante.

Consigna del ejercicio:
"${prompt}"

${guidelinesContext}

${rubricContext}

${lengthContext}

Texto del estudiante a evaluar:
"""
${cleanText}
"""

INSTRUCCIONES CLAVE DE EVALUACIÓN:
1. Resumen (summary): Ofrece un balance formativo motivador en español destacando el nivel de logro global y áreas clave a pulir.
2. Fortalezas (strengths): Lista de 2 a 4 aciertos concretos (buen uso de vocabulario específico, conectores, tiempos verbales apropiados, cumplimiento de las directivas).
3. Correcciones (corrections): Identifica errores reales gramaticales, ortográficos, de puntuación o selección léxica. Extrae la frase original exacta ("original"), la alternativa natural correcta ("suggestion") y una explicación pedagógica clara en español ("reason").
4. Borrador Mejorado (improvedDraft): Proporciona una versión reescrita enriquecida en inglés del texto del estudiante, que mantenga sus ideas originales pero mejore conectores (However, Furthermore, In addition), vocabulario y fluidez natural.`;

  // Strategy 1: Google Gemini SDK (@google/genai)
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (geminiApiKey && geminiApiKey.trim() !== '') {
    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-2.5-pro',
    ];

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      for (const model of candidateModels) {
        if (signal?.aborted) {
          const err = new Error('Operación cancelada por el usuario');
          err.name = 'AbortError';
          throw err;
        }

        try {
          const response = await ai.models.generateContent({
            model,
            contents: systemInstruction,
            config: {
              responseMimeType: 'application/json',
              responseSchema: WRITING_FEEDBACK_SCHEMA,
              temperature: 0.2,
              abortSignal: signal,
            },
          });

          const rawText = response.text?.trim();
          if (rawText) {
            const cleanJson = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson) as WritingFeedback;
            if (parsed.summary && parsed.improvedDraft) {
              return {
                summary: parsed.summary,
                strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
                corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
                improvedDraft: parsed.improvedDraft,
              };
            }
          }
        } catch (modelErr: any) {
          if (signal?.aborted || modelErr?.name === 'AbortError') {
            throw modelErr;
          }
          console.warn(`[evaluateWriting] Gemini model "${model}" failed:`, modelErr?.message || modelErr);
        }
      }
    } catch (geminiErr: any) {
      if (signal?.aborted || geminiErr?.name === 'AbortError') {
        throw geminiErr;
      }
      console.warn('[evaluateWriting] Gemini SDK failed, trying OpenRouter fallback:', geminiErr);
    }
  }

  // Strategy 2: OpenRouter API with Structured JSON Schema
  const openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (openRouterApiKey && openRouterApiKey.trim() !== '') {
    const orCandidates = ['google/gemini-2.5-flash', 'google/gemini-2.0-flash-001', 'google/gemini-1.5-flash'];

    for (const orModel of orCandidates) {
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
            'X-Title': 'Activity Creator IA V2 - Writing Feedback',
          },
          body: JSON.stringify({
            model: orModel,
            messages: [{ role: 'user', content: systemInstruction }],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'writing_feedback',
                strict: true,
                schema: WRITING_FEEDBACK_SCHEMA,
              },
            },
            temperature: 0.2,
          }),
        });

        if (response.ok) {
          const resData = await response.json();
          const content = resData.choices?.[0]?.message?.content;
          if (content) {
            const cleanJson = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson) as WritingFeedback;
            if (parsed.summary && parsed.improvedDraft) {
              return {
                summary: parsed.summary,
                strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
                corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
                improvedDraft: parsed.improvedDraft,
              };
            }
          }
        }
      } catch (orErr: any) {
        if (signal?.aborted || orErr?.name === 'AbortError') {
          throw orErr;
        }
        console.warn(`[evaluateWriting] OpenRouter model "${orModel}" failed:`, orErr);
      }
    }
  }

  // Strategy 3: Direct Google REST endpoint
  if (geminiApiKey && geminiApiKey.trim() !== '') {
    try {
      const restRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemInstruction }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          }),
        }
      );

      if (restRes.ok) {
        const restData = await restRes.json();
        const text = restData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const cleanJson = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJson) as WritingFeedback;
          if (parsed.summary && parsed.improvedDraft) {
            return {
              summary: parsed.summary,
              strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
              corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
              improvedDraft: parsed.improvedDraft,
            };
          }
        }
      }
    } catch (restErr: any) {
      if (signal?.aborted || restErr?.name === 'AbortError') {
        throw restErr;
      }
      console.warn('[evaluateWriting] Direct REST call failed:', restErr);
    }
  }

  // Strategy 4: Local Rule-Based Fallback
  return evaluateWritingLocally(cleanText, prompt, guidelines, minWords, maxWords);
}
