import React from 'react';
import type { InputFieldsBlock, InputFieldListItem, InputFieldTableCell } from '../../types/schema';
import type { SessionEvaluation } from '../../store/useSessionStore';
import { Plus, Trash2, CheckCircle2, XCircle, HelpCircle, AlertCircle, Sparkles } from 'lucide-react';

interface Props {
  block: InputFieldsBlock;
  studentAnswers: Record<string, any>;
  evaluation: SessionEvaluation;
  isEditMode?: boolean;
  onAnswerChange?: (key: string, value: string) => void;
  onChange?: (updated: InputFieldsBlock) => void;
}

interface ParsedMatchingPrompt {
  isMatching: boolean;
  itemNumber: string;
  clue: string;
}

const parseMatchingPrompt = (
  rawPrompt: string,
  fallbackIdx: number,
  hasWordBank = false,
  fallbackClue?: string
): ParsedMatchingPrompt => {
  const trimmed = (rawPrompt || '').trim();

  // Pattern 1: e.g. "2. _______ : a time", "2) _______ : a time", "2. : a time", "_______ : a time", ": a time"
  const colonMatch = trimmed.match(/^(?:(\d+)[.)]\s*)?(?:_+|\.{3,}|—+)?\s*:\s*(.+)$/);
  if (colonMatch && colonMatch[2].trim()) {
    return {
      isMatching: true,
      itemNumber: colonMatch[1] || String(fallbackIdx + 1),
      clue: colonMatch[2].trim(),
    };
  }

  // Pattern 2: e.g. "2. _______ - a time", "2. — a time", "2. -> a time"
  const dashMatch = trimmed.match(/^(?:(\d+)[.)]\s*)?(?:_+|\.{3,}|—+)?\s*(?:[-—–]|->|=>)\s*(.+)$/);
  if (dashMatch && dashMatch[2].trim()) {
    return {
      isMatching: true,
      itemNumber: dashMatch[1] || String(fallbackIdx + 1),
      clue: dashMatch[2].trim(),
    };
  }

  // Pattern 3: e.g. "2. _______ a time" (missing colon/dash but blank at start)
  const blankMatch = trimmed.match(/^(?:(\d+)[.)]\s*)?(?:_+|\.{3,}|—+)\s*(.+)$/);
  if (blankMatch && blankMatch[2].trim() && (hasWordBank || blankMatch[2].length < 80)) {
    return {
      isMatching: true,
      itemNumber: blankMatch[1] || String(fallbackIdx + 1),
      clue: blankMatch[2].replace(/^:\s*/, '').trim(),
    };
  }

  // Pattern 4: Number followed by definition/clue phrase: "2. a time", "2) a time"
  const numClueMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
  if (numClueMatch && numClueMatch[2].trim()) {
    const candidateClue = numClueMatch[2].trim();
    if ((hasWordBank || candidateClue.length < 80) && !candidateClue.includes('?')) {
      return {
        isMatching: true,
        itemNumber: numClueMatch[1],
        clue: candidateClue,
      };
    }
  }

  // Pattern 5: When hasWordBank is true and rawPrompt is just a definition phrase without number: "a time", "a person"
  if (hasWordBank && trimmed && !trimmed.includes('?') && trimmed.length < 80 && !trimmed.includes('___')) {
    return {
      isMatching: true,
      itemNumber: String(fallbackIdx + 1),
      clue: trimmed,
    };
  }

  // Pattern 6: If rawPrompt is just a number (e.g. "2" or "2.") but we have a fallback clue from hint/explanation
  const isPureNumber = /^(?:item\s*)?(\d+)[.)]?$/i.exec(trimmed);
  if (isPureNumber && fallbackClue && fallbackClue.trim()) {
    return {
      isMatching: true,
      itemNumber: isPureNumber[1] || String(fallbackIdx + 1),
      clue: fallbackClue.trim(),
    };
  }

  return {
    isMatching: false,
    itemNumber: String(fallbackIdx + 1),
    clue: trimmed,
  };
};

export const InputFieldsRenderer: React.FC<Props> = ({
  block,
  studentAnswers,
  evaluation,
  isEditMode = false,
  onAnswerChange,
  onChange,
}) => {
  const isTableLayout = Boolean(
    Array.isArray(block.tableRows) &&
    block.tableRows.length > 0 &&
    (block.layoutMode === 'table' || !block.listItems || block.listItems.length === 0)
  );

  const hasWordBank = Boolean(
    block.wordBank && block.wordBank.filter((w) => typeof w === 'string' && w.trim().length > 0).length > 0
  );

  // Compute set of words currently used in answers or examples
  const usedWords = React.useMemo(() => {
    const set = new Set<string>();
    // Current input values from the student
    Object.values(studentAnswers || {}).forEach((val) => {
      if (typeof val === 'string' && val.trim()) {
        set.add(val.trim().toLowerCase());
      }
    });
    // Canonical values assigned to items with isExample: true
    block.listItems.forEach((item) => {
      if (item.isExample) {
        const canonical = item.expectedAnswer?.trim() || item.acceptedAnswers?.[0]?.trim();
        if (canonical) {
          set.add(canonical.toLowerCase());
        }
      }
    });
    // Canonical values assigned to table cells with isExample: true
    if (block.tableRows) {
      block.tableRows.forEach((row) => {
        row.forEach((cell) => {
          if (cell.isInput && cell.isExample) {
            const canonical = cell.expectedAnswer?.trim() || cell.acceptedAnswers?.[0]?.trim();
            if (canonical) {
              set.add(canonical.toLowerCase());
            }
          }
        });
      });
    }
    return set;
  }, [studentAnswers, block.listItems, block.tableRows]);

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
      prompt: `${block.listItems.length + 1}. _______ : new definition or prompt...`,
      prefix: '',
      expectedAnswer: 'correct answer',
      acceptedAnswers: ['correct answer'],
      hint: 'Grammar tip or clue',
      isExample: false,
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

  /* Table Management Handlers */
  const handleTableHeaderChange = (colIdx: number, val: string) => {
    if (!onChange) return;
    const updated = [...block.tableHeaders];
    updated[colIdx] = val;
    onChange({ ...block, tableHeaders: updated });
  };

  const handleTableCellChange = (
    rowIdx: number,
    colIdx: number,
    updates: Partial<InputFieldTableCell>
  ) => {
    if (!onChange) return;
    const updatedRows = block.tableRows.map((r, rI) => {
      if (rI !== rowIdx) return r;
      return r.map((c, cI) => {
        if (cI !== colIdx) return c;
        return { ...c, ...updates };
      });
    });
    onChange({ ...block, tableRows: updatedRows });
  };

  const addTableRow = () => {
    if (!onChange) return;
    const colCount = Math.max(block.tableHeaders.length, block.tableRows[0]?.length || 2);
    const newRow: InputFieldTableCell[] = Array.from({ length: colCount }).map((_, cIdx) => ({
      text: '',
      isInput: cIdx > 0,
      inputId: `cell-${block.tableRows.length}-${cIdx}`,
      acceptedAnswers: [],
      expectedAnswer: '',
      isExample: false,
    }));
    onChange({ ...block, tableRows: [...block.tableRows, newRow] });
  };

  const removeTableRow = (rowIdx: number) => {
    if (!onChange || block.tableRows.length <= 1) return;
    const updatedRows = block.tableRows.filter((_, idx) => idx !== rowIdx);
    onChange({ ...block, tableRows: updatedRows });
  };

  const addTableColumn = () => {
    if (!onChange) return;
    const newHeader = `Col ${block.tableHeaders.length + 1}`;
    const updatedHeaders = [...block.tableHeaders, newHeader];
    const newColIdx = block.tableHeaders.length;
    const updatedRows = block.tableRows.map((r, rIdx) => [
      ...r,
      {
        text: '',
        isInput: true,
        inputId: `cell-${rIdx}-${newColIdx}`,
        acceptedAnswers: [],
        expectedAnswer: '',
        isExample: false,
      },
    ]);
    onChange({ ...block, tableHeaders: updatedHeaders, tableRows: updatedRows });
  };

  const removeTableColumn = (colIdx: number) => {
    if (!onChange || block.tableHeaders.length <= 1) return;
    const updatedHeaders = block.tableHeaders.filter((_, idx) => idx !== colIdx);
    const updatedRows = block.tableRows.map((r) => r.filter((_, idx) => idx !== colIdx));
    onChange({ ...block, tableHeaders: updatedHeaders, tableRows: updatedRows });
  };

  return (
    <div className="w-full flex flex-col">
      {/* Pedagogical Instruction */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        {isEditMode ? (
          <input
            type="text"
            value={block.instruction}
            placeholder="Instrucción de la actividad (ej. Complete the table with the question words)..."
            onChange={(e) => onChange?.({ ...block, instruction: e.target.value })}
            className="flex-1 text-base font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 outline-none focus:border-indigo-500 focus:bg-white"
          />
        ) : (
          <p className="text-base sm:text-lg font-bold text-slate-800 leading-snug">
            {block.instruction}
          </p>
        )}

        {isEditMode && (
          isTableLayout ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={addTableColumn}
                className="text-xs flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
                title="Añadir columna a la tabla"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Columna</span>
              </button>
              <button
                onClick={addTableRow}
                className="text-xs flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition cursor-pointer"
                title="Añadir fila a la tabla"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Fila</span>
              </button>
            </div>
          ) : (
            <button
              onClick={addListItem}
              className="text-xs flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Pregunta</span>
            </button>
          )
        )}
      </div>

      {/* Word Bank: Editor in Edit Mode or Stylized Badge Bar in View Mode */}
      {isEditMode ? (
        <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Word Bank / Caja de palabras (opcional):
            </span>
            <span className="text-[11px] text-slate-400">Separadas por comas</span>
          </div>
          <input
            type="text"
            value={block.wordBank?.join(', ') || ''}
            placeholder="ej. Who, Where, When, Why, What, Which, How"
            onChange={(e) => {
              const words = e.target.value.split(',').map((w) => w.trim()).filter(Boolean);
              onChange?.({ ...block, wordBank: words.length > 0 ? words : undefined });
            }}
            className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 font-semibold text-slate-800"
          />
        </div>
      ) : (
        hasWordBank && (
          <div className="mb-5 bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 shadow-xs">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                Word Bank / Opciones disponibles
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {block.wordBank!
                .filter((w) => typeof w === 'string' && w.trim().length > 0)
                .map((word, wIdx) => {
                  const isUsed = usedWords.has(word.trim().toLowerCase());
                  return (
                    <span
                      key={`${word}-${wIdx}`}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        isUsed
                          ? 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60 select-none'
                          : 'bg-white text-indigo-900 border-indigo-200 shadow-2xs hover:border-indigo-300'
                      }`}
                    >
                      {word}
                    </span>
                  );
                })}
            </div>
          </div>
        )
      )}

      {/* Table vs List Mode Rendering */}
      {isTableLayout ? (
        /* ============================================================== */
        /* 2D TABLE / GRID INTERACTION                                   */
        /* ============================================================== */
        isEditMode ? (
          /* TABLE EDIT MODE */
          <div className="w-full space-y-3">
            <div className="w-full overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm p-3">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {block.tableHeaders.map((header, hIdx) => (
                      <th key={hIdx} className="p-2 border-r border-slate-200 last:border-r-0 min-w-[150px]">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={header}
                            onChange={(e) => handleTableHeaderChange(hIdx, e.target.value)}
                            placeholder={`Columna ${hIdx + 1}`}
                            className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500"
                          />
                          {block.tableHeaders.length > 1 && (
                            <button
                              onClick={() => removeTableColumn(hIdx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                              title="Eliminar columna"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="w-12 p-2 text-center text-xs font-bold text-slate-400">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {block.tableRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/40">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2 border-r border-slate-100 last:border-r-0 align-top min-w-[150px]">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={cell.isInput}
                                  onChange={(e) => handleTableCellChange(rIdx, cIdx, { isInput: e.target.checked })}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                                />
                                <span>{cell.isInput ? 'Editable' : 'Fijo'}</span>
                              </label>

                              {cell.isInput && (
                                <label className="text-[10px] font-semibold text-amber-700 flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(cell.isExample)}
                                    onChange={(e) => handleTableCellChange(rIdx, cIdx, { isExample: e.target.checked })}
                                    className="rounded text-amber-600 focus:ring-amber-500 w-3 h-3"
                                  />
                                  <span>Muestra</span>
                                </label>
                              )}
                            </div>

                            {!cell.isInput ? (
                              <input
                                type="text"
                                value={cell.text}
                                onChange={(e) => handleTableCellChange(rIdx, cIdx, { text: e.target.value })}
                                placeholder="Texto de guía..."
                                className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 font-medium"
                              />
                            ) : (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={cell.expectedAnswer || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const accepted = cell.acceptedAnswers.includes(val)
                                      ? cell.acceptedAnswers
                                      : [val, ...cell.acceptedAnswers.filter(Boolean)];
                                    handleTableCellChange(rIdx, cIdx, { expectedAnswer: val, acceptedAnswers: accepted });
                                  }}
                                  placeholder="Respuesta canónica..."
                                  className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500"
                                />
                                <input
                                  type="text"
                                  value={cell.acceptedAnswers.join(', ')}
                                  onChange={(e) => {
                                    const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                                    handleTableCellChange(rIdx, cIdx, { acceptedAnswers: list });
                                  }}
                                  placeholder="Variantes (comas)..."
                                  className="w-full text-[10px] text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      ))}
                      <td className="p-2 text-center align-middle">
                        {block.tableRows.length > 1 && (
                          <button
                            onClick={() => removeTableRow(rIdx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                            title="Eliminar fila"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* TABLE STUDENT / PREVIEW MODE */
          <div className="w-full overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
            <table className="w-full text-left border-collapse">
              {block.tableHeaders.length > 0 && (
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {block.tableHeaders.map((header, hIdx) => (
                      <th
                        key={hIdx}
                        className="px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider border-r border-slate-200 last:border-r-0"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="divide-y divide-slate-100">
                {block.tableRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/50 transition-colors">
                    {row.map((cell, cIdx) => {
                      const cellKey = cell.inputId || `cell-${rIdx}-${cIdx}`;
                      const isEvaluated = evaluation.isSubmitted;
                      const isGraded = evaluation.isGraded !== false;
                      const isCorrect = isGraded ? (Boolean(evaluation.details[cellKey]) || Boolean(cell.isExample)) : true;
                      const cellFeedback = evaluation.itemFeedback?.[cellKey];
                      const isTypoWarning = isCorrect && cellFeedback?.status === 'correct_with_typo';
                      const userVal = studentAnswers[cellKey] || '';
                      const canonicalAnswer =
                        cellFeedback?.canonicalAnswer?.trim() ||
                        cellFeedback?.expectedAnswer?.trim() ||
                        cell.expectedAnswer?.trim() ||
                        cell.acceptedAnswers?.[0]?.trim() ||
                        '';
                      const explanationOrHint =
                        cellFeedback?.feedback?.trim() ||
                        cellFeedback?.explanation?.trim() ||
                        cell.hint?.trim() ||
                        '';

                      return (
                        <td
                          key={cIdx}
                          className="px-4 py-3 text-sm border-r border-slate-100 last:border-r-0 align-middle"
                        >
                          {!cell.isInput ? (
                            <span className="font-medium text-slate-800 leading-relaxed">
                              {cell.text}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1 min-w-[130px]">
                              <div className="relative flex items-center">
                                <input
                                  type="text"
                                  value={cell.isExample ? (cell.expectedAnswer || userVal) : userVal}
                                  disabled={isEvaluated || cell.isExample}
                                  placeholder={cell.isExample ? '' : '...'}
                                  onChange={(e) => onAnswerChange?.(cellKey, e.target.value)}
                                  className={`w-full text-sm rounded-lg px-3 py-1.5 outline-none font-semibold transition ${
                                    cell.isExample
                                      ? 'bg-slate-100 text-slate-800 border border-slate-300 font-bold select-none cursor-not-allowed shadow-2xs pr-16'
                                      : isEvaluated
                                        ? !isGraded
                                          ? 'bg-indigo-50/40 text-slate-900 border border-indigo-300 font-semibold pr-7 shadow-xs'
                                          : isCorrect
                                            ? isTypoWarning
                                              ? 'bg-white text-amber-950 border border-amber-400 font-bold pr-7 shadow-xs'
                                              : 'bg-white text-emerald-950 border border-emerald-400 font-bold pr-7 shadow-xs'
                                            : 'bg-white text-rose-950 border border-rose-400 font-bold pr-7 shadow-xs'
                                        : 'bg-white text-slate-900 border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs'
                                  }`}
                                />

                                {cell.isExample && (
                                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 border border-slate-300 select-none">
                                    ✓ Ejemplo
                                  </span>
                                )}

                                {isEvaluated && !cell.isExample && (
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2">
                                    {!isGraded ? (
                                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                                    ) : isCorrect ? (
                                      isTypoWarning ? (
                                        <AlertCircle className="w-4 h-4 text-amber-600" />
                                      ) : (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                      )
                                    ) : (
                                      <XCircle className="w-4 h-4 text-rose-600" />
                                    )}
                                  </span>
                                )}
                              </div>

                              {/* Feedback in Table Cell */}
                              {!cell.isExample && isEvaluated && isGraded && !isCorrect && (
                                <div className="text-[11px] text-rose-900 font-medium bg-rose-50/90 px-2 py-1 rounded-lg border border-rose-200 flex flex-col gap-0.5 shadow-2xs">
                                  <span>
                                    Respuesta: <strong className="font-bold underline text-rose-950">{canonicalAnswer}</strong>
                                  </span>
                                  {explanationOrHint && (
                                    <span className="text-[10px] text-slate-600">💡 {explanationOrHint}</span>
                                  )}
                                </div>
                              )}

                              {!cell.isExample && isEvaluated && isCorrect && isTypoWarning && (
                                <div className="text-[11px] text-amber-900 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  Ortografía: <strong className="underline text-amber-950">{canonicalAnswer}</strong>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Questions list */
        <div className="w-full space-y-4">
        {block.listItems.map((item, idx) => {
          const isEvaluated = evaluation.isSubmitted;
          const isGraded = evaluation.isGraded !== false;
          const isCorrect = isGraded ? (Boolean(evaluation.details[item.id]) || Boolean(item.isExample)) : true;
          const itemFeedback = evaluation.itemFeedback?.[item.id];
          const isTypoWarning = isCorrect && itemFeedback?.status === 'correct_with_typo';
          const userVal = studentAnswers[item.id] || '';

          // Canonical answer guaranteed never empty
          const canonicalAnswer =
            itemFeedback?.canonicalAnswer?.trim() ||
            itemFeedback?.expectedAnswer?.trim() ||
            item.expectedAnswer?.trim() ||
            item.acceptedAnswers[0]?.trim() ||
            'Respuesta según texto';

          const otherAccepted = item.acceptedAnswers
            .map((a) => a.trim())
            .filter((a) => a && a.toLowerCase() !== canonicalAnswer.toLowerCase());

          const explanationOrHint =
            itemFeedback?.feedback?.trim() ||
            itemFeedback?.explanation?.trim() ||
            item.explanation?.trim() ||
            item.hint?.trim();

          const parsedPrompt = parseMatchingPrompt(item.prompt, idx, hasWordBank, explanationOrHint);

          return (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition-all ${
                item.isExample
                  ? 'bg-slate-50/80 border-slate-200'
                  : isEvaluated
                    ? !isGraded
                      ? 'bg-indigo-50/40 border-indigo-200'
                      : isCorrect
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
                      placeholder="Oración o definición (ej. 2. _______ : a time)..."
                      onChange={(e) => handleListItemChange(idx, 'prompt', e.target.value)}
                      className="flex-1 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500"
                    />
                    <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-900 select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={Boolean(item.isExample)}
                        onChange={(e) => handleListItemChange(idx, 'isExample', e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Ejemplo</span>
                    </label>
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
                  {parsedPrompt.isMatching ? (
                    /* MATCHING / VOCABULARY ROW FORMAT */
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-slate-600 w-6 shrink-0 text-right">
                          {parsedPrompt.itemNumber}.
                        </span>
                        <div className="relative w-36 sm:w-44 shrink-0">
                          <input
                            type="text"
                            value={item.isExample ? (item.expectedAnswer || userVal) : userVal}
                            disabled={isEvaluated || item.isExample}
                            placeholder={item.isExample ? '' : 'Palabra...'}
                            onChange={(e) => onAnswerChange?.(item.id, e.target.value)}
                            className={`w-full text-sm rounded-xl px-3.5 py-2 outline-none font-semibold transition ${
                              item.isExample
                                ? 'bg-slate-100 text-slate-800 border border-slate-300 font-bold select-none cursor-not-allowed shadow-2xs'
                                : isEvaluated
                                  ? !isGraded
                                    ? 'bg-indigo-50/30 text-slate-900 border border-indigo-300 font-semibold pr-8 shadow-xs'
                                    : isCorrect
                                      ? isTypoWarning
                                        ? 'bg-white text-amber-950 border border-amber-400 font-bold pr-8 shadow-xs'
                                        : 'bg-white text-emerald-950 border border-emerald-400 font-bold pr-8 shadow-xs'
                                      : 'bg-white text-rose-950 border border-rose-400 font-bold pr-8 shadow-xs'
                                  : 'bg-white text-slate-900 border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs'
                            }`}
                          />

                          {isEvaluated && !item.isExample && (
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                              {!isGraded ? (
                                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                              ) : isCorrect ? (
                                isTypoWarning ? (
                                  <AlertCircle className="w-4 h-4 text-amber-600" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                )
                              ) : (
                                <XCircle className="w-4 h-4 text-rose-600" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-1 pl-8 sm:pl-0">
                        <span className="text-sm font-semibold text-slate-700">
                          {parsedPrompt.clue.startsWith(':') || parsedPrompt.clue.startsWith('-')
                            ? parsedPrompt.clue
                            : `: ${parsedPrompt.clue}`}
                        </span>

                        {item.isExample && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300 select-none">
                            ✓ Ejemplo
                          </span>
                        )}

                        {item.hint && !isEvaluated && !item.isExample && (
                          <span
                            title={`Pista: ${item.hint}`}
                            className="p-1 text-amber-600 hover:text-amber-700 cursor-help"
                          >
                            <HelpCircle className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* STANDARD SENTENCE / FILL-IN-BLANK FORMAT */
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                          {(() => {
                            const p = (item.prompt || '').trim();
                            const isPureNum = /^(?:item\s*)?\d+[.)]?$/i.test(p);
                            const fallback = explanationOrHint?.trim();
                            if (isPureNum && fallback) {
                              return `${p} ${fallback}`;
                            }
                            if (!p && fallback) {
                              return `${idx + 1}. ${fallback}`;
                            }
                            return p || `${idx + 1}.`;
                          })()}
                        </p>
                        {item.isExample && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300 select-none shrink-0">
                            ✓ Ejemplo
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5">
                        {item.prefix && (
                          <span className="text-sm font-bold text-slate-500">{item.prefix}</span>
                        )}

                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={item.isExample ? (item.expectedAnswer || userVal) : userVal}
                            disabled={isEvaluated || item.isExample}
                            placeholder={item.isExample ? '' : 'Escribe tu respuesta aquí...'}
                            onChange={(e) => onAnswerChange?.(item.id, e.target.value)}
                            className={`w-full text-sm rounded-xl px-4 py-2.5 outline-none font-medium transition ${
                              item.isExample
                                ? 'bg-slate-100 text-slate-800 border border-slate-300 font-bold select-none cursor-not-allowed shadow-2xs'
                                : isEvaluated
                                  ? isCorrect
                                    ? isTypoWarning
                                      ? 'bg-white text-amber-950 border border-amber-400 font-bold pr-10 shadow-xs'
                                      : 'bg-white text-emerald-950 border border-emerald-400 font-bold pr-10 shadow-xs'
                                    : 'bg-white text-rose-950 border border-rose-400 font-bold pr-10 shadow-xs'
                                  : 'bg-white text-slate-900 border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs'
                            }`}
                          />

                          {isEvaluated && !item.isExample && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2">
                              {!isGraded ? (
                                <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                              ) : isCorrect ? (
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

                        {item.hint && !isEvaluated && !item.isExample && (
                          <span
                            title={`Pista: ${item.hint}`}
                            className="p-1.5 text-amber-600 hover:text-amber-700 cursor-help"
                          >
                            <HelpCircle className="w-5 h-5" />
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {/* Pedagogical Feedback for Non-Example Items */}
                  {!item.isExample && (
                    <>
                      {isEvaluated && !isGraded && (
                        <div className="text-xs text-indigo-800 pt-1 flex items-center justify-between font-medium bg-indigo-50/70 p-2 rounded-lg border border-indigo-200">
                          <span className="flex items-center gap-1.5 text-[11px] text-indigo-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Respuesta personal registrada ✓</span>
                          </span>
                        </div>
                      )}

                      {isEvaluated && isGraded && isCorrect && isTypoWarning && (
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

                      {isEvaluated && isGraded && isCorrect && !isTypoWarning && (
                        <div className="text-xs text-emerald-800 pt-1 flex items-center justify-between font-medium">
                          <span className="text-[11px] text-emerald-700 font-semibold">✓ ¡Correcto!</span>
                          {explanationOrHint && (
                            <span className="text-slate-500 font-normal text-[11px]">💡 {explanationOrHint}</span>
                          )}
                        </div>
                      )}

                      {isEvaluated && isGraded && !isCorrect && (
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
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};
