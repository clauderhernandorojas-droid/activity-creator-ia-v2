import React from 'react';
import type { ClozeMultichoiceBlock } from '../../types/schema';
import type { SessionEvaluation } from '../../store/useSessionStore';
import { CheckCircle2, XCircle, ChevronDown, Sparkles } from 'lucide-react';
import { VerificationAudioPlayer } from '../common/VerificationAudioPlayer';

interface Props {
  block: ClozeMultichoiceBlock;
  studentAnswers: Record<string, any>;
  evaluation?: SessionEvaluation;
  isEditMode?: boolean;
  onAnswerChange?: (key: string, value: any) => void;
  onChange?: (updated: ClozeMultichoiceBlock) => void;
}

export const ClozeMultichoiceRenderer: React.FC<Props> = ({
  block,
  studentAnswers = {},
  evaluation,
  isEditMode = false,
  onAnswerChange,
  onChange,
}) => {
  const isEvaluated = Boolean(evaluation && Object.keys(evaluation.details || {}).length > 0);
  const gaps = Array.isArray(block.gaps) ? block.gaps : [];
  const passageText = block.passageText || '';

  // Segments of the passage: split on tokens like {{gap-1}}, {{gap-2}}, etc.
  const tokenRegex = /(\{\{gap-\d+\}\})/g;
  const segments = passageText.split(tokenRegex);

  const getGapForToken = (token: string) => {
    const match = token.match(/\d+/);
    if (!match) return null;
    const num = parseInt(match[0], 10);
    return gaps.find((g) => g.id === `gap-${num}` || g.ordinal === num) || gaps[num - 1] || null;
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header & Verification Audio */}
      {block.verificationAudioUrl && (
        <div className="flex justify-end">
          <VerificationAudioPlayer
            audioUrl={block.verificationAudioUrl}
            audioLabel={block.audioLabel}
          />
        </div>
      )}

      {/* Main Passage Container */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
        {block.instruction && (
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-700 tracking-wide">
              {block.instruction}
            </h3>
          </div>
        )}

        {isEditMode ? (
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Texto del Pasaje (Use marcadores {'{{gap-1}}'}, {'{{gap-2}}'}...):
            </label>
            <textarea
              value={passageText}
              onChange={(e) => onChange?.({ ...block, passageText: e.target.value })}
              rows={8}
              className="w-full p-3.5 text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        ) : (
          <div className="text-base sm:text-lg leading-loose sm:leading-[2.4] text-slate-800 font-normal">
            {segments.map((segment, sIdx) => {
              if (tokenRegex.test(segment)) {
                tokenRegex.lastIndex = 0;
                const gap = getGapForToken(segment);
                if (!gap) {
                  return (
                    <span key={sIdx} className="font-mono text-xs text-rose-500 px-1">
                      {segment}
                    </span>
                  );
                }

                const gapId = gap.id || `gap-${gap.ordinal || sIdx + 1}`;
                const selectedVal = (studentAnswers[gapId] as string) || (gap.isExample ? gap.correctOptionId || gap.options[0]?.id : '') || '';
                const gapEval = evaluation?.details?.[gapId];
                const isCorrect = typeof gapEval === 'boolean' ? gapEval : Boolean(selectedVal && selectedVal === gap.correctOptionId);

                let wrapStyle = 'border-slate-300 bg-slate-50/70 hover:border-indigo-400 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100';

                if (gap.isExample) {
                  wrapStyle = 'border-indigo-300 bg-indigo-50/80 text-indigo-900 font-semibold ring-1 ring-indigo-200';
                } else if (isEvaluated) {
                  if (isCorrect) {
                    wrapStyle = 'border-emerald-500 bg-emerald-50/90 text-emerald-950 font-semibold ring-1 ring-emerald-400';
                  } else if (selectedVal) {
                    wrapStyle = 'border-rose-400 bg-rose-50/90 text-rose-950 ring-1 ring-rose-300';
                  } else {
                    wrapStyle = 'border-amber-300 bg-amber-50/70 text-amber-900';
                  }
                } else if (selectedVal) {
                  wrapStyle = 'border-indigo-400 bg-indigo-50/40 text-indigo-950 font-medium shadow-2xs';
                }

                return (
                  <span
                    key={sIdx}
                    className="inline-flex items-center align-middle mx-1.5 my-1"
                  >
                    <span className={`relative inline-flex items-center rounded-xl border transition-all ${wrapStyle} px-2.5 py-1 text-sm sm:text-base`}>
                      <span className="text-xs font-bold text-slate-500 mr-2 select-none">
                        {gap.ordinal ?? sIdx + 1}.
                      </span>
                      <select
                        value={selectedVal}
                        disabled={isEvaluated || Boolean(gap.isExample)}
                        onChange={(e) => onAnswerChange?.(gapId, e.target.value)}
                        className="bg-transparent text-sm sm:text-base font-semibold appearance-none pr-6 cursor-pointer focus:outline-none disabled:cursor-default"
                      >
                        <option value="" disabled>
                          -- seleccionar --
                        </option>
                        {gap.options.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.id}) {opt.text}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2" />
                      {gap.isExample && (
                        <span className="ml-1 text-[10px] font-bold uppercase tracking-wider bg-indigo-200 text-indigo-800 rounded px-1 py-0.5 select-none">
                          Ej.
                        </span>
                      )}
                      {isEvaluated && !gap.isExample && (
                        <span className="ml-1">
                          {isCorrect ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-500 inline" />
                          )}
                        </span>
                      )}
                    </span>
                  </span>
                );
              }
              return (
                <span key={sIdx} className="whitespace-pre-wrap">
                  {segment}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Options Bank Section (Reference Grid) */}
      {gaps.length > 0 && (
        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-1.5">
            Banco de Opciones por Reactivo
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {gaps.map((gap, gIdx) => {
              const gapId = gap.id || `gap-${gap.ordinal || gIdx + 1}`;
              const selectedOptId = studentAnswers[gapId] || (gap.isExample ? gap.correctOptionId : '');
              return (
                <div
                  key={gapId}
                  className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs"
                >
                  <span className="font-bold text-sm text-indigo-600 bg-indigo-50 border border-indigo-200/60 rounded-lg w-7 h-7 flex items-center justify-center shrink-0">
                    {gap.ordinal ?? gIdx + 1}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    {gap.options.map((opt) => {
                      const isChosen = selectedOptId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={isEvaluated || Boolean(gap.isExample)}
                          onClick={() => onAnswerChange?.(gapId, opt.id)}
                          className={`text-xs sm:text-sm font-medium px-2.5 py-1 rounded-lg border transition-all ${
                            isChosen
                              ? 'border-indigo-500 bg-indigo-600 text-white font-semibold shadow-2xs'
                              : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                          } disabled:cursor-default`}
                        >
                          <strong className="mr-1">{opt.id})</strong> {opt.text}
                        </button>
                      );
                    })}
                  </div>
                  {gap.isExample && (
                    <span className="text-[10px] font-bold uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                      Modelo
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
