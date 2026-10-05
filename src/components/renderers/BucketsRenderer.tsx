import React, { useState } from 'react';
import type { BucketsMatchingBlock, BucketTarget, BucketToken } from '../../types/schema';
import type { SessionEvaluation } from '../../store/useSessionStore';
import { Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  block: BucketsMatchingBlock;
  studentAnswers: Record<string, any>;
  evaluation: SessionEvaluation;
  isEditMode?: boolean;
  onAnswerChange?: (key: string, value: any) => void;
  onChange?: (updated: BucketsMatchingBlock) => void;
}

export const BucketsRenderer: React.FC<Props> = ({
  block,
  studentAnswers,
  evaluation,
  isEditMode = false,
  onAnswerChange,
  onChange,
}) => {
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  const handleBucketChange = (bIndex: number, field: keyof BucketTarget, val: any) => {
    if (!onChange) return;
    const updated = [...block.buckets];
    updated[bIndex] = { ...updated[bIndex], [field]: val };
    onChange({ ...block, buckets: updated });
  };

  const addBucket = () => {
    if (!onChange) return;
    const colors = ['#4f46e5', '#0284c7', '#059669', '#d97706', '#db2777'];
    const newB: BucketTarget = {
      id: `b-${Date.now()}`,
      label: `CATEGORÍA ${block.buckets.length + 1}`,
      description: 'Uso o preposición...',
      color: colors[block.buckets.length % colors.length],
    };
    onChange({ ...block, buckets: [...block.buckets, newB] });
  };

  const removeBucket = (bIndex: number) => {
    if (!onChange || block.buckets.length <= 2) return;
    onChange({
      ...block,
      buckets: block.buckets.filter((_, idx) => idx !== bIndex),
    });
  };

  const handleTokenChange = (tIndex: number, field: keyof BucketToken, val: any) => {
    if (!onChange) return;
    const updated = [...block.tokens];
    updated[tIndex] = { ...updated[tIndex], [field]: val };
    onChange({ ...block, tokens: updated });
  };

  const addToken = () => {
    if (!onChange) return;
    const newT: BucketToken = {
      id: `tok-${Date.now()}`,
      text: `Palabra ${block.tokens.length + 1}`,
      correctBucketId: block.buckets[0]?.id || '',
      hint: 'Pista pedagógica',
    };
    onChange({ ...block, tokens: [...block.tokens, newT] });
  };

  const removeToken = (tIndex: number) => {
    if (!onChange || block.tokens.length <= 2) return;
    onChange({
      ...block,
      tokens: block.tokens.filter((_, idx) => idx !== tIndex),
    });
  };

  const assignTokenToBucket = (tokenId: string, bucketId: string | null) => {
    if (evaluation.isSubmitted) return;
    onAnswerChange?.(tokenId, bucketId);
    setSelectedTokenId(null);
  };

  return (
    <div className="w-full flex flex-col">
      {/* Top Header */}
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
          <div className="flex items-center gap-1.5">
            <button
              onClick={addBucket}
              className="text-xs flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-200 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Contenedor</span>
            </button>
            <button
              onClick={addToken}
              className="text-xs flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ficha</span>
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="w-full flex flex-col space-y-4">
        {isEditMode ? (
          /* EDIT MODE */
          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                Contenedores de Clasificación:
              </span>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {block.buckets.map((bucket, bIdx) => (
                  <div
                    key={bucket.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5 shadow-2xs"
                    style={{ borderTopColor: bucket.color || '#4f46e5', borderTopWidth: '3px' }}
                  >
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={bucket.label}
                        onChange={(e) => handleBucketChange(bIdx, 'label', e.target.value)}
                        className="text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded px-2 py-1 w-24 outline-none"
                      />
                      <button
                        onClick={() => removeBucket(bIdx)}
                        disabled={block.buckets.length <= 2}
                        className="text-slate-400 hover:text-rose-600 disabled:opacity-20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                Fichas y Contenedor Correcto:
              </span>
              <div className="space-y-1.5">
                {block.tokens.map((token, tIdx) => (
                  <div
                    key={token.id}
                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <span className="text-xs text-slate-400 w-5">#{tIdx + 1}</span>
                    <input
                      type="text"
                      value={token.text}
                      onChange={(e) => handleTokenChange(tIdx, 'text', e.target.value)}
                      className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 outline-none"
                    />

                    <span className="text-xs text-slate-500 font-medium">→ Destino:</span>
                    <select
                      value={token.correctBucketId}
                      onChange={(e) => handleTokenChange(tIdx, 'correctBucketId', e.target.value)}
                      className="text-xs bg-white text-indigo-700 font-bold border border-slate-200 rounded-lg px-2 py-1 outline-none"
                    >
                      {block.buckets.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => removeToken(tIdx)}
                      disabled={block.tokens.length <= 2}
                      className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* PREVIEW / STUDENT MODE */
          <div className="flex-1 flex flex-col space-y-4">
            {(() => {
              const unassignedTokens = block.tokens.filter(
                (tok) => !studentAnswers[tok.id]
              );

              return (
                <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/90">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold text-slate-700">
                      Fichas por ubicar ({unassignedTokens.length}):
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      Haz clic en una ficha y luego en un contenedor
                    </span>
                  </div>

                  {unassignedTokens.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2 text-center">
                      ¡Todas las fichas han sido ubicadas en sus contenedores!
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {unassignedTokens.map((tok) => {
                        const isSelected = selectedTokenId === tok.id;
                        return (
                          <button
                            key={tok.id}
                            disabled={evaluation.isSubmitted}
                            onClick={() => setSelectedTokenId(isSelected ? null : tok.id)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all transform active:scale-95 ${
                              isSelected
                                ? 'bg-indigo-600 text-white ring-2 ring-indigo-200 scale-105'
                                : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300'
                            }`}
                          >
                            {tok.text}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Buckets Grid */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3.5 min-h-[180px]">
              {block.buckets.map((bucket) => {
                const assignedTokens = block.tokens.filter(
                  (tok) => studentAnswers[tok.id] === bucket.id
                );

                return (
                  <div
                    key={bucket.id}
                    onClick={() => {
                      if (selectedTokenId) {
                        assignTokenToBucket(selectedTokenId, bucket.id);
                      }
                    }}
                    className={`rounded-2xl border p-3.5 flex flex-col transition-all cursor-pointer ${
                      selectedTokenId
                        ? 'border-indigo-400 bg-indigo-50/30 hover:bg-indigo-50/60 ring-2 ring-indigo-200/50'
                        : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                    }`}
                    style={{ borderTopColor: bucket.color || '#4f46e5', borderTopWidth: '4px' }}
                  >
                    {/* Bucket Title */}
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-black tracking-wider text-slate-800 uppercase">
                        {bucket.label}
                      </h4>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 font-bold shadow-2xs">
                        {assignedTokens.length}
                      </span>
                    </div>

                    {/* Assigned tokens inside bucket */}
                    <div className="flex-1 space-y-1.5 overflow-y-auto">
                      {assignedTokens.map((tok) => {
                        const isEvaluated = evaluation.isSubmitted;
                        const isCorrect = tok.correctBucketId === bucket.id;

                        let tokenStyle = 'bg-white border-slate-200 text-slate-800 shadow-2xs';
                        if (isEvaluated) {
                          tokenStyle = isCorrect
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-semibold'
                            : 'bg-rose-50 border-rose-400 text-rose-900 font-semibold';
                        }

                        return (
                          <div
                            key={tok.id}
                            className={`p-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-between ${tokenStyle}`}
                          >
                            <span>{tok.text}</span>

                            <div className="flex items-center gap-1">
                              {isEvaluated ? (
                                isCorrect ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-rose-600" />
                                )
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    assignTokenToBucket(tok.id, null);
                                  }}
                                  className="text-slate-400 hover:text-rose-600 p-0.5 text-xs font-bold"
                                  title="Devolver a la bandeja"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {assignedTokens.length === 0 && (
                        <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-2 text-center min-h-[70px]">
                          <span className="text-xs text-slate-400 font-medium">
                            {selectedTokenId ? 'Toca para soltar' : 'Arrastra o toca aquí'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
