import React, { useState, useEffect } from 'react';
import { useLessonStore } from '../store/useLessonStore';
import { useSessionStore } from '../store/useSessionStore';
import { 
  Sparkles, 
  UploadCloud, 
  Table, 
  FileText, 
  ListOrdered, 
  FolderGit2, 
  CheckSquare, 
  PenTool, 
  BookOpen, 
  Trash2, 
  Check, 
  X,
  RotateCcw,
  Plus,
  Layers,
  ChevronDown,
  Rocket,
  Download,
  ImageIcon
} from 'lucide-react';
import type { ExtractedBlock } from '../types/schema';
import type { ManualTemplateType } from '../core/ai/digitizeBook';
import { mapBlockToRole, type PedagogicalRole } from '../core/ai/payloadMapper';

export const OcrPanel: React.FC = () => {
  const {
    lesson,
    extractedBlocks,
    ocrProcessing,
    pastedImages,
    addPastedImage,
    removePastedImage,
    clearPastedImages,
    processPastedImages,
    removeExtractedBlock,
    updateExtractedBlock,
    restoreExtractedBlocks,
    addManualBlock,
    directAssignTemplate,
    assignExtractedBlock,
    createSlideFromBlock,
    addSlide,
    resetOcrState,
  } = useLessonStore();

  const {
    currentSlideId,
    setCurrentSlideId,
    setMode,
    isOcrDrawerOpen,
    setIsOcrDrawerOpen,
  } = useSessionStore();

  const [isDragging, setIsDragging] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(null);
  const [isManualMenuOpen, setIsManualMenuOpen] = useState(false);
  const [selectedRoleOverride, setSelectedRoleOverride] = useState<PedagogicalRole | null>(null);

  const currentSlideIndex = lesson.slides.findIndex((s) => s.id === currentSlideId);

  // Consolidated active block
  const activeBlock: ExtractedBlock | undefined = extractedBlocks[0];

  const handleUpdateTitle = (newTitle: string) => {
    if (!activeBlock) return;
    updateExtractedBlock(activeBlock.id, {
      parsedData: {
        ...activeBlock.parsedData,
        title: newTitle,
      },
    });
  };

  const handleUpdateInstruction = (newInstruction: string) => {
    if (!activeBlock) return;
    updateExtractedBlock(activeBlock.id, {
      parsedData: {
        ...activeBlock.parsedData,
        instruction: newInstruction,
      },
    });
  };

  const getBlockItems = (block: ExtractedBlock): string[] => {
    const pd = block.parsedData || {};
    if (Array.isArray(pd.items) && pd.items.length > 0) {
      return pd.items
        .map((it: any) => (typeof it === 'string' ? it : String(it.text || it.prompt || '')))
        .filter(Boolean);
    }
    if (Array.isArray(pd.tokens) && pd.tokens.length > 0) {
      return pd.tokens
        .map((t: any) => (typeof t === 'string' ? t : String(t.text || '')))
        .filter(Boolean);
    }
    if (block.rawText) {
      return block.rawText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => {
          if (!l) return false;
          if (pd.title && l.toLowerCase().includes(pd.title.toLowerCase())) return false;
          if (pd.instruction && l.toLowerCase().includes(pd.instruction.toLowerCase())) return false;
          if (/^(vocabulary:|exercise|\d+\s*[a-z]?\s*choose|select all|read and mark)/i.test(l)) return false;
          return true;
        });
    }
    return [];
  };

  const handleUpdateItem = (index: number, newText: string) => {
    if (!activeBlock) return;
    const currentItems = getBlockItems(activeBlock);
    const nextItems = [...currentItems];
    nextItems[index] = newText;

    const nextStructuredItems = Array.isArray(activeBlock.parsedData?.items)
      ? activeBlock.parsedData.items.map((it: any, i: number) => {
          if (i !== index) return it;
          return typeof it === 'object' && it !== null
            ? { ...it, text: newText, prompt: newText }
            : newText;
        })
      : nextItems;

    const nextTokens = Array.isArray(activeBlock.parsedData?.tokens)
      ? activeBlock.parsedData.tokens.map((t: any, i: number) =>
          i === index ? (typeof t === 'object' ? { ...t, text: newText } : newText) : t
        )
      : undefined;

    const newRawText = [
      activeBlock.parsedData?.title || '',
      activeBlock.parsedData?.instruction || '',
      ...nextItems,
    ]
      .filter(Boolean)
      .join('\n');

    updateExtractedBlock(activeBlock.id, {
      rawText: newRawText,
      parsedData: {
        ...activeBlock.parsedData,
        items: nextStructuredItems,
        ...(nextTokens ? { tokens: nextTokens } : {}),
      },
    });
  };

  const handleDeleteItem = (index: number) => {
    if (!activeBlock) return;
    const currentItems = getBlockItems(activeBlock);
    const nextItems = currentItems.filter((_, i) => i !== index);

    const nextStructuredItems = Array.isArray(activeBlock.parsedData?.items)
      ? activeBlock.parsedData.items.filter((_: any, i: number) => i !== index)
      : nextItems;

    const nextTokens = Array.isArray(activeBlock.parsedData?.tokens)
      ? activeBlock.parsedData.tokens.filter((_: any, i: number) => i !== index)
      : undefined;

    const newRawText = [
      activeBlock.parsedData?.title || '',
      activeBlock.parsedData?.instruction || '',
      ...nextItems,
    ]
      .filter(Boolean)
      .join('\n');

    updateExtractedBlock(activeBlock.id, {
      rawText: newRawText,
      parsedData: {
        ...activeBlock.parsedData,
        items: nextStructuredItems,
        ...(nextTokens ? { tokens: nextTokens } : {}),
      },
    });
  };

  const handleAddItem = () => {
    if (!activeBlock) return;
    const currentItems = getBlockItems(activeBlock);
    const nextItems = [...currentItems, 'Nuevo elemento'];

    const nextStructuredItems = Array.isArray(activeBlock.parsedData?.items)
      ? [
          ...activeBlock.parsedData.items,
          {
            text: 'Nuevo elemento _______',
            expectedAnswer: 'Respuesta canónica',
            acceptedAnswers: ['Respuesta canónica'],
            hint: 'Pista pedagógica'
          }
        ]
      : nextItems;

    const newRawText = [
      activeBlock.parsedData?.title || '',
      activeBlock.parsedData?.instruction || '',
      ...nextItems,
    ]
      .filter(Boolean)
      .join('\n');

    updateExtractedBlock(activeBlock.id, {
      rawText: newRawText,
      parsedData: {
        ...activeBlock.parsedData,
        items: nextStructuredItems,
      },
    });
  };

  // Derive default role directly from detected type without setState in effect
  const defaultRole: PedagogicalRole = (() => {
    if (!activeBlock) return 'interaction_inputs';
    switch (activeBlock.detectedType) {
      case 'table':
        return 'reference_table';
      case 'vocabulary':
        return 'interaction_buckets';
      case 'dialogue':
        return 'interaction_sequence';
      case 'paragraph':
        return 'reference_text';
      default:
        return 'interaction_inputs';
    }
  })();

  const selectedRole = selectedRoleOverride || defaultRole;

  // Listen for Ctrl+V globally
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // 1. Ignore paste if an interactive element is in focus (<input>, <textarea>, or contentEditable)
      const activeEl = document.activeElement;
      const activeTag = activeEl?.tagName?.toLowerCase();
      const isEditable = activeEl?.getAttribute('contenteditable') === 'true' ||
                        (activeEl as HTMLElement)?.isContentEditable;
      if (activeTag === 'input' || activeTag === 'textarea' || isEditable) {
        return;
      }

      // 2. Ignore paste if another modal (e.g. reference image upload dialog) is active in DOM
      if (document.querySelector('[data-modal="image-upload"], [data-modal="true"], dialog[open]')) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      let foundImage = false;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            foundImage = true;
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                addPastedImage(event.target.result as string);
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
      if (foundImage) {
        setIsOcrDrawerOpen(true);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addPastedImage, setIsOcrDrawerOpen]);

  if (!isOcrDrawerOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            addPastedImage(event.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    }
  };

  /**
   * Primary Action: Creates a new slide with the selected role, assigns content,
   * switches Canvas to real interactive/preview mode, resets OCR session, and closes modal.
   */
  const handleCreateAsNewSlide = (blockId: string, role: PedagogicalRole) => {
    const newSlideId = createSlideFromBlock(blockId, role);
    setCurrentSlideId(newSlideId);
    setMode('preview'); // Instantly activates real playable containers & tokens on Canvas
    resetOcrState(); // Automatically resets OCR state to blank
    setIsOcrDrawerOpen(false);
  };

  /**
   * Secondary Action: Assigns to the existing current slide, activates interactive mode, resets OCR, closes modal.
   */
  const handleAssignToCurrentSlide = (blockId: string, role: PedagogicalRole) => {
    if (!currentSlideId) return;
    assignExtractedBlock(currentSlideId, blockId, role);
    setMode('preview'); // Instantly activates real playable containers & tokens on Canvas
    resetOcrState(); // Automatically resets OCR state to blank
    setIsOcrDrawerOpen(false);
  };

  const handleRestore = () => {
    restoreExtractedBlocks();
    setSelectedRoleOverride(null);
    setAssignmentFeedback('¡Actividad restaurada al instante sin consumir tokens!');
    setTimeout(() => setAssignmentFeedback(null), 2000);
  };

  const handleCreateManual = (template: ManualTemplateType, label: string) => {
    addManualBlock(template);
    setIsManualMenuOpen(false);
    setSelectedRoleOverride(null);
    setAssignmentFeedback(`¡Plantilla "${label}" añadida a la bandeja!`);
    setTimeout(() => setAssignmentFeedback(null), 1800);
  };

  const handleCreateSlideFromTemplate = (template: ManualTemplateType | 'reference_text' | 'sequence') => {
    const newSlideId = addSlide('split_50_50');
    directAssignTemplate(newSlideId, template);
    setCurrentSlideId(newSlideId);
    setMode('preview'); // Instantly activates real playable containers & tokens on Canvas
    resetOcrState(); // Automatically resets OCR state to blank
    setIsOcrDrawerOpen(false);
  };

  const getBlockTypeMeta = (type: ExtractedBlock['detectedType']) => {
    switch (type) {
      case 'table':
        return { label: 'Tabla Detectada', icon: Table, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
      case 'numbered_list':
        return { label: 'Lista de Ejercicios', icon: ListOrdered, color: 'text-purple-700 bg-purple-50 border-purple-200' };
      case 'vocabulary':
        return { label: 'Vocabulario / Categorías', icon: FolderGit2, color: 'text-amber-700 bg-amber-50 border-amber-200' };
      default:
        return { label: 'Texto / Párrafo', icon: FileText, color: 'text-sky-700 bg-sky-50 border-sky-200' };
    }
  };

  const ROLE_OPTIONS: { id: PedagogicalRole; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'interaction_inputs', label: '1. Rellenar Espacios', icon: PenTool },
    { id: 'interaction_selection', label: '2. Selección Múltiple', icon: CheckSquare },
    { id: 'interaction_buckets', label: '3. Buckets / Categorías', icon: FolderGit2 },
    { id: 'interaction_sequence', label: '4. Secuencia', icon: ListOrdered },
    { id: 'reference_text', label: 'Texto de Lectura', icon: BookOpen },
    { id: 'reference_table', label: 'Cuadro Gramatical', icon: Table },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
      {/* Click outside backdrop */}
      <div 
        onClick={() => setIsOcrDrawerOpen(false)}
        className="absolute inset-0"
      />

      {/* Main Wide Workspace Modal (Full Workspace) */}
      <div className="relative w-full max-w-6xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 z-10">
        
        {/* Fixed Header */}
        <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/90 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Espacio de Trabajo: Digitalización de Libro de Texto (OCR)
                </h2>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3" /> Fiel al original
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Consolida el recorte del libro y conviértelo en una nueva diapositiva con 1 solo clic
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {assignmentFeedback && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 animate-pop">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{assignmentFeedback}</span>
              </div>
            )}

            <button
              onClick={() => setIsOcrDrawerOpen(false)}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition"
              title="Cerrar espacio de trabajo"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Modal Body: 2-Column Responsive Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden p-6 bg-slate-50/40">
          
          {/* ============================================================== */}
          {/* COLUMNA IZQUIERDA (5 COLUMNAS): Captura del Libro (Multi-Recorte) */}
          {/* ============================================================== */}
          <div className="lg:col-span-5 flex flex-col h-full overflow-hidden space-y-3">
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                  1
                </span>
                <h3 className="text-xs font-bold text-slate-800">
                  Paso 1: Recortes del Libro (Texto + Ejercicio)
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {pastedImages.length > 0 ? `${pastedImages.length} recorte(s)` : 'Pega con Ctrl+V'}
              </span>
            </div>

            {/* Drop / Paste Area and Multi-Clipping Gallery */}
            <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-2xs overflow-hidden">
              {pastedImages.length === 0 ? (
                /* Empty Upload Zone */
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const files = e.dataTransfer.files;
                    if (files && files.length > 0) {
                      Array.from(files).forEach((file) => {
                        if (file.type.startsWith('image/')) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            if (event.target?.result) addPastedImage(event.target.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      });
                    }
                  }}
                  className={`flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-50/50'
                      : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    id="book-upload-input"
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  <label htmlFor="book-upload-input" className="cursor-pointer flex flex-col items-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-indigo-600 shadow-sm">
                      {ocrProcessing ? (
                        <Sparkles className="w-7 h-7 animate-spin text-indigo-600" />
                      ) : (
                        <UploadCloud className="w-7 h-7" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-800">
                        {ocrProcessing ? 'Extrayendo estructura con IA...' : 'Pega con Ctrl+V uno o varios recortes'}
                      </p>
                      <p className="text-xs text-indigo-600 font-medium">
                        (ej. el texto de lectura + las preguntas correspondientes)
                      </p>
                      <p className="text-[11px] text-slate-400 max-w-xs pt-1">
                        o haz clic aquí para seleccionar imágenes desde tu equipo (puedes seleccionar varias)
                      </p>
                    </div>
                  </label>
                </div>
              ) : (
                /* Multi-clipping Gallery Viewer */
                <div className="flex-1 flex flex-col min-h-0 space-y-3">
                  <div className="flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Recortes Acumulados ({pastedImages.length})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label 
                        htmlFor="add-another-book-upload"
                        className="cursor-pointer text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition border border-indigo-200 flex items-center gap-1"
                        title="Añadir otro recorte sin perder los anteriores"
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ Añadir Recorte</span>
                      </label>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        id="add-another-book-upload"
                        className="hidden"
                        onChange={handleFileUpload}
                      />

                      <button
                        type="button"
                        onClick={clearPastedImages}
                        className="text-[11px] font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition flex items-center gap-1"
                        title="Descartar todos los recortes"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Limpiar</span>
                      </button>
                    </div>
                  </div>

                  {/* Scrollable list of thumbnails */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const files = e.dataTransfer.files;
                      if (files && files.length > 0) {
                        Array.from(files).forEach((file) => {
                          if (file.type.startsWith('image/')) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              if (event.target?.result) addPastedImage(event.target.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        });
                      }
                    }}
                    className={`flex-1 overflow-y-auto rounded-xl border p-2.5 space-y-3 transition ${
                      isDragging ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200 bg-slate-950/5'
                    }`}
                  >
                    {pastedImages.map((imgSrc, idx) => {
                      const label =
                        idx === 0
                          ? 'Recorte 1: Texto / Base'
                          : idx === 1
                          ? 'Recorte 2: Preguntas / Encabezados'
                          : `Recorte ${idx + 1}: Complementario`;

                      return (
                        <div
                          key={idx}
                          className="relative rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs group flex flex-col space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                              <span>{label}</span>
                            </span>

                            <button
                              type="button"
                              onClick={() => removePastedImage(idx)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Descartar este recorte"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="rounded-lg bg-slate-100/60 p-1 flex items-center justify-center max-h-44 overflow-hidden">
                            <img
                              src={imgSrc}
                              alt={label}
                              className="max-h-40 w-auto object-contain rounded"
                            />
                          </div>
                        </div>
                      );
                    })}

                    {/* Quick drag/paste prompt at bottom of list */}
                    <div className="p-2 border border-dashed border-slate-300 rounded-lg text-center text-[11px] text-slate-400 bg-white/50">
                      💡 Presiona <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-mono text-slate-700">Ctrl+V</kbd> para añadir más recortes
                    </div>
                  </div>

                  {/* Primary Trigger Button for Multimodal Processing */}
                  <div className="pt-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => processPastedImages()}
                      disabled={ocrProcessing || pastedImages.length === 0}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {ocrProcessing ? (
                        <>
                          <Sparkles className="w-4 h-4 animate-spin text-white" />
                          <span>Analizando {pastedImages.length} recorte(s) con Gemini...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <span>Procesar {pastedImages.length} Recorte{pastedImages.length > 1 ? 's' : ''} con IA</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ============================================================== */}
          {/* COLUMNA DERECHA (7 COLUMNAS): Tarjeta Pedagógica Consolidada   */}
          {/* ============================================================== */}
          <div className="lg:col-span-7 flex flex-col h-full overflow-hidden space-y-3">
            
            {/* Step 2 Header & Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">
                  2
                </span>
                <h3 className="text-xs font-bold text-slate-800">
                  Paso 2: Actividad Didáctica Consolidada
                </h3>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  activeBlock 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {activeBlock ? 'Actividad Lista' : 'Sin Actividad'}
                </span>
              </div>

              {/* Top Controls: Restore & Manual Template Menu */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestore}
                  className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs"
                  title="Recupera la última extracción de la IA sin consumir tokens"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                  <span>↺ Restaurar</span>
                </button>

                <div className="relative">
                  <button
                    onClick={() => setIsManualMenuOpen(!isManualMenuOpen)}
                    className="py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs"
                    title="Crear un nuevo bloque a partir de plantilla pedagógica"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Crear manual</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${isManualMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Manual Template Dropdown */}
                  {isManualMenuOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 block">
                        Plantillas Disponibles
                      </span>
                      <button
                        onClick={() => handleCreateManual('input_fields', 'Fill in blanks')}
                        className="w-full text-left text-xs p-2 rounded-xl hover:bg-blue-50 text-slate-700 hover:text-blue-700 flex items-center gap-2 transition"
                      >
                        <PenTool className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">Fill in blanks</p>
                          <p className="text-[10px] text-slate-400">Rellenar espacios / inputs</p>
                        </div>
                      </button>
                      <button
                        onClick={() => handleCreateManual('buckets', 'Buckets')}
                        className="w-full text-left text-xs p-2 rounded-xl hover:bg-amber-50 text-slate-700 hover:text-amber-700 flex items-center gap-2 transition"
                      >
                        <FolderGit2 className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">Buckets</p>
                          <p className="text-[10px] text-slate-400">Clasificación por categorías</p>
                        </div>
                      </button>
                      <button
                        onClick={() => handleCreateManual('selection', 'Selection')}
                        className="w-full text-left text-xs p-2 rounded-xl hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 flex items-center gap-2 transition"
                      >
                        <CheckSquare className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">Selection</p>
                          <p className="text-[10px] text-slate-400">Opción múltiple / Marcación</p>
                        </div>
                      </button>
                      <button
                        onClick={() => handleCreateManual('reference_table', 'Reference Table')}
                        className="w-full text-left text-xs p-2 rounded-xl hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 flex items-center gap-2 transition"
                      >
                        <Table className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">Reference Table</p>
                          <p className="text-[10px] text-slate-400">Cuadro gramatical / Tabla</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Consolidated Content Area */}
            {activeBlock ? (
              <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs overflow-hidden">
                {/* Card Title & Detection Meta */}
                <div className="flex items-start justify-between flex-shrink-0 border-b border-slate-100 pb-2.5 gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const meta = getBlockTypeMeta(activeBlock.detectedType);
                        const Icon = meta.icon;
                        return (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${meta.color}`}>
                            <Icon className="w-3.5 h-3.5" />
                            <span>{meta.label}</span>
                          </span>
                        );
                      })()}
                      <span className="text-[11px] text-emerald-600 font-medium">
                        {Math.round(activeBlock.confidence * 100)}% Fidelidad
                      </span>
                    </div>

                    <div className="pt-0.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                        Título de la Actividad:
                      </label>
                      <input
                        type="text"
                        value={activeBlock.parsedData?.title ?? ''}
                        placeholder="Título de la diapositiva..."
                        onChange={(e) => handleUpdateTitle(e.target.value)}
                        className="w-full text-xs font-bold text-slate-900 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 outline-none transition"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => removeExtractedBlock(activeBlock.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition flex-shrink-0"
                    title="Descartar este bloque"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Inline Editable Instruction */}
                <div className="space-y-1 flex-shrink-0">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Instrucción / Enunciado Pedagógico:
                  </label>
                  <input
                    type="text"
                    value={activeBlock.parsedData?.instruction ?? ''}
                    placeholder="Instrucción pedagógica de la actividad..."
                    onChange={(e) => handleUpdateInstruction(e.target.value)}
                    className="w-full text-xs text-slate-800 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 outline-none transition"
                  />
                </div>

                {/* Format / Role Selector */}
                <div className="space-y-1.5 flex-shrink-0">
                  <span className="text-xs font-bold text-slate-700 block">
                    Formato de la actividad en la diapositiva:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {ROLE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isSelected = selectedRole === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setSelectedRoleOverride(opt.id)}
                          className={`text-xs py-2 px-2.5 rounded-xl border flex items-center gap-2 font-medium transition text-left cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`} />
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Structured Preview Box */}
                {(() => {
                  const mappedPreview = mapBlockToRole(activeBlock, selectedRole);

                  return (
                    <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Previsualización y Edición Rápida de Elementos:
                        </span>
                        <span className="text-[10px] text-slate-400">
                          (Haz clic en cualquier texto para corregir o borra parásitos con ✕)
                        </span>
                      </div>

                      {/* Integrated Reading Passage Context (when present alongside interactive exercise) */}
                      {mappedPreview.reference?.type === 'text' && mappedPreview.interaction && (
                        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 space-y-1.5 mb-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                              <span>📖 Texto de Lectura / Contexto Base Integrado:</span>
                            </span>
                            <span className="text-[10px] font-semibold text-sky-700 bg-sky-100/90 px-2 py-0.5 rounded-full border border-sky-200">
                              Lienzo Dividido Automático
                            </span>
                          </div>
                          <textarea
                            value={
                              activeBlock.parsedData?.content ||
                              (Array.isArray(activeBlock.parsedData?.paragraphs)
                                ? activeBlock.parsedData.paragraphs.join('\n\n')
                                : '')
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              updateExtractedBlock(activeBlock.id, {
                                parsedData: {
                                  ...activeBlock.parsedData,
                                  content: val,
                                  paragraphs: val.split('\n\n').filter(Boolean),
                                },
                              });
                            }}
                            rows={3}
                            className="w-full text-xs text-slate-800 bg-white border border-sky-200 focus:border-sky-400 rounded-lg p-2 outline-none font-sans leading-relaxed resize-y"
                            placeholder="Párrafos del texto de lectura extraído del recorte..."
                          />
                        </div>
                      )}

                      {/* Table View */}
                      {mappedPreview.reference?.type === 'table_reference' && mappedPreview.reference.rows.length > 0 ? (
                        <div className="overflow-x-auto space-y-2">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-300 text-slate-700">
                                {mappedPreview.reference.headers.map((h: string, i: number) => (
                                  <th key={i} className="py-1 px-2 font-bold bg-slate-200/60">{h}</th>
                                ))}
                                <th className="py-1 px-2 w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {mappedPreview.reference.rows.map((row: string[], ri: number) => (
                                <tr key={ri} className="border-b border-slate-200/80 group">
                                  {row.map((cell: string, ci: number) => (
                                    <td key={ci} className="py-1 px-2 text-slate-800">
                                      <input
                                        type="text"
                                        value={cell}
                                        onChange={(e) => {
                                          const nextRows = mappedPreview.reference?.type === 'table_reference' ? [...mappedPreview.reference.rows] : [];
                                          if (nextRows[ri]) {
                                            nextRows[ri] = [...nextRows[ri]];
                                            nextRows[ri][ci] = e.target.value;
                                            updateExtractedBlock(activeBlock.id, {
                                              parsedData: {
                                                ...activeBlock.parsedData,
                                                rows: nextRows
                                              }
                                            });
                                          }
                                        }}
                                        className="w-full text-xs bg-transparent border-b border-transparent focus:border-indigo-400 outline-none"
                                      />
                                    </td>
                                  ))}
                                  <td className="py-1 px-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextRows = mappedPreview.reference?.type === 'table_reference'
                                          ? mappedPreview.reference.rows.filter((_, idx) => idx !== ri)
                                          : [];
                                        updateExtractedBlock(activeBlock.id, {
                                          parsedData: {
                                            ...activeBlock.parsedData,
                                            rows: nextRows
                                          }
                                        });
                                      }}
                                      className="text-slate-300 hover:text-rose-600 p-0.5 rounded transition"
                                      title="Eliminar fila"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : mappedPreview.interaction?.type === 'buckets_matching' ? (
                        /* Buckets View */
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                              Ranuras / Categorías ({mappedPreview.interaction.buckets.length}):
                            </span>
                            {mappedPreview.interaction.buckets.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {mappedPreview.interaction.buckets.map((b) => (
                                  <span 
                                    key={b.id} 
                                    className="text-xs font-bold px-2.5 py-0.5 rounded-lg border text-slate-800" 
                                    style={{ borderColor: b.color || '#4f46e5', backgroundColor: `${b.color || '#4f46e5'}15` }}
                                  >
                                    {b.label}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                                💡 No hay ranuras detectadas en el recorte. Puedes añadirlas en el editor o se vincularán automáticamente con los párrafos de lectura.
                              </p>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                              Fichas extraídas ({mappedPreview.interaction.tokens.length}):
                            </span>
                            {mappedPreview.interaction.tokens.length > 0 ? (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {mappedPreview.interaction.tokens.map((t, tIdx) => {
                                  const bucket = mappedPreview.interaction?.type === 'buckets_matching'
                                    ? mappedPreview.interaction.buckets.find((b) => b.id === t.correctBucketId)
                                    : null;
                                  return (
                                    <div
                                      key={t.id || tIdx}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 shadow-2xs group hover:border-slate-300 transition"
                                    >
                                      <input
                                        type="text"
                                        value={t.text}
                                        onChange={(e) => handleUpdateItem(tIdx, e.target.value)}
                                        className="text-xs font-medium text-slate-800 bg-transparent outline-none w-auto max-w-[150px] focus:ring-1 focus:ring-indigo-300 rounded px-1"
                                      />
                                      {bucket ? (
                                        <span className="text-indigo-600 font-semibold text-[11px]">→ {bucket.label}</span>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteItem(tIdx)}
                                        className="text-slate-300 hover:text-rose-600 p-0.5 rounded transition"
                                        title="Eliminar elemento parásito"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400 italic">No se detectaron fichas individuales para clasificar.</p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={handleAddItem}
                            className="w-full py-1.5 px-3 border border-dashed border-slate-300 hover:border-indigo-400 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1.5 transition bg-white/70"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Añadir Ficha</span>
                          </button>
                        </div>
                      ) : mappedPreview.interaction?.type === 'input_fields' && mappedPreview.interaction.listItems.length > 0 ? (
                        /* Items list for Fill in blanks */
                        <div className="space-y-2">
                          <ul className="space-y-1.5 text-xs text-slate-800">
                            {mappedPreview.interaction.listItems.map((it, i) => (
                              <li
                                key={it.id || i}
                                className="p-2 rounded-lg bg-white border border-slate-200/80 flex items-center gap-2 group hover:border-slate-300 transition"
                              >
                                <span className="font-bold text-indigo-600 flex-shrink-0 text-xs">{i + 1}.</span>
                                <input
                                  type="text"
                                  value={it.prompt}
                                  onChange={(e) => handleUpdateItem(i, e.target.value)}
                                  className="flex-1 text-xs text-slate-800 bg-transparent border-b border-transparent focus:border-indigo-400 outline-none py-0.5"
                                />
                                {it.acceptedAnswers && it.acceptedAnswers.length > 0 && it.acceptedAnswers[0] && (
                                  <span className="text-[11px] text-emerald-600 font-semibold px-1.5 py-0.5 rounded bg-emerald-50 flex-shrink-0">
                                    ✓ {it.acceptedAnswers[0]}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(i)}
                                  className="text-slate-300 hover:text-rose-600 p-1 rounded transition flex-shrink-0"
                                  title="Eliminar este reactivo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>

                          <button
                            type="button"
                            onClick={handleAddItem}
                            className="w-full py-1.5 px-3 border border-dashed border-slate-300 hover:border-indigo-400 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1.5 transition bg-white/70"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Añadir Reactivo</span>
                          </button>
                        </div>
                      ) : mappedPreview.interaction?.type === 'sequence' && mappedPreview.interaction.items.length > 0 ? (
                        /* Sequence dialogue list */
                        <div className="space-y-2">
                          <ul className="space-y-1.5 text-xs text-slate-800">
                            {mappedPreview.interaction.items.map((it, idx) => (
                              <li
                                key={it.id || idx}
                                className="p-2 rounded-lg bg-white border border-slate-200/80 flex items-center gap-2 group hover:border-slate-300 transition"
                              >
                                <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                                  {it.correctOrder}
                                </span>
                                {it.speaker && (
                                  <span className="font-bold text-slate-700 text-xs flex-shrink-0">{it.speaker}:</span>
                                )}
                                <input
                                  type="text"
                                  value={it.text}
                                  onChange={(e) => handleUpdateItem(idx, e.target.value)}
                                  className="flex-1 text-xs text-slate-800 bg-transparent border-b border-transparent focus:border-indigo-400 outline-none py-0.5"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(idx)}
                                  className="text-slate-300 hover:text-rose-600 p-1 rounded transition flex-shrink-0"
                                  title="Eliminar elemento parásito"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>

                          <button
                            type="button"
                            onClick={handleAddItem}
                            className="w-full py-1.5 px-3 border border-dashed border-slate-300 hover:border-indigo-400 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1.5 transition bg-white/70"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Añadir Frase a la Secuencia</span>
                          </button>
                        </div>
                      ) : mappedPreview.interaction?.type === 'selection' && mappedPreview.interaction.options && mappedPreview.interaction.options.length > 0 ? (
                        /* Flat selection options preview */
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                            Opciones de Selección ({mappedPreview.interaction.options.length}):
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {mappedPreview.interaction.options.map((opt, optIdx) => (
                              <div
                                key={opt.id || optIdx}
                                className={`p-2 rounded-lg bg-white border text-[11px] flex items-center justify-between gap-2 group hover:border-slate-300 transition ${
                                  opt.isCorrect
                                    ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900 font-semibold'
                                    : 'border-slate-200/80 text-slate-700'
                                }`}
                              >
                                <input
                                  type="text"
                                  value={opt.text}
                                  onChange={(e) => handleUpdateItem(optIdx, e.target.value)}
                                  className="flex-1 text-[11px] text-slate-800 bg-transparent border-b border-transparent focus:border-indigo-400 outline-none"
                                />
                                {opt.isCorrect && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
                                    ✓
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(optIdx)}
                                  className="text-slate-300 hover:text-rose-600 p-0.5 rounded transition"
                                  title="Eliminar opción"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={handleAddItem}
                            className="w-full py-1.5 px-3 border border-dashed border-slate-300 hover:border-indigo-400 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1.5 transition bg-white/70"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Añadir Opción</span>
                          </button>
                        </div>
                      ) : mappedPreview.interaction?.type === 'selection' && mappedPreview.interaction.questions && mappedPreview.interaction.questions.length > 0 ? (
                        /* Selection questions */
                        <div className="space-y-2">
                          {mappedPreview.interaction.questions.map((q, qi) => (
                            <div key={q.id || qi} className="p-2.5 rounded-lg bg-white border border-slate-200/80 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-500">{qi + 1}.</span>
                                <input
                                  type="text"
                                  value={q.prompt}
                                  onChange={(e) => handleUpdateItem(qi, e.target.value)}
                                  className="flex-1 text-xs font-semibold text-slate-900 bg-transparent border-b border-transparent focus:border-indigo-400 outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(qi)}
                                  className="text-slate-300 hover:text-rose-600 p-0.5 rounded transition"
                                  title="Eliminar reactivo"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="space-y-1 pl-4">
                                {q.options.map((opt) => (
                                  <div key={opt.id} className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-1.5 ${opt.isCorrect ? 'text-emerald-700 bg-emerald-50 font-bold' : 'text-slate-600'}`}>
                                    <span>{opt.isCorrect ? '✓' : '○'}</span>
                                    <span>{opt.text}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={handleAddItem}
                            className="w-full py-1.5 px-3 border border-dashed border-slate-300 hover:border-indigo-400 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1.5 transition bg-white/70"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Añadir Pregunta</span>
                          </button>
                        </div>
                      ) : (
                        /* Raw text / Reference text editable fallback */
                        <div className="space-y-2">
                          <textarea
                            value={activeBlock.parsedData?.content || activeBlock.rawText || ''}
                            onChange={(e) => {
                              const newContent = e.target.value;
                              updateExtractedBlock(activeBlock.id, {
                                rawText: newContent,
                                parsedData: {
                                  ...activeBlock.parsedData,
                                  content: newContent,
                                  items: newContent.split('\n').map((l) => l.trim()).filter(Boolean)
                                }
                              });
                            }}
                            rows={8}
                            className="w-full text-xs text-slate-800 font-mono whitespace-pre-wrap leading-relaxed p-2.5 bg-white border border-slate-200 rounded-lg focus:border-indigo-500 outline-none"
                            placeholder="Texto extraído del libro..."
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Primary Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-2.5 flex-shrink-0">
                  <button
                    onClick={() => handleCreateAsNewSlide(activeBlock.id, selectedRole)}
                    className="w-full sm:flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-xs transition transform active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Rocket className="w-4 h-4" />
                    <span>🚀 Crear como Nueva Diapositiva</span>
                  </button>

                  {lesson.slides.length > 0 && currentSlideId && (
                    <button
                      onClick={() => handleAssignToCurrentSlide(activeBlock.id, selectedRole)}
                      className="w-full sm:w-auto py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Asignar a Diapositiva #{currentSlideIndex + 1}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* When 0 blocks are available: Permanent Empty Menu */
              <div className="flex-1 flex flex-col justify-center space-y-4 overflow-y-auto pr-1">
                <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-xs">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Bandeja temporal sin bloques
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Los bloques fueron asignados a diapositivas o eliminados. Puedes recuperarlos al instante de la memoria o crear una nueva diapositiva con plantilla:
                    </p>
                  </div>

                  <div className="flex items-center justify-center pt-1">
                    <button
                      onClick={handleRestore}
                      className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 transition shadow-xs"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>↺ Restaurar última extracción de IA</span>
                    </button>
                  </div>
                </div>

                {/* Direct Slide Creation via Templates */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Crear nueva diapositiva a partir de plantilla:
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Selecciona una plantilla para insertarla directamente en tu lección:
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleCreateSlideFromTemplate('input_fields')}
                      className="text-xs font-medium p-3 rounded-xl bg-blue-50/70 hover:bg-blue-100 text-blue-800 border border-blue-200 text-left transition flex items-center gap-2.5"
                    >
                      <PenTool className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <div className="truncate">
                        <div className="font-bold truncate">🚀 Fill in blanks</div>
                        <div className="text-[10px] text-blue-600">Nueva Diapositiva</div>
                      </div>
                    </button>

                    <button
                      onClick={() => handleCreateSlideFromTemplate('buckets')}
                      className="text-xs font-medium p-3 rounded-xl bg-amber-50/70 hover:bg-amber-100 text-amber-800 border border-amber-200 text-left transition flex items-center gap-2.5"
                    >
                      <FolderGit2 className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <div className="truncate">
                        <div className="font-bold truncate">🚀 Buckets</div>
                        <div className="text-[10px] text-amber-600">Nueva Diapositiva</div>
                      </div>
                    </button>

                    <button
                      onClick={() => handleCreateSlideFromTemplate('selection')}
                      className="text-xs font-medium p-3 rounded-xl bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-left transition flex items-center gap-2.5"
                    >
                      <CheckSquare className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <div className="truncate">
                        <div className="font-bold truncate">🚀 Selection</div>
                        <div className="text-[10px] text-emerald-600">Nueva Diapositiva</div>
                      </div>
                    </button>

                    <button
                      onClick={() => handleCreateSlideFromTemplate('reference_table')}
                      className="text-xs font-medium p-3 rounded-xl bg-indigo-50/70 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-left transition flex items-center gap-2.5"
                    >
                      <Table className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                      <div className="truncate">
                        <div className="font-bold truncate">🚀 Reference Table</div>
                        <div className="text-[10px] text-indigo-600">Nueva Diapositiva</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
