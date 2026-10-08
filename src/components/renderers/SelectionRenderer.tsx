import React from 'react';
import type { SelectionBlock, SelectionQuestion, SelectionOption } from '../../types/schema';
import { useSessionStore, type SessionEvaluation } from '../../store/useSessionStore';
import { Plus, Trash2, CheckCircle2, XCircle, Check, HelpCircle, ChevronDown } from 'lucide-react';
import { VerificationAudioPlayer } from '../common/VerificationAudioPlayer';

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
  const isFlatMode = Boolean(block.options && block.options.length > 0) || (block.questions || []).length === 0;
  const flatOptions: SelectionOption[] = block.options || [];

  const isVerificationActive = useSessionStore((s) => s.isVerificationAudioActive);
  const setVerificationAudioActive = useSessionStore((s) => s.setVerificationAudioActive);
  const hasVerificationAudio = Boolean(block.verificationAudioUrl && block.verificationAudioUrl.trim().length > 0);

  // ==========================================
  // FLAT SELECTION ACTIONS
  // ==========================================
  const handleFlatOptionChange = (optIndex: number, field: keyof SelectionOption, val: any) => {
    if (!onChange) return;
    const updated = [...flatOptions];
    updated[optIndex] = { ...updated[optIndex], [field]: val };
    onChange({ ...block, options: updated });
  };

  const toggleFlatOptionCorrect = (optIndex: number) => {
    if (!onChange) return;
    const updated = [...flatOptions];
    updated[optIndex] = {
      ...updated[optIndex],
      isCorrect: !updated[optIndex].isCorrect,
    };
    onChange({ ...block, options: updated });
  };

  const addFlatOption = () => {
    if (!onChange) return;
    const newOpt: SelectionOption = {
      id: `opt-${Date.now()}`,
      text: `Elemento ${flatOptions.length + 1}`,
      isCorrect: false,
    };
    onChange({ ...block, options: [...flatOptions, newOpt] });
  };

  const removeFlatOption = (optIndex: number) => {
    if (!onChange || flatOptions.length <= 1) return;
    onChange({
      ...block,
      options: flatOptions.filter((_, idx) => idx !== optIndex),
    });
  };

  const toggleFlatStudentSelection = (optId: string) => {
    if (evaluation.isSubmitted) return;
    const currentList: string[] = Array.isArray(studentAnswers[block.id])
      ? studentAnswers[block.id]
      : flatOptions.filter((opt) => studentAnswers[opt.id]).map((opt) => opt.id);

    const isSelected = currentList.includes(optId);
    const updated = isSelected
      ? currentList.filter((id) => id !== optId)
      : [...currentList, optId];

    onAnswerChange?.(block.id, updated);
    onAnswerChange?.(optId, !isSelected);
  };

  // Convert between flat selection and quiz mode
  const convertToQuizMode = () => {
    if (!onChange) return;
    const questions: SelectionQuestion[] = [
      {
        id: `q-${Date.now()}`,
        prompt: block.instruction || 'Selecciona las opciones correctas:',
        mode: 'multiple_choice',
        options: flatOptions.length > 0 ? flatOptions : [
          { id: `opt-1-${Date.now()}`, text: 'Opción 1', isCorrect: true },
          { id: `opt-2-${Date.now()}`, text: 'Opción 2', isCorrect: false }
        ]
      }
    ];
    onChange({ ...block, options: undefined, questions });
  };

  const convertToFlatMode = () => {
    if (!onChange) return;
    const allOptions: SelectionOption[] = [];
    (block.questions || []).forEach((q) => {
      allOptions.push(...q.options);
    });
    onChange({
      ...block,
      options: allOptions.length > 0 ? allOptions : [
        { id: `opt-1-${Date.now()}`, text: 'Elemento 1' },
        { id: `opt-2-${Date.now()}`, text: 'Elemento 2' }
      ],
      questions: []
    });
  };

  // ==========================================
  // QUESTIONNAIRE / QUIZ ACTIONS
  // ==========================================
  const handleQuestionPromptChange = (qIndex: number, prompt: string) => {
    if (!onChange) return;
    const updated = [...(block.questions || [])];
    updated[qIndex] = { ...updated[qIndex], prompt };
    onChange({ ...block, questions: updated });
  };

  const handleQuestionModeChange = (
    qIndex: number,
    mode: 'single_choice' | 'multiple_choice' | 'dropdown'
  ) => {
    if (!onChange) return;
    const updated = [...(block.questions || [])];
    updated[qIndex] = { ...updated[qIndex], mode };
    onChange({ ...block, questions: updated });
  };

  const handleOptionChange = (
    qIndex: number,
    optIndex: number,
    field: keyof SelectionOption,
    val: any
  ) => {
    if (!onChange) return;
    const updatedQuestions = [...(block.questions || [])];
    const updatedOptions = [...updatedQuestions[qIndex].options];
    updatedOptions[optIndex] = { ...updatedOptions[optIndex], [field]: val };
    updatedQuestions[qIndex] = { ...updatedQuestions[qIndex], options: updatedOptions };
    onChange({ ...block, questions: updatedQuestions });
  };

  const toggleOptionCorrect = (qIndex: number, optIndex: number) => {
    if (!onChange) return;
    const question = (block.questions || [])[qIndex];
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

    const updatedQuestions = [...(block.questions || [])];
    updatedQuestions[qIndex] = { ...updatedQuestions[qIndex], options: updatedOptions };
    onChange({ ...block, questions: updatedQuestions });
  };

  const addOption = (qIndex: number) => {
    if (!onChange) return;
    const question = (block.questions || [])[qIndex];
    const newOpt: SelectionOption = {
      id: `opt-${Date.now()}`,
      text: `Opción ${question.options.length + 1}`,
      isCorrect: false,
    };
    const updatedQuestions = [...(block.questions || [])];
    updatedQuestions[qIndex] = {
      ...updatedQuestions[qIndex],
      options: [...question.options, newOpt],
    };
    onChange({ ...block, questions: updatedQuestions });
  };

  const removeOption = (qIndex: number, optIndex: number) => {
    if (!onChange) return;
    const question = (block.questions || [])[qIndex];
    if (question.options.length <= 2) return;
    const updatedQuestions = [...(block.questions || [])];
    updatedQuestions[qIndex] = {
      ...updatedQuestions[qIndex],
      options: question.options.filter((_, idx) => idx !== optIndex),
    };
    onChange({ ...block, questions: updatedQuestions });
  };

  const addQuestion = () => {
    if (!onChange) return;
    const questions = block.questions || [];
    const newQ: SelectionQuestion = {
      id: `q-${Date.now()}`,
      prompt: `${questions.length + 1}. Escribe la pregunta aquí:`,
      mode: 'single_choice',
      options: [
        { id: `opt-1-${Date.now()}`, text: 'Opción 1', isCorrect: true },
        { id: `opt-2-${Date.now()}`, text: 'Opción 2', isCorrect: false },
      ],
    };
    onChange({ ...block, questions: [...questions, newQ] });
  };

  const removeQuestion = (qIndex: number) => {
    if (!onChange || (block.questions || []).length <= 1) return;
    onChange({
      ...block,
      questions: (block.questions || []).filter((_, idx) => idx !== qIndex),
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
      {/* Header: Instruction and Mode Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100">
        {isEditMode ? (
          <div className="flex-1 space-y-1">
            <input
              type="text"
              value={block.instruction}
              placeholder="Instrucción de la actividad..."
              onChange={(e) => onChange?.({ ...block, instruction: e.target.value })}
              className="w-full text-base font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 outline-none focus:border-indigo-500 focus:bg-white"
            />
            <span className="text-[11px] text-slate-400 font-medium">
              {isFlatMode ? 'Modo: Lista de Selección Plana (Tarjetas)' : 'Modo: Cuestionario estructurado por reactivos'}
            </span>
          </div>
        ) : (
          <div className="space-y-0.5">
            <p className="text-base sm:text-lg font-bold text-slate-800">
              {block.instruction}
            </p>
            {isFlatMode && (
              <p className="text-xs text-slate-500 font-medium">
                Haz clic sobre las tarjetas para marcarlas o desmarcarlas.
              </p>
            )}
          </div>
        )}

        {isEditMode && (
          <div className="flex items-center gap-2 flex-wrap">
            {isFlatMode ? (
              <>
                <button
                  onClick={addFlatOption}
                  className="text-xs flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir Tarjeta</span>
                </button>
                <button
                  onClick={convertToQuizMode}
                  className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-lg border border-slate-200 transition"
                  title="Cambiar a formato de cuestionario tradicional con preguntas"
                >
                  Modo Cuestionario
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={addQuestion}
                  className="text-xs flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir Pregunta</span>
                </button>
                <button
                  onClick={convertToFlatMode}
                  className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-lg border border-slate-200 transition"
                  title="Cambiar a formato de selección plana (cuadrícula de tarjetas)"
                >
                  Modo Selección Plana
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Verification Audio Player */}
      {hasVerificationAudio && (
        <VerificationAudioPlayer
          audioUrl={block.verificationAudioUrl}
          audioLabel={block.audioLabel}
          isVerificationActive={isVerificationActive}
          isEvaluated={evaluation.isSubmitted}
          isEditMode={isEditMode}
          onAudioChange={(url, label) => onChange?.({ ...block, verificationAudioUrl: url, audioLabel: label })}
          onRemoveAudio={() => onChange?.({ ...block, verificationAudioUrl: undefined, audioLabel: undefined })}
          onActivateVerification={() => setVerificationAudioActive(true)}
        />
      )}

      {/* ============================================================== */}
      {/* MODE A: FLAT SELECTION LIST (Tarjetas interactivas)            */}
      {/* ============================================================== */}
      {isFlatMode ? (
        <div className="w-full space-y-4">
          {isEditMode ? (
            /* FLAT MODE: EDIT */
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                <span>Elementos disponibles ({flatOptions.length}):</span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <HelpCircle className="w-3 h-3" />
                  Puedes marcar opcionalmente respuestas esperadas con la casilla verde
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {flatOptions.map((opt, idx) => (
                  <div
                    key={opt.id}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center gap-2 shadow-2xs"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFlatOptionCorrect(idx)}
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition flex-shrink-0 ${
                        opt.isCorrect
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                          : 'bg-white border-slate-300 text-slate-300 hover:border-slate-400'
                      }`}
                      title={opt.isCorrect ? 'Marcada como respuesta esperada' : 'Opcional: clic para marcar como esperada'}
                    >
                      <Check className="w-3 h-3" />
                    </button>

                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => handleFlatOptionChange(idx, 'text', e.target.value)}
                      className="flex-1 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-500 font-medium"
                      placeholder="Texto del elemento..."
                    />

                    <button
                      onClick={() => removeFlatOption(idx)}
                      disabled={flatOptions.length <= 1}
                      className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-20 flex-shrink-0"
                      title="Eliminar elemento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* FLAT MODE: PREVIEW / STUDENT INTERACTION */
            (() => {
              const selectedOptionIds: string[] = Array.isArray(studentAnswers[block.id])
                ? studentAnswers[block.id]
                : flatOptions.filter((opt) => studentAnswers[opt.id]).map((opt) => opt.id);

              const isEvaluated = evaluation.isSubmitted;
              const isGraded = evaluation.isGraded !== false;
              const hasMandatoryCorrect = isGraded && flatOptions.some((o) => o.isCorrect === true);

              const isMultiColumn = flatOptions.length >= 4;

              return (
                <div className={`grid grid-cols-1 ${isMultiColumn ? 'md:grid-cols-2' : 'sm:grid-cols-2'} gap-3`}>
                  {flatOptions.map((opt) => {
                    const isSelected = selectedOptionIds.includes(opt.id);

                    let cardClasses = 'bg-white border-slate-200 text-slate-800 hover:border-indigo-300 hover:bg-slate-50/70 shadow-2xs';

                    if (isEvaluated) {
                      if (hasMandatoryCorrect) {
                        if (opt.isCorrect && isSelected) {
                          cardClasses = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs';
                        } else if (opt.isCorrect && !isSelected) {
                          cardClasses = 'bg-amber-50/80 border-amber-400 text-amber-950 font-semibold';
                        } else if (!opt.isCorrect && isSelected) {
                          cardClasses = 'bg-rose-50 border-rose-400 text-rose-800 line-through';
                        } else {
                          cardClasses = 'bg-white border-slate-200 text-slate-400 opacity-60';
                        }
                      } else {
                        // Free selection mode: no mandatory correct answers, preserve user interaction cleanly
                        if (isSelected) {
                          cardClasses = 'bg-indigo-50/90 border-indigo-500 text-indigo-950 font-bold shadow-xs';
                        } else {
                          cardClasses = 'bg-white border-slate-200 text-slate-600';
                        }
                      }
                    } else if (isSelected) {
                      cardClasses = 'bg-indigo-50/90 border-indigo-600 text-indigo-950 font-bold ring-2 ring-indigo-200/70 shadow-xs scale-[1.01]';
                    }

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isEvaluated}
                        onClick={() => toggleFlatStudentSelection(opt.id)}
                        className={`p-3.5 rounded-2xl border text-left text-sm flex items-center justify-between gap-3 transition-all transform active:scale-95 cursor-pointer ${cardClasses}`}
                      >
                        <span className="flex items-center gap-2.5 flex-1 min-w-0">
                          <span
                            className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] flex-shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white font-bold'
                                : 'border-slate-300 bg-white text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          <span className="font-medium leading-snug break-words">{opt.text}</span>
                        </span>

                        {isEvaluated && hasMandatoryCorrect && (
                          opt.isCorrect ? (
                            isSelected ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            ) : (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                Esperada
                              </span>
                            )
                          ) : isSelected ? (
                            <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                          ) : null
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      ) : (
        /* ============================================================== */
        /* MODE B: QUESTIONNAIRE / QUIZ MODE                              */
        /* ============================================================== */
        <div
          className={`w-full ${
            (block.questions || []).length > 3
              ? 'grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start'
              : 'space-y-3.5'
          }`}
        >
          {(block.questions || []).map((q, qIdx) => {
            const isEvaluated = evaluation.isSubmitted;
            const isGraded = evaluation.isGraded !== false;
            const isCorrect = isGraded ? evaluation.details[q.id] : true;

            return (
              <div
                key={q.id}
                className={`p-4 rounded-xl border transition-all ${
                  isEvaluated
                    ? isGraded
                      ? isCorrect
                        ? 'bg-emerald-50/60 border-emerald-300'
                        : 'bg-rose-50/60 border-rose-300'
                      : 'bg-indigo-50/40 border-indigo-200'
                    : 'bg-slate-50/70 border-slate-200/80'
                }`}
              >
                {/* Question Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  {isEditMode ? (
                    <div className="flex items-center gap-2 w-full flex-wrap sm:flex-nowrap">
                      <input
                        type="text"
                        value={q.prompt}
                        onChange={(e) => handleQuestionPromptChange(qIdx, e.target.value)}
                        className="flex-1 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 min-w-[180px]"
                        placeholder="Enunciado o ítem a relacionar..."
                      />
                      <select
                        value={q.mode}
                        onChange={(e) => handleQuestionModeChange(qIdx, e.target.value as any)}
                        className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-700 outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
                        title="Tipo de interacción"
                      >
                        <option value="single_choice">Opción única</option>
                        <option value="multiple_choice">Opción múltiple</option>
                        <option value="dropdown">Desplegable / Matching</option>
                      </select>
                      <button
                        onClick={() => removeQuestion(qIdx)}
                        disabled={(block.questions || []).length <= 1}
                        className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-20 rounded"
                        title="Eliminar ítem"
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
                          {!isGraded ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Registrado ✓
                            </span>
                          ) : isCorrect ? (
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
                  (() => {
                    if (q.mode === 'dropdown') {
                      const selectedOptId = (studentAnswers[q.id] as string) || '';
                      const selectedOpt = q.options.find((o) => o.id === selectedOptId);
                      const correctOpt = q.options.find((o) => o.isCorrect);
                      const isRight = selectedOpt?.isCorrect === true;

                      let selectWrapClasses = 'border-slate-300 bg-white hover:border-slate-400 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100';
                      if (isEvaluated) {
                        if (!isGraded) {
                          selectWrapClasses = selectedOptId
                            ? 'border-indigo-400 bg-indigo-50/60 font-semibold'
                            : 'border-slate-200 bg-slate-50 opacity-75';
                        } else if (isRight) {
                          selectWrapClasses = 'border-emerald-500 bg-emerald-50/90 text-emerald-950 font-bold ring-1 ring-emerald-400';
                        } else if (selectedOptId && !isRight) {
                          selectWrapClasses = 'border-rose-400 bg-rose-50/90 text-rose-950 ring-1 ring-rose-300';
                        } else {
                          selectWrapClasses = 'border-slate-300 bg-slate-50 opacity-60';
                        }
                      } else if (selectedOptId) {
                        selectWrapClasses = 'border-indigo-400 bg-indigo-50/40 text-indigo-950 font-semibold shadow-2xs';
                      }

                      return (
                        <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
                          <div className={`relative flex items-center rounded-xl border transition-all ${selectWrapClasses} w-full sm:w-auto sm:min-w-[280px]`}>
                            <select
                              value={selectedOptId}
                              disabled={isEvaluated}
                              onChange={(e) => onAnswerChange?.(q.id, e.target.value)}
                              className="w-full py-2.5 pl-3.5 pr-10 bg-transparent text-sm font-medium text-slate-800 rounded-xl appearance-none cursor-pointer focus:outline-none disabled:cursor-default"
                            >
                              <option value="" disabled>
                                -- Selecciona correspondencia --
                              </option>
                              {q.options.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.text}
                                </option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>

                          {isEvaluated && isGraded && (
                            <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0">
                              {isRight ? (
                                <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                                  <CheckCircle2 className="w-4 h-4" /> Correcto
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                                  <XCircle className="w-4 h-4" />
                                  {correctOpt ? `Correcto: ${correctOpt.text}` : 'Incorrecto'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }

                    const isLongOptions = q.options.some((o) => (o.text || '').length > 25) || q.options.length > 2;
                    return (
                      <div className={`grid gap-2 mt-2 ${isLongOptions ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                        {q.options.map((opt) => {
                          const isSingle = q.mode === 'single_choice';
                          const isSelected = isSingle
                            ? studentAnswers[q.id] === opt.id
                            : Array.isArray(studentAnswers[q.id]) &&
                              (studentAnswers[q.id] as string[]).includes(opt.id);

                          let optClasses = 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50';

                          if (isEvaluated) {
                            if (!isGraded) {
                              if (isSelected) {
                                optClasses = 'bg-indigo-50/90 border-indigo-500 text-indigo-950 font-bold ring-1 ring-indigo-400/50 shadow-2xs';
                              } else {
                                optClasses = 'bg-white border-slate-200 text-slate-500 opacity-75';
                              }
                            } else if (opt.isCorrect) {
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
                              className={`p-3 rounded-xl border text-left text-sm flex items-center justify-between gap-2.5 transition-all ${optClasses}`}
                            >
                              <span className="flex items-center gap-2.5 flex-1 min-w-0">
                                <span
                                  className={`w-4 h-4 rounded-${
                                    isSingle ? 'full' : 'md'
                                  } border flex items-center justify-center text-[10px] shrink-0 ${
                                    isSelected
                                      ? 'bg-indigo-600 border-indigo-600 text-white font-bold'
                                      : 'border-slate-300 bg-white text-transparent'
                                  }`}
                                >
                                  {isSingle ? '•' : '✓'}
                                </span>
                                <span className="font-medium leading-snug break-words">{opt.text}</span>
                              </span>

                              {isEvaluated && isGraded && opt.isCorrect && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Communicative Follow-up / Oral Practice Prompt (Paso c) */}
      {(Boolean(block.followUpPrompt) || isEditMode) && (
        <div className="mt-6 p-4 sm:p-5 rounded-2xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-indigo-50/80 shadow-2xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🗣️</span>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                Paso c: Práctica Oral / Cierre Comunicativo
              </span>
            </div>
            {isEditMode && (
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Opcional</span>
            )}
          </div>
          {isEditMode ? (
            <input
              type="text"
              value={block.followUpPrompt || ''}
              placeholder="Instrucción de cierre o producción oral (ej. c Ask each other the questions)..."
              onChange={(e) => onChange?.({ ...block, followUpPrompt: e.target.value || undefined })}
              className="w-full text-xs sm:text-sm font-semibold text-slate-800 bg-white border border-indigo-200 rounded-xl px-3.5 py-2 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-300 shadow-2xs"
            />
          ) : (
            <p className="text-xs sm:text-sm font-semibold text-slate-800 pl-7 leading-relaxed">
              {block.followUpPrompt}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
