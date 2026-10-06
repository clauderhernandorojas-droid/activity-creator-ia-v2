import React from 'react';
import type { InputFieldsBlock, InputFieldListItem } from '../../types/schema';
import type { SessionEvaluation } from '../../store/useSessionStore';
import { Plus, Trash2, CheckCircle2, XCircle, HelpCircle, AlertCircle } from 'lucide-react';

interface Props {
  block: InputFieldsBlock;
  studentAnswers: Record<string, any>;
  evaluation: SessionEvaluation;
  isEditMode?: boolean;
  onAnswerChange?: (key: string, value: string) => void;
  onChange?: (updated: InputFieldsBlock) => void;
}

export const InputFieldsRenderer: React.FC<Props> = ({
  block,
  studentAnswers,
  evaluation,
  isEditMode = false,
  onAnswerChange,
  onChange,
}) => {
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
      prompt: 'New sentence prompt with a blank...',
      prefix: 'Q: ',
      expectedAnswer: 'correct answer',
      acceptedAnswers: ['correct answer'],
      hint: 'Grammar tip or text clue',
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
      <div className="flex items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100">
        {isEditMode ? (
          <input
            type="text"
            value={block.instruction}
            placeholder="Instrucción de la actividad (ej. Complete the sentences with the correct form)..."
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

      {/* Questions list */}
      <div className="w-full space-y-4">
        {block.listItems.map((item, idx) => {
          const isEvaluated = evaluation.isSubmitted;
          const isCorrect = Boolean(evaluation.details[item.id]);
          const itemFeedback = evaluation.itemFeedback?.[item.id];
          const isTypoWarning = isCorrect && itemFeedback?.status === 'correct_with_typo';
          const userVal = studentAnswers[item.id] || '';

          // Canonical answer guaranteed never empty
          const canonicalAnswer =
            item.expectedAnswer?.trim() ||
            itemFeedback?.expectedAnswer?.trim() ||
            item.acceptedAnswers[0]?.trim() ||
            'Respuesta según texto';

          const otherAccepted = item.acceptedAnswers
            .map((a) => a.trim())
            .filter((a) => a && a.toLowerCase() !== canonicalAnswer.toLowerCase());

          const explanationOrHint =
            item.explanation?.trim() ||
            itemFeedback?.explanation?.trim() ||
            item.hint?.trim();

          return (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition-all ${
                isEvaluated
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
                      placeholder="Oración o pregunta base..."
                      onChange={(e) => handleListItemChange(idx, 'prompt', e.target.value)}
                      className="flex-1 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500"
                    />
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
                  <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                    {item.prompt}
                  </p>

                  <div className="flex items-center gap-2.5">
                    {item.prefix && (
                      <span className="text-sm font-bold text-slate-500">{item.prefix}</span>
                    )}

                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={userVal}
                        disabled={isEvaluated}
                        placeholder="Escribe tu respuesta aquí..."
                        onChange={(e) => onAnswerChange?.(item.id, e.target.value)}
                        className={`w-full text-sm rounded-xl px-4 py-2.5 outline-none font-medium transition ${
                          isEvaluated
                            ? isCorrect
                              ? isTypoWarning
                                ? 'bg-white text-amber-950 border border-amber-400 font-bold pr-10 shadow-xs'
                                : 'bg-white text-emerald-950 border border-emerald-400 font-bold pr-10 shadow-xs'
                              : 'bg-white text-rose-950 border border-rose-400 font-bold pr-10 shadow-xs'
                            : 'bg-white text-slate-900 border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs'
                        }`}
                      />

                      {isEvaluated && (
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

                    {item.hint && !isEvaluated && (
                      <span
                        title={`Pista: ${item.hint}`}
                        className="p-1.5 text-amber-600 hover:text-amber-700 cursor-help"
                      >
                        <HelpCircle className="w-5 h-5" />
                      </span>
                    )}
                  </div>

                  {/* Complete Pedagogical Feedback */}
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

                  {isEvaluated && isCorrect && !isTypoWarning && explanationOrHint && (
                    <div className="text-xs text-emerald-800 pt-1 flex items-center justify-between font-medium">
                      <span className="text-[11px] text-emerald-700 font-semibold">✓ ¡Correcto!</span>
                      <span className="text-slate-500 font-normal text-[11px]">💡 {explanationOrHint}</span>
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
