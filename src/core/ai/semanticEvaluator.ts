import { GoogleGenAI } from '@google/genai';
import { validateFillInBlank } from '../evaluators/fillBlankValidator';

export interface SemanticQuestionItem {
  id: string;
  prompt: string;
  expectedAnswer?: string;
  acceptedAnswers?: string[];
  hint?: string;
  explanation?: string;
}

export interface SemanticEvaluatorParams {
  referenceText?: string;
  questions: SemanticQuestionItem[];
  userAnswers: Record<string, any>;
}

export interface SemanticEvaluationItem {
  index: number;
  id: string;
  isCorrect: boolean;
  status: 'correct' | 'correct_with_typo' | 'incorrect';
  feedback: string;
  explanation?: string;
  canonicalAnswer: string;
  expectedAnswer: string;
}

export interface SemanticEvaluationResult {
  score: number;
  maxScore: number;
  details: Record<string, boolean>; // id -> isCorrect
  itemFeedback: Record<string, SemanticEvaluationItem>; // id -> feedback
  usedAi: boolean;
}

/**
 * Fallback evaluator using local pure rules (Levenshtein, particle stripping, contraction expansion).
 */
export function evaluateAnswersLocally(
  questions: SemanticQuestionItem[],
  userAnswers: Record<string, any>
): SemanticEvaluationResult {
  const details: Record<string, boolean> = {};
  const itemFeedback: Record<string, SemanticEvaluationItem> = {};
  let score = 0;

  questions.forEach((q, idx) => {
    const rawUserVal = String(userAnswers[q.id] || '');
    const validation = validateFillInBlank(
      rawUserVal,
      q.acceptedAnswers,
      q.expectedAnswer,
      q.hint || q.explanation
    );

    details[q.id] = validation.isCorrect;
    itemFeedback[q.id] = {
      index: idx,
      id: q.id,
      isCorrect: validation.isCorrect,
      status: validation.status,
      feedback: validation.feedback,
      explanation: validation.feedback,
      canonicalAnswer: validation.expectedAnswer,
      expectedAnswer: validation.expectedAnswer,
    };
    if (validation.isCorrect) score++;
  });

  return {
    score,
    maxScore: questions.length,
    details,
    itemFeedback,
    usedAi: false,
  };
}

/**
 * Semantic Evaluation with Gemini Flash:
 * Evaluates student responses semantically using full contextual reading comprehension.
 * Falls back transparently to local evaluation if offline or if the API is unavailable.
 */
export async function evaluateAnswersWithGemini({
  referenceText = '',
  questions,
  userAnswers,
}: SemanticEvaluatorParams): Promise<SemanticEvaluationResult> {
  if (!questions || questions.length === 0) {
    return { score: 0, maxScore: 0, details: {}, itemFeedback: {}, usedAi: false };
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    console.warn('[semanticEvaluator] No VITE_GEMINI_API_KEY found, using local fallback.');
    return evaluateAnswersLocally(questions, userAnswers);
  }

  const prompt = `Actúa como un profesor nativo de inglés. Evalúa si cada respuesta del alumno demuestra comprensión y veracidad según el texto de lectura.
Tolerancia semántica total: Acepta sinónimos válidos, omisiones o inclusiones de preposiciones/artículos (ej. 'scooter' es correcto para 'by scooter', 'London' es correcto para 'in London'), formas contraídas ('didn't go' / 'did not go'), y pequeñas erratas de ortografía (ej. 'recipies' -> 'correct_with_typo').

Texto de lectura de referencia:
"""
${referenceText.trim() || 'No specific passage provided. Evaluate based on standard English grammar and prompt.'}
"""

Preguntas y respuestas del alumno para evaluar:
${JSON.stringify(
  questions.map((q, idx) => ({
    index: idx,
    id: q.id,
    question: q.prompt,
    studentAnswer: String(userAnswers[q.id] || '').trim(),
    canonicalKey: q.expectedAnswer || q.acceptedAnswers?.[0] || '',
    acceptableVariants: q.acceptedAnswers || [],
  })),
  null,
  2
)}

Devuelve obligatoriamente un array JSON con el siguiente esquema exacto para cada ítem:
[
  {
    "index": number,
    "isCorrect": boolean,
    "status": "correct" | "correct_with_typo" | "incorrect",
    "feedback": "explicación breve y amigable en español o inglés",
    "canonicalAnswer": "respuesta canónica limpia"
  }
]`;

  // Candidate models to try in order of priority
  const candidateModels = [
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-3.8-flash',
  ];

  const ai = new GoogleGenAI({ apiKey });

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) continue;

      const cleanedJson = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const parsedArray = JSON.parse(cleanedJson);

      if (Array.isArray(parsedArray) && parsedArray.length > 0) {
        const details: Record<string, boolean> = {};
        const itemFeedback: Record<string, SemanticEvaluationItem> = {};
        let score = 0;

        questions.forEach((q, idx) => {
          const evalItem = parsedArray.find(
            (item: any) => item.index === idx || item.id === q.id
          ) || parsedArray[idx];

          const isCorrect = evalItem ? Boolean(evalItem.isCorrect) : false;
          const status = evalItem?.status || (isCorrect ? 'correct' : 'incorrect');
          const canonical = evalItem?.canonicalAnswer?.trim() || q.expectedAnswer || q.acceptedAnswers?.[0] || 'Respuesta canónica';
          const feedback = evalItem?.feedback?.trim() || (isCorrect ? '¡Respuesta correcta!' : `Respuesta correcta: ${canonical}`);

          details[q.id] = isCorrect;
          itemFeedback[q.id] = {
            index: idx,
            id: q.id,
            isCorrect,
            status,
            feedback,
            explanation: feedback,
            canonicalAnswer: canonical,
            expectedAnswer: canonical,
          };

          if (isCorrect) score++;
        });

        return {
          score,
          maxScore: questions.length,
          details,
          itemFeedback,
          usedAi: true,
        };
      }
    } catch (modelError: any) {
      console.warn(`[semanticEvaluator] Model ${model} failed:`, modelError?.message || modelError);
      // Try next candidate model
    }
  }

  // Direct REST fetch fallback in case SDK had environment issues
  try {
    const restRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
      }
    );

    if (restRes.ok) {
      const restData = await restRes.json();
      const text = restData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        const parsedArray = JSON.parse(cleaned);
        if (Array.isArray(parsedArray)) {
          const details: Record<string, boolean> = {};
          const itemFeedback: Record<string, SemanticEvaluationItem> = {};
          let score = 0;

          questions.forEach((q, idx) => {
            const evalItem = parsedArray[idx];
            const isCorrect = evalItem ? Boolean(evalItem.isCorrect) : false;
            const status = evalItem?.status || (isCorrect ? 'correct' : 'incorrect');
            const canonical = evalItem?.canonicalAnswer?.trim() || q.expectedAnswer || q.acceptedAnswers?.[0] || 'Respuesta canónica';
            const feedback = evalItem?.feedback?.trim() || (isCorrect ? '¡Respuesta correcta!' : `Respuesta correcta: ${canonical}`);

            details[q.id] = isCorrect;
            itemFeedback[q.id] = {
              index: idx,
              id: q.id,
              isCorrect,
              status,
              feedback,
              explanation: feedback,
              canonicalAnswer: canonical,
              expectedAnswer: canonical,
            };

            if (isCorrect) score++;
          });

          return {
            score,
            maxScore: questions.length,
            details,
            itemFeedback,
            usedAi: true,
          };
        }
      }
    }
  } catch (restErr) {
    console.warn('[semanticEvaluator] Direct REST call failed:', restErr);
  }

  // Graceful emergency fallback: local flexible evaluator
  console.info('[semanticEvaluator] Utilizing local rule-based evaluation fallback.');
  return evaluateAnswersLocally(questions, userAnswers);
}
