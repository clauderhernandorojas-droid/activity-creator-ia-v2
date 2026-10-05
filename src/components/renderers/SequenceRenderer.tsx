import React from 'react';
import type { SequenceBlock, SequenceItem } from '../../types/schema';
import type { SessionEvaluation } from '../../store/useSessionStore';
import { Plus, Trash2, ChevronUp, ChevronDown, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  block: SequenceBlock;
  studentAnswers: Record<string, any>;
  evaluation: SessionEvaluation;
  isEditMode?: boolean;
  onAnswerChange?: (key: string, value: any) => void;
  onChange?: (updated: SequenceBlock) => void;
}

export const SequenceRenderer: React.FC<Props> = ({
  block,
  studentAnswers,
  evaluation,
  isEditMode = false,
  onAnswerChange,
  onChange,
}) => {
  const userOrder: string[] =
    Array.isArray(studentAnswers['sequence_order']) &&
    studentAnswers['sequence_order'].length === block.items.length
      ? (studentAnswers['sequence_order'] as string[])
      : block.items.map((it) => it.id);

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (evaluation.isSubmitted) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= userOrder.length) return;

    const newOrder = [...userOrder];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);

    onAnswerChange?.('sequence_order', newOrder);
  };

  const handleItemChange = (index: number, field: keyof SequenceItem, val: any) => {
    if (!onChange) return;
    const updated = [...block.items];
    updated[index] = { ...updated[index], [field]: val };
    onChange({ ...block, items: updated });
  };

  const addItem = () => {
    if (!onChange) return;
    const nextOrder = block.items.length + 1;
    const newItem: SequenceItem = {
      id: `seq-${Date.now()}`,
      text: 'Nueva frase o línea de diálogo...',
      correctOrder: nextOrder,
      speaker: 'Speaker',
    };
    onChange({ ...block, items: [...block.items, newItem] });
  };

  const removeItem = (index: number) => {
    if (!onChange || block.items.length <= 2) return;
    const updated = block.items.filter((_, idx) => idx !== index);
    onChange({ ...block, items: updated });
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
          <button
            onClick={addItem}
            className="text-xs flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Frase / Turno</span>
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="w-full space-y-3">
        {isEditMode ? (
          /* EDIT MODE */
          <div className="space-y-2.5">
            {block.items.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200"
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-500">#{item.correctOrder}</span>
                </div>

                <input
                  type="text"
                  value={item.speaker || ''}
                  placeholder="Hablante..."
                  onChange={(e) => handleItemChange(idx, 'speaker', e.target.value)}
                  className="w-24 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
                />

                <input
                  type="text"
                  value={item.text}
                  placeholder="Texto de la frase u oración..."
                  onChange={(e) => handleItemChange(idx, 'text', e.target.value)}
                  className="flex-1 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-500 font-medium"
                />

                <button
                  onClick={() => removeItem(idx)}
                  disabled={block.items.length <= 2}
                  className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* PREVIEW / STUDENT MODE */
          <div className="space-y-2.5">
            {userOrder.map((itemId, positionIdx) => {
              const item = block.items.find((it) => it.id === itemId);
              if (!item) return null;

              const isEvaluated = evaluation.isSubmitted;
              const isCorrectPosition = evaluation.details[`pos-${positionIdx}`];

              let cardStyle = 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs';
              if (isEvaluated) {
                cardStyle = isCorrectPosition
                  ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-medium'
                  : 'bg-rose-50/80 border-rose-400 text-rose-950 font-medium';
              }

              return (
                <div
                  key={itemId}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${cardStyle}`}
                >
                  {/* Position Badge & Speaker */}
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                      {positionIdx + 1}
                    </span>

                    <div className="space-y-0.5">
                      {item.speaker && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                          {item.speaker}
                        </span>
                      )}
                      <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                        {item.text}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div className="flex items-center gap-1.5">
                    {isEvaluated ? (
                      isCorrectPosition ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-rose-700 font-semibold">
                          <XCircle className="w-5 h-5 text-rose-600" />
                          <span>(Era #{item.correctOrder})</span>
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          disabled={positionIdx === 0}
                          onClick={() => moveItem(positionIdx, 'up')}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 disabled:opacity-20 transition"
                          title="Subir posición"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          disabled={positionIdx === userOrder.length - 1}
                          onClick={() => moveItem(positionIdx, 'down')}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 disabled:opacity-20 transition"
                          title="Bajar posición"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
