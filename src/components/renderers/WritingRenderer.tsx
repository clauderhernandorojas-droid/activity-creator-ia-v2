import React, { useState, useMemo } from 'react';
import type { WritingBlock } from '../../types/schema';
import type { SessionEvaluation } from '../../store/useSessionStore';
import { evaluateWriting, type WritingFeedback } from '../../core/ai/evaluateWriting';
import { VerificationAudioPlayer } from '../common/VerificationAudioPlayer';
import { renderFormattedMarkdown } from '../../core/text/markdownRenderer';
import { isSubstantialTextOverlap, isConcatenationOfItems, stripOrphanTypographicalMarkers } from '../../core/text/textDeduplication';
import { partitionWritingInstruction, generateDeterministicGuidelines } from '../../core/ai/payloadMapper';
import { 
  Sparkles, 
  CheckCircle2, 
  RotateCcw, 
  Copy, 
  Check, 
  Plus, 
  Trash2, 
  FileText, 
  Lightbulb, 
  TrendingUp,
  Award,
  Users
} from 'lucide-react';

interface Props {
  block: WritingBlock;
  studentAnswers: Record<string, any>;
  evaluation?: SessionEvaluation;
  isEditMode?: boolean;
  onAnswerChange?: (key: string, value: any) => void;
  onChange?: (updated: WritingBlock) => void;
}

export const WritingRenderer: React.FC<Props> = ({
  block,
  studentAnswers,
  isEditMode = false,
  onAnswerChange,
  onChange,
}) => {
  const currentText = typeof studentAnswers[block.id] === 'string'
    ? studentAnswers[block.id]
    : '';

  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'corrections' | 'improved'>('summary');
  const [copiedDraft, setCopiedDraft] = useState(false);

  // Real-time word and character counts
  const { wordCount, charCount } = useMemo(() => {
    const trimmed = currentText.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
    return {
      wordCount: words.length,
      charCount: currentText.length,
    };
  }, [currentText]);

  // Dynamic extraction/isolation of followUpPrompt if present on block or embedded in multi-phase instruction
  const effectiveFollowUpPrompt = useMemo(() => {
    if (block.followUpPrompt && block.followUpPrompt.trim()) {
      return block.followUpPrompt.trim();
    }
    const partitioned = partitionWritingInstruction(block.instruction);
    return partitioned.followUpPrompt || undefined;
  }, [block.followUpPrompt, block.instruction]);

  // Deterministic Cognitive Scaffolding:
  const effectiveGuidelines = useMemo(() => {
    if (block.guidelines && block.guidelines.length > 0) {
      return block.guidelines.map(stripOrphanTypographicalMarkers).filter(Boolean);
    }
    return generateDeterministicGuidelines(block.instruction, block.prompt);
  }, [block.guidelines, block.instruction, block.prompt]);

  // Clean up instruction so that if followUpPrompt exists, the main header instruction NEVER contains the follow-up text
  const displayInstruction = useMemo(() => {
    let raw = block.instruction?.trim() || 'Escribe tu redacción';

    const followUp = effectiveFollowUpPrompt;
    if (followUp) {
      if (raw.includes(followUp)) {
        raw = raw.replace(followUp, '').trim();
      }
      const escaped = followUp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const withMarkerRegex = new RegExp(
        `(?:(?:\\r?\\n)+|\\s+)*(?:\\*{0,2}(?:\\([b-dB-D2-4]\\)[.:]?|[b-dB-D2-4][).:])\\*{0,2}\\s*)?${escaped}`,
        'i'
      );
      raw = raw.replace(withMarkerRegex, '').trim();
      raw = raw.replace(/(?:(?:\r?\n)+\s*|\s+)(?:\*{0,2}(?:\([b-dB-D2-4]\)[.:]?|[b-dB-D2-4][).:])\*{0,2})\s*$/i, '').trim();
    }

    if (effectiveGuidelines.length > 0 && isConcatenationOfItems(raw, effectiveGuidelines, 0.6)) {
      return 'Redacta tu texto siguiendo las pautas indicadas:';
    }
    return raw || 'Escribe tu redacción';
  }, [block.instruction, effectiveGuidelines, effectiveFollowUpPrompt]);

  // Clean prompt so it doesn't contain follow-up text or overlap with instruction
  const displayPrompt = useMemo(() => {
    if (!block.prompt?.trim()) return '';
    let p = block.prompt.trim();
    const followUp = effectiveFollowUpPrompt;
    if (followUp && p.includes(followUp)) {
      p = p.replace(followUp, '').trim();
    }
    return stripOrphanTypographicalMarkers(p);
  }, [block.prompt, effectiveFollowUpPrompt]);

  // Check if prompt is redundant with instruction or is merely concatenating guidelines
  const isPromptRedundant = useMemo(() => {
    if (!displayPrompt.trim()) return true;
    if (displayInstruction && isSubstantialTextOverlap(displayPrompt, displayInstruction, 0.65)) {
      return true;
    }
    if (effectiveGuidelines.length > 0) {
      if (isConcatenationOfItems(displayPrompt, effectiveGuidelines, 0.55)) {
        return true;
      }
    }
    return false;
  }, [displayPrompt, displayInstruction, effectiveGuidelines]);

  // Handle student text typing
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    onAnswerChange?.(block.id, newVal);
  };

  // Perform formative evaluation
  const handleAnalyze = async () => {
    if (!currentText.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const res = await evaluateWriting({
        studentText: currentText,
        prompt: block.prompt || block.instruction,
        guidelines: effectiveGuidelines.length > 0 ? effectiveGuidelines : block.guidelines,
        evaluationRubric: block.evaluationRubric,
        minWords: block.minWords,
        maxWords: block.maxWords,
      });
      setFeedback(res);
      setActiveTab('summary');
    } catch (err) {
      console.error('[WritingRenderer] Evaluation failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyImprovedDraft = async () => {
    if (!feedback?.improvedDraft) return;
    try {
      await navigator.clipboard.writeText(feedback.improvedDraft);
      setCopiedDraft(true);
      setTimeout(() => setCopiedDraft(false), 2000);
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  };

  // ==========================================
  // EDIT MODE HANDLERS
  // ==========================================
  const handleFieldChange = (field: keyof WritingBlock, val: any) => {
    if (!onChange) return;
    onChange({ ...block, [field]: val });
  };

  const handleAddGuideline = () => {
    if (!onChange) return;
    const base = block.guidelines && block.guidelines.length > 0 ? block.guidelines : effectiveGuidelines;
    const current = [...base];
    onChange({
      ...block,
      guidelines: [...current, `Nueva pauta ${current.length + 1}`],
    });
  };

  const handleUpdateGuideline = (idx: number, val: string) => {
    if (!onChange) return;
    const base = block.guidelines && block.guidelines.length > 0 ? block.guidelines : effectiveGuidelines;
    const current = [...base];
    current[idx] = val;
    onChange({ ...block, guidelines: current });
  };

  const handleRemoveGuideline = (idx: number) => {
    if (!onChange) return;
    const base = block.guidelines && block.guidelines.length > 0 ? block.guidelines : effectiveGuidelines;
    const current = base.filter((_, i) => i !== idx);
    onChange({ ...block, guidelines: current });
  };

  // Target word threshold status
  const minWords = block.minWords;
  const maxWords = block.maxWords;
  const hasMinTarget = typeof minWords === 'number' && minWords > 0;
  const hasMaxTarget = typeof maxWords === 'number' && maxWords > 0;
  const meetsMin = !hasMinTarget || wordCount >= minWords!;
  const withinMax = !hasMaxTarget || wordCount <= maxWords!;

  return (
    <div className="w-full flex flex-col space-y-6">
      {/* Verification Audio Bar if defined */}
      {block.verificationAudioUrl && (
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3">
          <VerificationAudioPlayer
            audioUrl={block.verificationAudioUrl}
            audioLabel={block.audioLabel}
            isEditMode={isEditMode}
            onAudioChange={(url: string, label?: string) => {
              if (onChange) {
                onChange({ ...block, verificationAudioUrl: url, audioLabel: label });
              }
            }}
            onRemoveAudio={() => {
              if (onChange) {
                const updated = { ...block };
                delete updated.verificationAudioUrl;
                delete updated.audioLabel;
                onChange(updated);
              }
            }}
          />
        </div>
      )}

      {/* Main Prompt and Instruction Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  Producción Escrita
                </span>
                {hasMinTarget && (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                    meetsMin ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {meetsMin ? `Objetivo alcanzado: ≥ ${minWords} palabras` : `Objetivo mínimo: ${minWords} palabras`}
                  </span>
                )}
              </div>

              {isEditMode ? (
                <div className="space-y-2 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Instrucción principal:</label>
                    <input
                      type="text"
                      value={block.instruction || ''}
                      placeholder="Instrucción del ejercicio..."
                      onChange={(e) => handleFieldChange('instruction', e.target.value)}
                      className="w-full text-base font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:border-indigo-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Consigna central / Tarea específica (Prompt):</label>
                    <textarea
                      value={block.prompt || ''}
                      placeholder="Consigna detallada (ej. Write a profile of someone you admire...)"
                      onChange={(e) => handleFieldChange('prompt', e.target.value)}
                      rows={2}
                      className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:border-indigo-600 outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    {renderFormattedMarkdown(displayInstruction)}
                  </h3>
                  {displayPrompt && !isPromptRedundant && (
                    <p className="text-sm font-medium text-slate-600 mt-1 leading-relaxed">
                      {renderFormattedMarkdown(displayPrompt)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Guidelines / Procedural Steps */}
        {(effectiveGuidelines.length > 0 || isEditMode) && (
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                <span>Pautas y Pasos Guía (Guidelines):</span>
              </span>
              {isEditMode && (
                <button
                  type="button"
                  onClick={handleAddGuideline}
                  className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-0.5 rounded transition cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Añadir Pauta</span>
                </button>
              )}
            </div>

            {isEditMode ? (
              <div className="space-y-2">
                {(block.guidelines && block.guidelines.length > 0 ? block.guidelines : effectiveGuidelines).map((guide, gIdx) => (
                  <div key={gIdx} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-5 text-right">{gIdx + 1}.</span>
                    <input
                      type="text"
                      value={guide}
                      onChange={(e) => handleUpdateGuideline(gIdx, e.target.value)}
                      className="flex-1 text-xs text-slate-800 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:border-indigo-600 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveGuideline(gIdx)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                      title="Eliminar pauta"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {((!block.guidelines || block.guidelines.length === 0) && effectiveGuidelines.length === 0) && (
                  <p className="text-xs text-slate-400 italic">No hay pautas configuradas. Haz clic en 'Añadir Pauta'.</p>
                )}
              </div>
            ) : (
              <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 list-disc list-inside">
                {effectiveGuidelines.map((guide, gIdx) => (
                  <li key={gIdx} className="leading-relaxed">
                    {renderFormattedMarkdown(guide)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Configuration inputs in Edit Mode */}
        {isEditMode && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Palabras Mínimas:</label>
              <input
                type="number"
                value={block.minWords ?? ''}
                placeholder="Ej. 50"
                onChange={(e) => handleFieldChange('minWords', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                className="w-full mt-0.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:border-indigo-600 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Palabras Máximas:</label>
              <input
                type="number"
                value={block.maxWords ?? ''}
                placeholder="Ej. 150"
                onChange={(e) => handleFieldChange('maxWords', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                className="w-full mt-0.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:border-indigo-600 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Placeholder:</label>
              <input
                type="text"
                value={block.placeholder || ''}
                placeholder="Escribe tu redacción aquí..."
                onChange={(e) => handleFieldChange('placeholder', e.target.value)}
                className="w-full mt-0.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:border-indigo-600 outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Interactive Writing Area */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-1">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
            <span>Tu Redacción</span>
          </label>

          {/* Live Reactive Metrics */}
          <div className="flex items-center gap-3 text-xs">
            <span className={`font-semibold px-2.5 py-1 rounded-lg border transition-all ${
              hasMinTarget && !meetsMin
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : hasMaxTarget && !withinMax
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}>
              📝 <strong>{wordCount}</strong> {wordCount === 1 ? 'palabra' : 'palabras'}
              {hasMinTarget && (
                <span className="text-[11px] font-normal ml-1 text-slate-500">
                  / min. {minWords}
                </span>
              )}
            </span>
            <span className="text-slate-400 text-[11px] hidden sm:inline">
              {charCount} caracteres
            </span>
          </div>
        </div>

        {/* Textarea */}
        <div className="relative">
          <textarea
            value={currentText}
            onChange={handleTextChange}
            placeholder={block.placeholder || 'Escribe tu texto en inglés aquí... Recuerda organizar tus ideas en oraciones claras y usar conectores.'}
            rows={7}
            className="w-full p-4 text-sm sm:text-base leading-relaxed text-slate-800 placeholder-slate-400 bg-white border border-slate-200 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none resize-y transition duration-150 font-sans shadow-2xs min-h-[160px]"
          />
        </div>

        {/* Action Button Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
            <span>La IA evalúa vocabulario, gramática, conectores y pautas en tiempo real.</span>
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isAnalyzing || wordCount < 3}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-xs transition transform active:scale-95 cursor-pointer ${
              wordCount < 3
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : isAnalyzing
                ? 'bg-indigo-400 text-white cursor-wait'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-200 shadow-sm'
            }`}
          >
            {isAnalyzing ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Analizando con IA pedagógica...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>✨ Analizar y Obtener Feedback</span>
              </>
            )}
          </button>
        </div>

        {/* Complementary Follow-Up / Pair Work Activity Section */}
        {((Boolean(effectiveFollowUpPrompt) && effectiveFollowUpPrompt!.trim().length > 0) || isEditMode) && (
          <div className="mt-4 pt-3.5 border-t border-slate-100">
            <div className="bg-gradient-to-r from-purple-50/70 to-indigo-50/50 border border-purple-200/80 rounded-xl p-3.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 text-[11px] font-bold shadow-2xs">
                  <Users className="w-3.5 h-3.5 text-purple-600" />
                  <span>Follow-up / Pair Work (Actividad Complementaria)</span>
                </span>
                {isEditMode && (
                  <span className="text-[10px] text-slate-400">
                    Paso complementario (discusión oral / puesta en común)
                  </span>
                )}
              </div>

              {isEditMode ? (
                <textarea
                  value={block.followUpPrompt || effectiveFollowUpPrompt || ''}
                  placeholder="Ej. Work in pairs. Read your partner's profile and ask two follow-up questions..."
                  onChange={(e) => handleFieldChange('followUpPrompt', e.target.value)}
                  rows={2}
                  className="w-full text-xs text-slate-800 bg-white border border-purple-200 rounded-lg p-2 focus:border-purple-500 outline-none resize-y"
                />
              ) : (
                <div className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium pl-1">
                  {renderFormattedMarkdown(effectiveFollowUpPrompt || '')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Formative Feedback Presentation Card */}
      {feedback && (
        <div className="bg-white border-2 border-indigo-200/80 rounded-2xl p-5 sm:p-7 shadow-md space-y-5 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shadow-2xs">
                <Award className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  Retroalimentación Formativa
                </h4>
                <p className="text-xs text-slate-500">
                  Análisis pedagógico automatizado y sugerencias de enriquecimiento
                </p>
              </div>
            </div>

            {/* Segmented Tab Control */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('summary')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'summary'
                    ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🌟 Resumen & Aciertos
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('corrections')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'corrections'
                    ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>✏️ Correcciones</span>
                {feedback.corrections.length > 0 && (
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full font-bold">
                    {feedback.corrections.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('improved')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'improved'
                    ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🚀 Borrador Enriquecido
              </button>
            </div>
          </div>

          {/* TAB 1: Summary & Strengths */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="bg-indigo-50/60 border border-indigo-100/90 rounded-xl p-4 text-sm text-slate-800 leading-relaxed font-medium">
                {feedback.summary}
              </div>

              {feedback.strengths.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Aciertos y Puntos Fuertes Detectados:</span>
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {feedback.strengths.map((str, sIdx) => (
                      <div
                        key={sIdx}
                        className="flex items-start gap-2 bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-xs text-slate-700 font-medium"
                      >
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{str}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Corrections */}
          {activeTab === 'corrections' && (
            <div className="space-y-3">
              {feedback.corrections.length === 0 ? (
                <div className="text-center py-8 text-slate-500 space-y-2 bg-slate-50 rounded-xl border border-slate-100">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-sm font-bold text-slate-800">¡Excelente redacción!</p>
                  <p className="text-xs text-slate-500">No se detectaron errores mecánicos ni gramaticales evidentes en tu texto.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {feedback.corrections.map((corr, cIdx) => (
                    <div
                      key={cIdx}
                      className="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-slate-50/50 hover:bg-white transition shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        <span className="line-through text-rose-600 bg-rose-50 px-2 py-0.5 rounded font-mono font-medium">
                          {corr.original}
                        </span>
                        <span className="text-slate-400 font-bold">➔</span>
                        <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono">
                          {corr.suggestion}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed pl-1 border-l-2 border-indigo-400">
                        {corr.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Improved Draft */}
          {activeTab === 'improved' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  Versión sugerida enriquecida con vocabulario y conectores avanzados:
                </span>
                <button
                  type="button"
                  onClick={handleCopyImprovedDraft}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer shadow-2xs"
                >
                  {copiedDraft ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copiar Borrador</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm sm:text-base text-slate-800 leading-relaxed font-sans whitespace-pre-line shadow-inner">
                {feedback.improvedDraft}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
