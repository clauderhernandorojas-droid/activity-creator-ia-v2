import React from 'react';
import type { ReferenceTableBlock } from '../../types/schema';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  block: ReferenceTableBlock;
  isEditMode?: boolean;
  onChange?: (updated: ReferenceTableBlock) => void;
}

export const TableReferenceRenderer: React.FC<Props> = ({
  block,
  isEditMode = false,
  onChange,
}) => {
  const handleHeaderChange = (index: number, value: string) => {
    if (!onChange) return;
    const newHeaders = [...block.headers];
    newHeaders[index] = value;
    onChange({ ...block, headers: newHeaders });
  };

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    if (!onChange) return;
    const newRows = block.rows.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        const newRow = [...row];
        newRow[colIndex] = value;
        return newRow;
      }
      return row;
    });
    onChange({ ...block, rows: newRows });
  };

  const addRow = () => {
    if (!onChange) return;
    const newRow = new Array(block.headers.length).fill('');
    onChange({ ...block, rows: [...block.rows, newRow] });
  };

  const removeRow = (rowIndex: number) => {
    if (!onChange || block.rows.length <= 1) return;
    onChange({
      ...block,
      rows: block.rows.filter((_, idx) => idx !== rowIndex),
    });
  };

  const addColumn = () => {
    if (!onChange) return;
    const newHeaders = [...block.headers, `Col ${block.headers.length + 1}`];
    const newRows = block.rows.map((row) => [...row, '']);
    onChange({ ...block, headers: newHeaders, rows: newRows });
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 h-full flex flex-col shadow-xs">
      {/* Title & Column/Row Controls */}
      <div className="flex items-center justify-between gap-3 mb-3.5 pb-2.5 border-b border-slate-100">
        {isEditMode ? (
          <input
            type="text"
            value={block.title || ''}
            placeholder="Título del cuadro gramatical..."
            onChange={(e) => onChange?.({ ...block, title: e.target.value })}
            className="flex-1 text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500 focus:bg-white transition"
          />
        ) : (
          block.title && (
            <h3 className="text-base font-bold text-slate-900">
              {block.title}
            </h3>
          )
        )}

        {isEditMode && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={addColumn}
              className="text-xs flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-200 transition"
              title="Añadir columna"
            >
              <Plus className="w-3 h-3" />
              <span>Columna</span>
            </button>
            <button
              onClick={addRow}
              className="text-xs flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition"
              title="Añadir fila"
            >
              <Plus className="w-3 h-3" />
              <span>Fila</span>
            </button>
          </div>
        )}
      </div>

      {/* Proportional Table Layout Container */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs border-collapse table-auto">
          <thead>
            <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
              {block.headers.map((header, colIdx) => {
                const isLastColumn = colIdx === block.headers.length - 1;
                return (
                  <th
                    key={colIdx}
                    className={`p-2.5 font-bold uppercase tracking-wider text-[11px] ${
                      isLastColumn ? 'w-auto' : 'w-px whitespace-nowrap'
                    }`}
                  >
                    {isEditMode ? (
                      <input
                        type="text"
                        value={header}
                        onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                        className="bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 outline-none focus:border-indigo-500 text-[11px] font-bold min-w-[70px]"
                      />
                    ) : (
                      <span>{header}</span>
                    )}
                  </th>
                );
              })}
              {isEditMode && <th className="w-8 p-1 text-center"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {block.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-slate-50/60 transition-colors">
                {row.map((cell, colIdx) => {
                  const isLastColumn = colIdx === row.length - 1;
                  return (
                    <td
                      key={colIdx}
                      className={`p-2.5 ${
                        isLastColumn ? 'w-auto' : 'w-px whitespace-nowrap'
                      }`}
                    >
                      {isEditMode ? (
                        <input
                          type="text"
                          value={cell}
                          onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                          className="bg-slate-50 border border-slate-200/80 rounded px-2.5 py-1 text-slate-900 outline-none focus:border-indigo-500 focus:bg-white text-xs min-w-[65px]"
                        />
                      ) : (
                        <span
                          className={
                            cell === '—'
                              ? 'text-slate-400 font-mono font-bold'
                              : 'font-medium'
                          }
                        >
                          {cell}
                        </span>
                      )}
                    </td>
                  );
                })}
                {isEditMode && (
                  <td className="p-1 text-center w-8">
                    <button
                      onClick={() => removeRow(rowIdx)}
                      disabled={block.rows.length <= 1}
                      className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-20 rounded"
                      title="Eliminar fila"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Caption / Rule Note */}
      {isEditMode ? (
        <input
          type="text"
          value={block.caption || ''}
          placeholder="Regla pedagógica (ej. When 'Who' is subject, do not use 'did')..."
          onChange={(e) => onChange?.({ ...block, caption: e.target.value })}
          className="mt-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500 focus:bg-white"
        />
      ) : (
        block.caption && (
          <p className="mt-3 text-xs text-slate-700 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/80 font-medium">
            💡 {block.caption}
          </p>
        )
      )}
    </div>
  );
};
