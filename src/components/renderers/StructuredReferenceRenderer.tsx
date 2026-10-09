import React, { useState } from 'react';
import type { StructuredReferenceBlock } from '../../types/schema';
import { Plus, Trash2, BookOpen, Layers } from 'lucide-react';
import { renderFormattedMarkdown } from '../../core/text/markdownRenderer';

interface Props {
  block: StructuredReferenceBlock;
  isEditMode?: boolean;
  slideTitle?: string;
  onChange?: (updated: StructuredReferenceBlock) => void;
  onRemove?: () => void;
}

export const StructuredReferenceRenderer: React.FC<Props> = ({
  block,
  isEditMode = false,
  slideTitle,
  onChange,
}) => {
  const [newColHeader, setNewColHeader] = useState('');

  const columns = Array.isArray(block.columns) ? block.columns : [];

  const handleTitleChange = (newTitle: string) => {
    onChange?.({ ...block, title: newTitle });
  };

  const handleHeaderChange = (colIndex: number, newHeader: string) => {
    if (!onChange) return;
    const nextCols = columns.map((col, idx) =>
      idx === colIndex ? { ...col, header: newHeader } : col
    );
    onChange({ ...block, columns: nextCols });
  };

  const handleItemChange = (colIndex: number, itemIndex: number, newItemText: string) => {
    if (!onChange) return;
    const nextCols = columns.map((col, cIdx) => {
      if (cIdx !== colIndex) return col;
      const nextItems = [...col.items];
      nextItems[itemIndex] = newItemText;
      return { ...col, items: nextItems };
    });
    onChange({ ...block, columns: nextCols });
  };

  const handleAddItem = (colIndex: number) => {
    if (!onChange) return;
    const nextCols = columns.map((col, cIdx) => {
      if (cIdx !== colIndex) return col;
      return { ...col, items: [...col.items, 'Nuevo elemento'] };
    });
    onChange({ ...block, columns: nextCols });
  };

  const handleDeleteItem = (colIndex: number, itemIndex: number) => {
    if (!onChange) return;
    const nextCols = columns.map((col, cIdx) => {
      if (cIdx !== colIndex) return col;
      return {
        ...col,
        items: col.items.filter((_, iIdx) => iIdx !== itemIndex),
      };
    });
    onChange({ ...block, columns: nextCols });
  };

  const handleAddColumn = () => {
    if (!onChange) return;
    const headerTitle = newColHeader.trim() || `Columna ${columns.length + 1}`;
    const nextCols = [...columns, { header: headerTitle, items: ['Ejemplo'] }];
    setNewColHeader('');
    onChange({ ...block, columns: nextCols });
  };

  const handleDeleteColumn = (colIndex: number) => {
    if (!onChange || columns.length <= 1) return;
    const nextCols = columns.filter((_, idx) => idx !== colIndex);
    onChange({ ...block, columns: nextCols });
  };

  const showTitle = Boolean(
    block.title && (!slideTitle || block.title.trim().toLowerCase() !== slideTitle.trim().toLowerCase())
  );

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 h-full flex flex-col shadow-xs overflow-hidden">
      {/* Header with Title and Query Badge */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0 shadow-2xs">
            <BookOpen className="w-4 h-4" />
          </div>
          {isEditMode ? (
            <input
              type="text"
              value={block.title || ''}
              placeholder="Título del cuadro de vocabulario / referencia..."
              onChange={(e) => handleTitleChange(e.target.value)}
              className="flex-1 text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          ) : (
            showTitle && (
              <h3 className="text-base font-bold text-slate-900 truncate">
                {block.title}
              </h3>
            )
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50/80 border border-indigo-200/80 px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs">
            <Layers className="w-3 h-3 text-indigo-600" />
            <span>Material de Consulta</span>
          </span>

          {isEditMode && (
            <button
              type="button"
              onClick={handleAddColumn}
              className="text-xs flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition cursor-pointer"
              title="Añadir columna de referencia"
            >
              <Plus className="w-3 h-3" />
              <span>Columna</span>
            </button>
          )}
        </div>
      </div>

      {/* Structured Content Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {columns.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 text-center text-slate-400 text-xs">
            <p>No hay columnas registradas en esta referencia estructurada.</p>
            {isEditMode && (
              <button
                type="button"
                onClick={handleAddColumn}
                className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800"
              >
                + Añadir primera columna
              </button>
            )}
          </div>
        ) : (
          <div
            className={`grid gap-3.5 ${
              columns.length === 1
                ? 'grid-cols-1'
                : columns.length === 2
                ? 'grid-cols-1 sm:grid-cols-2'
                : columns.length === 3
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
                : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
            }`}
          >
            {columns.map((col, colIdx) => (
              <div
                key={colIdx}
                className="flex flex-col bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 shadow-2xs group transition hover:border-slate-300"
              >
                {/* Column Header Card */}
                <div className="flex items-center justify-between gap-1.5 pb-2.5 mb-2.5 border-b border-slate-200/70">
                  {isEditMode ? (
                    <input
                      type="text"
                      value={col.header}
                      onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                      placeholder="Encabezado..."
                      className="flex-1 font-bold text-xs text-indigo-900 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
                    />
                  ) : (
                    <span className="inline-block text-xs font-bold tracking-wide text-indigo-950 bg-indigo-100/60 border border-indigo-200/60 px-2.5 py-1 rounded-lg">
                      {renderFormattedMarkdown(col.header)}
                    </span>
                  )}

                  {isEditMode && columns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteColumn(colIdx)}
                      className="text-slate-300 hover:text-rose-600 p-1 rounded transition cursor-pointer"
                      title="Eliminar columna"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Column Items List */}
                <ul className="space-y-1.5 flex-1">
                  {col.items.map((item, itemIdx) => (
                    <li
                      key={itemIdx}
                      className="flex items-center gap-1.5 bg-white border border-slate-200/90 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 shadow-2xs hover:border-slate-300 transition"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      {isEditMode ? (
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => handleItemChange(colIdx, itemIdx, e.target.value)}
                          className="flex-1 text-xs text-slate-800 bg-transparent border-b border-transparent focus:border-indigo-400 outline-none py-0.5"
                        />
                      ) : (
                        <span className="flex-1 font-medium leading-relaxed select-text">
                          {renderFormattedMarkdown(item)}
                        </span>
                      )}

                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(colIdx, itemIdx)}
                          className="text-slate-300 hover:text-rose-600 p-0.5 rounded transition cursor-pointer"
                          title="Eliminar elemento"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                {/* Add Item Button in Edit Mode */}
                {isEditMode && (
                  <button
                    type="button"
                    onClick={() => handleAddItem(colIdx)}
                    className="mt-2.5 w-full py-1 px-2 border border-dashed border-indigo-200 hover:border-indigo-400 rounded-lg text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1 transition bg-white/60 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Añadir elemento</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Optional Footnote / Caption */}
      {block.caption && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 italic">
          {block.caption}
        </div>
      )}
    </div>
  );
};
