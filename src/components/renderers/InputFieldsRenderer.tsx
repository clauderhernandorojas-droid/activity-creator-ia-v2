import React from 'react';
import type { InputFieldsBlock, InputFieldListItem } from '../../types/schema';
import type { SessionEvaluation } from '../../store/useSessionStore';
import { Plus, Trash2, CheckCircle2, XCircle, HelpCircle, AlertCircle, Sparkles } from 'lucide-react';

interface Props {
  block: InputFieldsBlock;
  studentAnswers: Record<string, any>;
  evaluation: SessionEvaluation;
  isEditMode?: boolean;
  onAnswerChange?: (key: string, value: string) => void;
  onChange?: (updated: InputFieldsBlock) => void;
}

interface ParsedMatchingPrompt {
  isMatching: boolean;
  itemNumber: string;
  clue: string;
}

const parseMatchingPrompt = (rawPrompt: string, fallbackIdx: number, hasWordBank = false): ParsedMatchingPrompt => {
  const trimmed = rawPrompt.trim();

  // Pattern 1: e.g. "2. _______ : a time", "2) _______ : a time", "2. : a time", "_______ : a time", ": a time"
  const colonMatch = trimmed.match(/^(?:(\d+)[.)]\s*)?(?:_+|\.{3,}|—+)?\s*:\s*(.+)$/);
  if (colonMatch) {
    return {
      isMatching: true,
      itemNumber: colonMatch[1] || String(fallbackIdx + 1),
      clue: colonMatch[2].trim(),
    };
  }

  // Pattern 2: e.g. "2. _______ a time" (missing colon but blank at start)
  const blankMatch = trimmed.match(/^(?:(\d+)[.)]\s*)?(?:_+|\.{3,}|—+)\s*(.+)$/);
  if (blankMatch && (hasWordBank || blankMatch[2].length < 60)) {
    return {
      isMatching: true,
      itemNumber: blankMatch[1] || String(fallbackIdx + 1),
      clue: blankMatch[2].replace(/^:\s*/, '').trim(),
    };
  }

  // Pattern 3: If hasWordBank and format is "2. a time" or "2) a time" (short definition phrase)
  if (hasWordBank) {
    const numShortMatch = trimmed.match(/^(\d+)[.)]\s+([a-zA-Z\s()'-]{2,60})$/);
    if (numShortMatch && !numShortMatch[2].includes('?')) {
      return {
        isMatching: true,
        itemNumber: numShortMatch[1],
        clue: numShortMatch[2].trim(),
      };
    }
  }

  return {
    isMatching: false,
    itemNumber: String(fallbackIdx + 1),
    clue: trimmed,
  };
};

export const InputFieldsRenderer: React.FC<Props> = ({
  block,
  studentAnswers,
  evaluation,
  isEditMode = false,
  onAnswerChange,
  onChange,
}) => {
  const hasWordBank = Boolean(block.wordBank && block.wordBank.length > 0);

  // Compute set of words currently used in answers or examples
  const usedWords = React.useMemo(() => {
    const set = new Set<string>();
    Object.values(studentAnswers || {}).forEach((val) => {
      if (typeof val === 'string' && val.trim()) {
        set.add(val.trim().toLowerCase());
      }
    });
    block.listItems.forEach((item) => {
      if (item.isExample && item.expectedAnswer) {
        set.add(item.expectedAnswer.trim().toLowerCase());
      }
    });
    return set;
  }, [studentAnswers, block.listItems]);

  const handleListItemChange = (index: number, field: keyof InputFieldListItem, value: any) => {
    if (!onChange) return;
    const updated = [...block.listItems];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...block, listItems: updated });
  };

  const handleExpectedAnswerChange = (index: number, val: string) => {
    if (!onChange) return;
    const updated = [...block.listItems];
    const item = updated[index];
    const newExpected = val.trim();
    let newAccepted = [...item.acceptedAnswers];
    if (newExpected && !newAccepted.includes(newExpected)) {
      newAccepted = [newExpected, ...newAccepted];
    }
    updated[index] = {
      ...item,
      expectedAnswer: val,
      acceptedAnswers: newAccepted.length > 0 ? newAccepted : (val ? [val] : []),
    };
    onChange({ ...block, listItems: updated });
  };

  const handleAcceptedAnswersChange = (index: number, rawString: string) => {
    if (!onChange) return;
    const answers = rawString.split(',').map((s) => s.trim()).filter(Boolean);
    const updated = [...block.listItems];
    const item = updated[index];
    const canonical = item.expectedAnswer?.trim() || answers[0] || '';
    if (canonical && !answers.includes(canonical)) {
      answers.unshift(canonical);
    }
    updated[index] = {
      ...item,
      acceptedAnswers: answers,
      expectedAnswer: canonical,
    };
    onChange({ ...block, listItems: updated });
  };

  const addListItem = () => {
    if (!onChange) return;
    const newItem: InputFieldListItem = {
      id: `item-${Date.now()}`,
      prompt: `${block.listItems.length + 1}. _______ : new definition or prompt...`,
      prefix: '',
      expectedAnswer: 'correct answer',
      acceptedAnswers: ['correct answer'],
      hint: 'Grammar tip or clue',
      isExample: false,
    };
    onChange({ ...block, listItems: [...block.listItems, newItem] });
  };

  const removeListItem = (index: number) => {
    if (!onChange || block.listItems.length <= 1) return;
    onChange({
      ...block,
      listItems: block.listItems.filter((_, idx) => idx !== index),
    });
  };

  return (
    <div className="w-full flex flex-col">
      {/* Pedagogical Instruction */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        {isEditMode ? (
          <input
            type="text"
            value={block.instruction}
            placeholder="Instrucción de la actividad (ej. Complete the table with the question words)..."
            onChange={(e) => onChange?.({ ...block, instruction: e.target.value })}
            className="flex-1 text-base font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 outline-none focus:border-indigo-500 focus:bg-white"
          />
        ) : (
          <p className="text-base sm:text-lg font-bold text-slate-800 leading-snug">
            {block.instruction}
          </p>
        )}

        {isEditMode && (
          <button
            onClick={addListItem}
            className="text-xs flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Pregunta</span>
          </button>
        )}
      </div>

      {/* Word Bank: Editor in Edit Mode or Stylized Badge Bar in View Mode */}
      {isEditMode ? (
        <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Word Bank / Caja de palabras (opcional):
            </span>
            <span className="text-[11px] text-slate-400">Separadas por comas</span>
          </div>
          <input
            type="text"
            value={block.wordBank?.join(', ') || ''}
            placeholder="ej. Who, Where, When, Why, What, Which, How"
            onChange={(e) => {
              const words = e.target.value.split(',').map((w) => w.trim()).filter(Boolean);
              onChange?.({ ...block, wordBank: words.length > 0 ? words : undefined });
            }}
            className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 font-semibold text-slate-800"
          />
        </div>
      ) : (
        hasWordBank && (
          <div className="mb-5 p-3.5 bg-slate-50/90 border border-slate-200/80 rounded-2xl shadow-2xs">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Word Bank / Palabras disponibles
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {block.wordBank!.map((word, wIdx) => {
                const isUsed = usedWords.has(word.trim().toLowerCase());
                return (
                  <span
                    key={`${word}-${wIdx}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      isUsed
                        ? 'bg-slate-200/70 text-slate-400 border-slate-300 line-through select-none opacity-60'
                        : 'bg-white text-indigo-900 border-indigo-200 shadow-2xs hover:border-indigo-300'
                    }`}
                  >
                    {word}
                  </span>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Questions list */}
      <div className="w-full space-y-4">
        {block.listItems.map((item, idx) => {
          const isEvaluated = evaluation.isSubmitted;
          const isCorrect = Boolean(evaluation.details[item.id]) || Boolean(item.isExample);
          const itemFeedback = evaluation.itemFeedback?.[item.id];
          const isTypoWarning = isCorrect && itemFeedback?.status === 'correct_with_typo';
          const userVal = studentAnswers[item.id] || '';

          // Canonical answer guaranteed never empty
          const canonicalAnswer =
            itemFeedback?.canonicalAnswer?.trim() ||
            itemFeedback?.expectedAnswer?.trim() ||
            item.expectedAnswer?.trim() ||
            item.acceptedAnswers[0]?.trim() ||
            'Respuesta según texto';

          const otherAccepted = item.acceptedAnswers
            .map((a) => a.trim())
            .filter((a) => a && a.toLowerCase() !== canonicalAnswer.toLowerCase());

          const explanationOrHint =
            itemFeedback?.feedback?.trim() ||
            itemFeedback?.explanation?.trim() ||
            item.explanation?.trim() ||
            item.hint?.trim();

          const parsedPrompt = parseMatchingPrompt(item.prompt, idx, hasWordBank);

          return (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition-all ${
                item.isExample
                  ? 'bg-slate-50/80 border-slate-200'
                  : isEvaluated
                    ? isCorrect
                      ? isTypoWarning
                        ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300/40'
                        : 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-300/40'
                      : 'bg-rose-50/70 border-rose-300 ring-1 ring-rose-300/40'
                    : 'bg-slate-50/70 border-slate-200/80 hover:border-slate-300'
              }`}
            >
              {isEditMode ? (
                /* EDIT MODE */
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-6">#{idx + 1}</span>
                    <input
                      type="text"
                      value={item.prompt}
                      placeholder="Oración o definición (ej. 2. _______ : a time)..."
                      onChange={(e) => handleListItemChange(idx, 'prompt', e.target.value)}
                      className="flex-1 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500"
                    />
                    <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-900 select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={Boolean(item.isExample)}
                        onChange={(e) => handleListItemChange(idx, 'isExample', e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Ejemplo</span>
                    </label>
                    <button
                      onClick={() => removeListItem(idx)}
                      disabled={block.listItems.length <= 1}
                      className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-20 rounded cursor-pointer"
                      title="Eliminar pregunta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-8">
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                      <span className="text-[11px] font-semibold text-emerald-700 whitespace-nowrap">
                        ✓ Canónica:
                      </span>
                      <input
                        type="text"
                        value={item.expectedAnswer || item.acceptedAnswers[0] || ''}
                        placeholder="Respuesta canónica..."
                        onChange={(e) => handleExpectedAnswerChange(idx, e.target.value)}
                        className="flex-1 text-xs text-slate-800 outline-none font-bold bg-transparent"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                      <span className="text-[11px] font-semibold text-indigo-700 whitespace-nowrap">
                        Variantes:
                      </span>
                      <input
                        type="text"
                        value={item.acceptedAnswers.join(', ')}
                        placeholder="Respuestas válidas separadas por comas..."
                        onChange={(e) => handleAcceptedAnswersChange(idx, e.target.value)}
                        className="flex-1 text-xs text-slate-800 outline-none font-medium bg-transparent"
                      />
                    </div>

                    <div className="sm:col-span-2 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                      <span className="text-[11px] font-semibold text-amber-700 whitespace-nowrap">
                        💡 Pista / Justificación:
                      </span>
                      <input
                        type="text"
                        value={item.hint || item.explanation || ''}
                        placeholder="Pista o justificación del texto (opcional)..."
                        onChange={(e) => handleListItemChange(idx, 'hint', e.target.value)}
                        className="flex-1 text-xs text-slate-600 outline-none bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* PREVIEW / STUDENT MODE */
                <div className="space-y-2.5">
                  {parsedPrompt.isMatching ? (
                    /* MATCHING / VOCABULARY ROW FORMAT */
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-slate-600 w-6 shrink-0 text-right">
                          {parsedPrompt.itemNumber}.
                        </span>
                        <div className="relative w-36 sm:w-44 shrink-0">
                          <input
                            type="text"
                            value={item.isExample ? (item.expectedAnswer || userVal) : userVal}
                            disabled={isEvaluated || item.isExample}
                            placeholder={item.isExample ? '' : 'Palabra...'}
                            onChange={(e) => onAnswerChange?.(item.id, e.target.value)}
                            className={`w-full text-sm rounded-xl px-3.5 py-2 outline-none font-semibold transition ${
                              item.isExample
                                ? 'bg-slate-100 text-slate-800 border border-slate-300 font-bold select-none cursor-not-allowed shadow-2xs'
                                : isEvaluated
                                  ? isCorrect
                                    ? isTypoWarning
                                      ? 'bg-white text-amber-950 border border-amber-400 font-bold pr-8 shadow-xs'
                                      : 'bg-white text-emerald-950 border border-emerald-400 font-bold pr-8 shadow-xs'
                                    : 'bg-white text-rose-950 border border-rose-400 font-bold pr-8 shadow-xs'
                                  : 'bg-white text-slate-900 border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs'
                            }`}
                          />

                          {isEvaluated && !item.isExample && (
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                              {isCorrect ? (
                                isTypoWarning ? (
                                  <AlertCircle className="w-4 h-4 text-amber-600" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                )
                              ) : (
                                <XCircle className="w-4 h-4 text-rose-600" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-1 pl-8 sm:pl-0">
                        <span className="text-sm font-semibold text-slate-700">
                          : {parsedPrompt.clue}
                        </span>

                        {item.isExample && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300 select-none">
                            ✓ Ejemplo
                          </span>
                        )}

                        {item.hint && !isEvaluated && !item.isExample && (
                          <span
                            title={`Pista: ${item.hint}`}
                            className="p-1 text-amber-600 hover:text-amber-700 cursor-help"
                          >
                            <HelpCircle className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* STANDARD SENTENCE / FILL-IN-BLANK FORMAT */
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                          {item.prompt}
                        </p>
                        {item.isExample && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300 select-none shrink-0">
                            ✓ Ejemplo
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5">
                        {item.prefix && (
                          <span className="text-sm font-bold text-slate-500">{item.prefix}</span>
                        )}

                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={item.isExample ? (item.expectedAnswer || userVal) : userVal}
                            disabled={isEvaluated || item.isExample}
                            placeholder={item.isExample ? '' : 'Escribe tu respuesta aquí...'}
                            onChange={(e) => onAnswerChange?.(item.id, e.target.value)}
                            className={`w-full text-sm rounded-xl px-4 py-2.5 outline-none font-medium transition ${
                              item.isExample
                                ? 'bg-slate-100 text-slate-800 border border-slate-300 font-bold select-none cursor-not-allowed shadow-2xs'
                                : isEvaluated
                                  ? isCorrect
                                    ? isTypoWarning
                                      ? 'bg-white text-amber-950 border border-amber-400 font-bold pr-10 shadow-xs'
                                      : 'bg-white text-emerald-950 border border-emerald-400 font-bold pr-10 shadow-xs'
                                    : 'bg-white text-rose-950 border border-rose-400 font-bold pr-10 shadow-xs'
                                  : 'bg-white text-slate-900 border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs'
                            }`}
                          />

                          {isEvaluated && !item.isExample && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2">
                              {isCorrect ? (
                                isTypoWarning ? (
                                  <AlertCircle className="w-5 h-5 text-amber-600" />
                                ) : (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                )
                              ) : (
                                <XCircle className="w-5 h-5 text-rose-600" />
                              )}
                            </span>
                          )}
                        </div>

                        {item.hint && !isEvaluated && !item.isExample && (
                          <span
                            title={`Pista: ${item.hint}`}
                            className="p-1.5 text-amber-600 hover:text-amber-700 cursor-help"
                          >
                            <HelpCircle className="w-5 h-5" />
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {/* Pedagogical Feedback for Non-Example Items */}
                  {!item.isExample && (
                    <>
                      {isEvaluated && isCorrect && isTypoWarning && (
                        <div className="text-xs text-amber-900 pt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 font-medium bg-amber-100/70 p-2.5 rounded-xl border border-amber-300 shadow-2xs">
                          <div className="flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                            <span>
                              <strong>Correcta con advertencia de ortografía:</strong> Se esperaba{' '}
                              <strong className="underline text-amber-950">"{canonicalAnswer}"</strong>
                            </span>
                          </div>
                          {explanationOrHint && (
                            <span className="text-amber-800 font-normal text-[11px]">
                              💡 {explanationOrHint}
                            </span>
                          )}
                        </div>
                      )}

                      {isEvaluated && isCorrect && !isTypoWarning && (
                        <div className="text-xs text-emerald-800 pt-1 flex items-center justify-between font-medium">
                          <span className="text-[11px] text-emerald-700 font-semibold">✓ ¡Correcto!</span>
                          {explanationOrHint && (
                            <span className="text-slate-500 font-normal text-[11px]">💡 {explanationOrHint}</span>
                          )}
                        </div>
                      )}

                      {isEvaluated && !isCorrect && (
                        <div className="text-xs text-rose-900 pt-1 flex flex-col gap-1.5 font-medium bg-rose-50/90 p-2.5 rounded-xl border border-rose-300 shadow-2xs">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span>
                              Respuesta correcta: <strong className="font-bold underline text-rose-950">{canonicalAnswer}</strong>
                              {otherAccepted.length > 0 && (
                                <span className="text-slate-600 font-normal ml-1.5 text-[11px]">
                                  (o variantes válidas: {otherAccepted.join(', ')})
                                </span>
                              )}
                            </span>
                          </div>
                          {explanationOrHint && (
                            <div className="text-slate-700 font-normal text-[11px] bg-white/80 p-1.5 rounded-lg border border-rose-200/80 flex items-start gap-1">
                              <span className="font-semibold text-rose-900 shrink-0">💡 Justificación:</span>
                              <span>{explanationOrHint}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
