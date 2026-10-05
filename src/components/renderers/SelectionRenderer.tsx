import React from 'react';
import type { SelectionBlock, SelectionQuestion, SelectionOption } from '../../types/schema';
import type { SessionEvaluation } from '../../store/useSessionStore';
import { Plus, Trash2, CheckCircle2, XCircle, Check } from 'lucide-react';

interface Props {
  block: SelectionBlock;
  studentAnswers: Record<string, any>;
  evaluation: SessionEvaluation;
  isEditMode?: boolean;
  onAnswerChange?: (key: string, value: any) => void;
  onChange?: (updated: SelectionBlock) => void;
}

export const SelectionRenderer: React.FC<Props> = ({
  block,
  studentAnswers,
  evaluation,
  isEditMode = false,
  onAnswerChange,
  onChange,
}) => {
  const handleQuestionPromptChange = (qIndex: number, prompt: string) => {
    if (!onChange) return;
    const updated = [...block.questions];
    updated[qIndex] = { ...updated[qIndex], prompt };
    onChange({ ...block, questions: updated });
  };

  const handleOptionChange = (
    qIndex: number,
    optIndex: number,
    field: keyof SelectionOption,
    val: any
  ) => {
    if (!onChange) return;
    const updatedQuestions = [...block.questions];
    const updatedOptions = [...updatedQuestions[qIndex].options];
    updatedOptions[optIndex] = { ...updatedOptions[optIndex], [field]: val };
    updatedQuestions[qIndex] = { ...updatedQuestions[qIndex], options: updatedOptions };
    onChange({ ...block, questions: updatedQuestions });
  };

  const toggleOptionCorrect = (qIndex: number, optIndex: number) => {
    if (!onChange) return;
    const question = block.questions[qIndex];
    let updatedOptions = [...question.options];

    if (question.mode === 'single_choice' || question.mode === 'dropdown') {
      updatedOptions = updatedOptions.map((opt, idx) => ({
        ...opt,
        isCorrect: idx === optIndex,
      }));
    } else {
      updatedOptions[optIndex] = {
        ...updatedOptions[optIndex],
        isCorrect: !updatedOptions[optIndex].isCorrect,
      };
    }

    const updatedQuestions = [...block.questions];
    updatedQuestions[qIndex] = { ...updatedQuestions[qIndex], options: updatedOptions };
    onChange({ ...block, questions: updatedQuestions });
  };

  const addOption = (qIndex: number) => {
    if (!onChange) return;
    const question = block.questions[qIndex];
    const newOpt: SelectionOption = {
      id: `opt-${Date.now()}`,
      text: `Nueva opción ${question.options.length + 1}`,
      isCorrect: false,
    };
    const updatedQuestions = [...block.questions];
    updatedQuestions[qIndex] = {
      ...updatedQuestions[qIndex],
      options: [...question.options, newOpt],
    };
    onChange({ ...block, questions: updatedQuestions });
  };

  const removeOption = (qIndex: number, optIndex: number) => {
    if (!onChange) return;
    const question = block.questions[qIndex];
    if (question.options.length <= 2) return;
    const updatedQuestions = [...block.questions];
    updatedQuestions[qIndex] = {
      ...updatedQuestions[qIndex],
      options: question.options.filter((_, idx) => idx !== optIndex),
    };
    onChange({ ...block, questions: updatedQuestions });
  };

  const addQuestion = () => {
    if (!onChange) return;
    const newQ: SelectionQuestion = {
      id: `q-${Date.now()}`,
      prompt: `${block.questions.length + 1}. Escribe la pregunta u oración aquí:`,
      mode: 'single_choice',
      options: [
        { id: `opt-1-${Date.now()}`, text: 'Opción correcta', isCorrect: true },
        { id: `opt-2-${Date.now()}`, text: 'Opción incorrecta', isCorrect: false },
      ],
    };
    onChange({ ...block, questions: [...block.questions, newQ] });
  };

  const removeQuestion = (qIndex: number) => {
    if (!onChange || block.questions.length <= 1) return;
    onChange({
      ...block,
      questions: block.questions.filter((_, idx) => idx !== qIndex),
    });
  };

  const toggleStudentMultiChoice = (qId: string, optId: string) => {
    const current: string[] = Array.isArray(studentAnswers[qId]) ? studentAnswers[qId] : [];
    if (current.includes(optId)) {
      onAnswerChange?.(qId, current.filter((id) => id !== optId));
    } else {
      onAnswerChange?.(qId, [...current, optId]);
    }
  };

  return (
    <div className="w-full flex flex-col">
      {/* Instruction */}
      <div className="flex items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100">
        {isEditMode ? (
          <input
            type="text"
            value={block.instruction}
            placeholder="Instrucción de la actividad..."
            onChange={(e) => onChange?.({ ...block, instruction: e.target.value })}
            className="flex-1 text-base font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 outline-none focus:border-indigo-500 focus:bg-white"
          />
        ) : (
          <p className="text-base sm:text-lg font-bold text-slate-800">
            {block.instruction}
          </p>
        )}

        {isEditMode && (
          <button
            onClick={addQuestion}
            className="text-xs flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Pregunta</span>
          </button>
        )}
      </div>

      {/* Questions list */}
      <div className="w-full space-y-4">
        {block.questions.map((q, qIdx) => {
          const isEvaluated = evaluation.isSubmitted;
          const isCorrect = evaluation.details[q.id];

          return (
            <div
              key={q.id}
              className={`p-4 rounded-xl border transition-all ${
                isEvaluated
                  ? isCorrect
                    ? 'bg-emerald-50/60 border-emerald-300'
                    : 'bg-rose-50/60 border-rose-300'
                  : 'bg-slate-50/70 border-slate-200/80'
              }`}
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                {isEditMode ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      value={q.prompt}
                      onChange={(e) => handleQuestionPromptChange(qIdx, e.target.value)}
                      className="flex-1 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={() => removeQuestion(qIdx)}
                      disabled={block.questions.length <= 1}
                      className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-20 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <p className="text-sm font-semibold text-slate-800">
                      {q.prompt}
                    </p>
                    {isEvaluated && (
                      <span>
                        {isCorrect ? (
                          <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Correcto
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
                            <XCircle className="w-3.5 h-3.5" /> Incorrecto
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Options */}
              {isEditMode ? (
                /* EDIT MODE */
                <div className="space-y-1.5">
                  {q.options.map((opt, optIdx) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleOptionCorrect(qIdx, optIdx)}
                        className={`w-6 h-6 rounded-md flex items-center justify-center border transition ${
                          opt.isCorrect
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                            : 'bg-white border-slate-300 text-slate-300 hover:border-slate-400'
                        }`}
                        title={opt.isCorrect ? 'Respuesta Correcta' : 'Clic para marcar como correcta'}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>

                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => handleOptionChange(qIdx, optIdx, 'text', e.target.value)}
                        className="flex-1 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 outline-none focus:border-indigo-500 font-medium"
                        placeholder="Opción..."
                      />

                      <button
                        onClick={() => removeOption(qIdx, optIdx)}
                        disabled={q.options.length <= 2}
                        className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-20"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => addOption(qIdx)}
                    className="mt-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Añadir opción</span>
                  </button>
                </div>
              ) : (
                /* PREVIEW / STUDENT MODE */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {q.options.map((opt) => {
                    const isSingle = q.mode === 'single_choice';
                    const isSelected = isSingle
                      ? studentAnswers[q.id] === opt.id
                      : Array.isArray(studentAnswers[q.id]) &&
                        (studentAnswers[q.id] as string[]).includes(opt.id);

                    let optClasses = 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50';

                    if (isEvaluated) {
                      if (opt.isCorrect) {
                        optClasses = 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold';
                      } else if (isSelected && !opt.isCorrect) {
                        optClasses = 'bg-rose-50 border-rose-400 text-rose-800 line-through';
                      } else {
                        optClasses = 'bg-white border-slate-200 text-slate-400 opacity-60';
                      }
                    } else if (isSelected) {
                      optClasses = 'bg-indigo-50/80 border-indigo-500 text-indigo-950 font-bold ring-1 ring-indigo-400/50 shadow-2xs';
                    }

                    return (
                      <button
                        key={opt.id}
                        disabled={isEvaluated}
                        onClick={() => {
                          if (isSingle) {
                            onAnswerChange?.(q.id, opt.id);
                          } else {
                            toggleStudentMultiChoice(q.id, opt.id);
                          }
                        }}
                        className={`p-3 rounded-xl border text-left text-sm flex items-center justify-between transition-all ${optClasses}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={`w-4 h-4 rounded-${
                              isSingle ? 'full' : 'md'
                            } border flex items-center justify-center text-[10px] ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white font-bold'
                                : 'border-slate-300 bg-white text-transparent'
                            }`}
                          >
                            {isSingle ? '•' : '✓'}
                          </span>
                          <span>{opt.text}</span>
                        </span>

                        {isEvaluated && opt.isCorrect && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
