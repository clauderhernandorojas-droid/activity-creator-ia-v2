import React from 'react';
import type { ReferenceTextBlock } from '../../types/schema';

interface Props {
  block: ReferenceTextBlock;
  isEditMode?: boolean;
  onChange?: (updated: ReferenceTextBlock) => void;
}

export const TextReferenceRenderer: React.FC<Props> = ({
  block,
  isEditMode = false,
  onChange,
}) => {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 h-full flex flex-col shadow-xs">
      {/* Title */}
      {isEditMode ? (
        <input
          type="text"
          value={block.title || ''}
          placeholder="Título de la lectura o contexto..."
          onChange={(e) => onChange?.({ ...block, title: e.target.value })}
          className="text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 mb-3 outline-none focus:border-indigo-500 focus:bg-white transition"
        />
      ) : (
        block.title && (
          <h3 className="text-base font-bold text-slate-900 mb-2.5">
            {block.title}
          </h3>
        )
      )}

      {/* Text Body */}
      <div className="flex-1 overflow-y-auto">
        {isEditMode ? (
          <textarea
            value={block.content}
            onChange={(e) => onChange?.({ ...block, content: e.target.value })}
            placeholder="Escribe el pasaje de lectura o explicación..."
            rows={7}
            className="w-full h-full text-sm leading-relaxed text-slate-700 bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 outline-none focus:border-indigo-500 focus:bg-white resize-none"
          />
        ) : (
          <div className="text-sm leading-relaxed text-slate-700 space-y-3 whitespace-pre-line">
            {block.content}
          </div>
        )}
      </div>
    </div>
  );
};
