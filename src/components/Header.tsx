import React, { useState, useRef, useEffect } from 'react';
import { useLessonStore } from '../store/useLessonStore';
import { useSessionStore } from '../store/useSessionStore';
import { 
  BookOpen, 
  Eye, 
  Edit3, 
  Radio, 
  Share2, 
  Wand2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Undo2,
  Redo2,
  Save,
  FolderOpen,
  Download,
  Check,
  Package,
  RotateCcw,
  Sparkles,
  AlertCircle
} from 'lucide-react';

export const Header: React.FC = () => {
  const { 
    lesson, 
    setLessonTitle,
    loadLessonFromFile,
    saveLesson,
    saveLessonCopy,
    openLessonWithPicker,
    currentFileHandle,
    saveFeedback,
    clearLesson, 
    undo, 
    redo, 
    canUndo, 
    canRedo,
    exportLessonAsScorm,
    reprocessSlide,
    regenerateActiveSlideWithAI,
    ocrProcessing
  } = useLessonStore();
  const { 
    mode, 
    setMode, 
    liveSyncEnabled, 
    toggleLiveSync,
    currentSlideId,
    setCurrentSlideId,
    toggleOcrDrawer,
    isOcrDrawerOpen
  } = useSessionStore();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(lesson.title);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingScorm, setIsExportingScorm] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSlide = lesson.slides.find((s) => s.id === currentSlideId) || (lesson.slides.length > 0 ? lesson.slides[0] : null);
  const hasRawExtraction = Boolean(currentSlide?._rawExtraction);
  const hasSourceImage = Boolean(currentSlide?._sourceImage || currentSlide?.sourceImageSnippetUrl);

  useEffect(() => {
    if (saveFeedback?.message) {
      setToastMessage(saveFeedback.message);
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [saveFeedback]);

  const handleOpenLesson = async () => {
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        const opened = await openLessonWithPicker();
        if (opened) return;
      } catch (err: any) {
        alert(err.message || 'Error al abrir el archivo.');
        return;
      }
    }
    fileInputRef.current?.click();
  };

  const handleQuickSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await saveLesson();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCopy = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await saveLessonCopy();
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportScorm = async () => {
    if (isExportingScorm) return;
    setIsExportingScorm(true);
    try {
      await exportLessonAsScorm();
    } catch (err: any) {
      alert('Error al generar el paquete SCORM 1.2: ' + (err?.message || err));
    } finally {
      setIsExportingScorm(false);
    }
  };

  const handleStartEditing = () => {
    setTempTitle(lesson.title);
    setIsEditingTitle(true);
  };

  useEffect(() => {
    setTempTitle(lesson.title);
  }, [lesson.title]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const handleConfirmTitle = () => {
    setIsEditingTitle(false);
    const trimmed = tempTitle.trim();
    if (trimmed && trimmed !== lesson.title) {
      setLessonTitle(trimmed);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await loadLessonFromFile(file);
    } finally {
      e.target.value = '';
    }
  };

  useEffect(() => {
    if (lesson.slides.length > 0 && !lesson.slides.some((s) => s.id === currentSlideId)) {
      setCurrentSlideId(lesson.slides[0].id);
    }
  }, [lesson.slides, currentSlideId, setCurrentSlideId]);

  const currentSlideIndex = lesson.slides.findIndex((s) => s.id === currentSlideId);
  const effectiveSlideIndex = currentSlideIndex >= 0 ? currentSlideIndex : 0;

  const goToPrevSlide = () => {
    if (effectiveSlideIndex > 0) {
      setCurrentSlideId(lesson.slides[effectiveSlideIndex - 1].id);
    }
  };

  const goToNextSlide = () => {
    if (effectiveSlideIndex < lesson.slides.length - 1) {
      setCurrentSlideId(lesson.slides[effectiveSlideIndex + 1].id);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/90 px-4 md:px-6 flex items-center justify-between z-20 select-none shadow-xs">
      {/* Brand & Lesson Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-xs text-white font-bold">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                ELT SLIDE BUILDER
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60">
                {lesson.level}
              </span>
              <span className="text-xs font-medium text-slate-500 hidden sm:inline">
                {lesson.unit}
              </span>
            </div>

            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                onBlur={handleConfirmTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmTitle();
                  } else if (e.key === 'Escape') {
                    setTempTitle(lesson.title);
                    setIsEditingTitle(false);
                  }
                }}
                className="text-sm font-semibold text-slate-900 bg-white border border-indigo-400 rounded-lg px-2 py-0.5 outline-none ring-2 ring-indigo-100 shadow-xs max-w-[200px] sm:max-w-xs md:max-w-sm mt-0.5"
                placeholder="Nombre de la lección..."
              />
            ) : (
              <div
                onClick={handleStartEditing}
                className="group flex items-center gap-1.5 cursor-pointer rounded-lg hover:bg-slate-100/90 px-1.5 py-0.5 -ml-1.5 transition mt-0.5 max-w-[200px] sm:max-w-xs md:max-w-sm"
                title="Haz clic para renombrar la lección"
              >
                <h1 className="text-sm font-semibold text-slate-900 truncate">
                  {lesson.title || 'Nueva Lección'}
                </h1>
                <Edit3 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition shrink-0" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slide Navigation Pagination */}
      <div className="flex items-center gap-1.5 bg-slate-100/90 px-2 py-1 rounded-xl border border-slate-200/80">
        <button
          onClick={goToPrevSlide}
          disabled={effectiveSlideIndex <= 0 || lesson.slides.length === 0}
          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 transition"
          title="Diapositiva anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="text-xs font-semibold text-slate-700 px-2">
          {lesson.slides.length > 0 ? `${effectiveSlideIndex + 1} / ${lesson.slides.length}` : '0 / 0'}
        </span>

        <button
          onClick={goToNextSlide}
          disabled={effectiveSlideIndex >= lesson.slides.length - 1 || lesson.slides.length === 0}
          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 transition"
          title="Diapositiva siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {/* Global Undo & Redo Controls */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-indigo-700 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition shadow-2xs"
            title="Deshacer última acción (Ctrl + Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Deshacer</span>
          </button>

          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-indigo-700 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition shadow-2xs"
            title="Rehacer acción (Ctrl + Y o Ctrl + Shift + Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rehacer</span>
          </button>
        </div>

        {/* File Portability Controls: Open, Quick Save & Export Copy */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json,.elt.json"
            onChange={handleImportFile}
            className="hidden"
          />

          <button
            onClick={handleOpenLesson}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-indigo-700 hover:bg-white transition shadow-2xs cursor-pointer"
            title="Abrir y cargar lección desde archivo .elt.json"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden xl:inline">Abrir Lección</span>
            <span className="inline xl:hidden">Abrir</span>
          </button>

          {/* Quick Save: Sobrescritura directa o nuevo guardado */}
          <button
            onClick={handleQuickSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 hover:text-indigo-800 hover:bg-white bg-indigo-50/70 transition shadow-2xs cursor-pointer disabled:opacity-50"
            title={
              currentFileHandle
                ? `Guardar cambios directamente en "${currentFileHandle.name}" (Ctrl + S)`
                : 'Guardar lección en archivo (Ctrl + S)'
            }
          >
            <Save className="w-3.5 h-3.5 text-indigo-600" />
            <span className="font-semibold">Guardar</span>
            {currentFileHandle ? (
              <span className="hidden lg:inline-flex items-center max-w-[120px] truncate text-[10px] text-indigo-900/60 font-medium">
                ({currentFileHandle.name})
              </span>
            ) : (
              <span className="hidden 2xl:inline text-[10px] text-slate-400 font-normal">
                (Ctrl+S)
              </span>
            )}
          </button>

          {/* Guardar una copia / Exportar deliberadamente */}
          <button
            onClick={handleSaveCopy}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white transition shadow-2xs cursor-pointer disabled:opacity-50"
            title="Guardar una copia o exportar archivo .elt.json independiente"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden xl:inline">Guardar Copia</span>
          </button>

          {/* Exportar Paquete SCORM 1.2 (.zip) para LMS */}
          <button
            onClick={handleExportScorm}
            disabled={isExportingScorm || isSaving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100/60 bg-emerald-50/80 border border-emerald-200/90 transition shadow-2xs cursor-pointer disabled:opacity-50"
            title="Exportar lección como paquete SCORM 1.2 (.zip) compatible con Moodle, Blackboard, Canvas, Chamilo"
          >
            <Package className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden xl:inline">Exportar SCORM 1.2 (.zip)</span>
            <span className="inline xl:hidden">SCORM 1.2</span>
          </button>
        </div>

        {/* Vaciar Lección Button (Only in Edit Mode when slides exist) */}
        {mode === 'edit' && lesson.slides.length > 0 && (
          <button
            onClick={() => {
              if (confirm('¿Eliminar todas las diapositivas para iniciar un libro nuevo desde cero?')) {
                clearLesson();
                setCurrentSlideId('');
              }
            }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition shadow-2xs cursor-pointer"
            title="Eliminar todas las diapositivas y empezar con lienzo en blanco"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Vaciar Lección</span>
          </button>
        )}

        {/* Live sync pill */}
        <button 
          onClick={toggleLiveSync}
          className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
            liveSyncEnabled 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
              : 'bg-slate-100 border-slate-200 text-slate-500'
          }`}
          title="Sincronización de clase en vivo"
        >
          <span className="relative flex h-2 w-2">
            {liveSyncEnabled && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${liveSyncEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
          </span>
          <Radio className="w-3.5 h-3.5" />
          <span>{liveSyncEnabled ? 'Clase Sincronizada' : 'Pausado'}</span>
        </button>

        {/* Slide Fast Reprocessing & AI Regeneration Controls */}
        {mode === 'edit' && lesson.slides.length > 0 && currentSlide && (
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
            {/* Botón Re-procesar */}
            <button
              type="button"
              disabled={!hasRawExtraction || ocrProcessing}
              onClick={() => {
                const idx = lesson.slides.findIndex((s) => s.id === currentSlide.id);
                const previousSlide = idx > 0 ? lesson.slides[idx - 1] : null;
                reprocessSlide(currentSlide, { previousSlide });
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                hasRawExtraction && !ocrProcessing
                  ? 'text-slate-700 hover:text-indigo-700 hover:bg-white shadow-2xs cursor-pointer'
                  : 'text-slate-400 cursor-not-allowed opacity-40'
              }`}
              title={
                hasRawExtraction
                  ? 'Re-procesar determinísticamente (0 tokens): re-aplica normalizaciones de TypeScript sobre el payload crudo en caché'
                  : 'Esta diapositiva no tiene datos crudos en caché. Vuelve a escanearla una vez para activar el re-procesado instantáneo'
              }
            >
              <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
              <span>Re-procesar</span>
            </button>

            {/* Botón Regenerar con IA */}
            <button
              type="button"
              disabled={!hasSourceImage || ocrProcessing}
              onClick={async () => {
                if (hasSourceImage && !ocrProcessing) {
                  await regenerateActiveSlideWithAI();
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                hasSourceImage && !ocrProcessing
                  ? 'text-indigo-700 bg-indigo-50/70 hover:bg-white hover:text-indigo-800 shadow-2xs cursor-pointer'
                  : 'text-slate-400 cursor-not-allowed opacity-40'
              }`}
              title={
                hasSourceImage
                  ? 'Regenerar con IA: re-analiza el recorte original en memoria sin requerir abrir el PDF ni recortar manualmente'
                  : 'No hay imagen de recorte guardada (_sourceImage) para regenerar con IA'
              }
            >
              {ocrProcessing ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>Regenerando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Regenerar con IA</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* OCR Modal Trigger Button */}
        <button
          onClick={toggleOcrDrawer}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition shadow-xs cursor-pointer ${
            isOcrDrawerOpen
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900'
          }`}
          title="Abrir espacio de trabajo de digitalización OCR"
        >
          <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
          <span>Transcribir Libro / OCR</span>
        </button>

        {/* Mode Switcher Pill */}
        <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center">
          <button
            onClick={() => setMode('edit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              mode === 'edit'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edición</span>
          </button>

          <button
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              mode === 'preview'
                ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Modo Alumno</span>
          </button>
        </div>

        <button 
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            alert('¡Enlace de clase sincronizada copiado al portapapeles!');
          }}
          className="hidden sm:flex items-center p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition cursor-pointer"
          title="Compartir enlace de clase"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Visual Toast Feedback for Quick Save / File Operations */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 backdrop-blur text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl border animate-bounce duration-300 ${
            toastMessage.toLowerCase().includes('no se pudo') || toastMessage.toLowerCase().includes('error')
              ? 'bg-rose-950/95 border-rose-700/80 text-rose-100'
              : 'bg-slate-900/95 border-slate-700/80 text-white'
          }`}
        >
          {toastMessage.toLowerCase().includes('no se pudo') || toastMessage.toLowerCase().includes('error') ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage}</span>
        </div>
      )}
    </header>
  );
};
