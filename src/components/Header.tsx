import React, { useState, useRef, useEffect } from 'react';
import { useLessonStore } from '../store/useLessonStore';
import { useSessionStore } from '../store/useSessionStore';
import { LessonSchema } from '../types/schema';
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
  FolderOpen
} from 'lucide-react';

export const Header: React.FC = () => {
  const { 
    lesson, 
    setLessonTitle,
    loadLesson,
    exportLesson,
    clearLesson, 
    undo, 
    redo, 
    canUndo, 
    canRedo 
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
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStartEditing = () => {
    setTempTitle(lesson.title);
    setIsEditingTitle(true);
  };

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

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawText = event.target?.result as string;
        if (!rawText) return;
        const parsedJson = JSON.parse(rawText);

        // Support direct lesson object or wrapper { lesson: ... }
        const candidate = (parsedJson && typeof parsedJson === 'object' && 'lesson' in parsedJson)
          ? parsedJson.lesson
          : parsedJson;

        if (!candidate || typeof candidate !== 'object') {
          alert('El archivo no contiene un formato de lección válido.');
          return;
        }

        const candidateWithDefaults = {
          id: candidate.id || `lesson-${Date.now()}`,
          title: candidate.title || 'Lección Importada',
          level: ['A1-A2', 'B1', 'B2', 'C1'].includes(candidate.level) ? candidate.level : 'B1',
          unit: candidate.unit || 'Unidad 1',
          slides: Array.isArray(candidate.slides) ? candidate.slides : [],
        };

        const validation = LessonSchema.safeParse(candidateWithDefaults);
        if (!validation.success) {
          console.error('Error de validación de lección:', validation.error);
          const firstIssues = validation.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('\n');
          alert(`El archivo no cumple con el esquema de lección:\n${firstIssues}`);
          return;
        }

        loadLesson(validation.data);
      } catch (err: any) {
        console.error('Error al procesar archivo de lección:', err);
        alert('Error al leer el archivo JSON: asegúrate de que sea un archivo .json o .elt.json válido.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const currentSlideIndex = lesson.slides.findIndex((s) => s.id === currentSlideId);

  const goToPrevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideId(lesson.slides[currentSlideIndex - 1].id);
    }
  };

  const goToNextSlide = () => {
    if (currentSlideIndex < lesson.slides.length - 1) {
      setCurrentSlideId(lesson.slides[currentSlideIndex + 1].id);
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
          disabled={currentSlideIndex <= 0 || lesson.slides.length === 0}
          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 transition"
          title="Diapositiva anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="text-xs font-semibold text-slate-700 px-2">
          {lesson.slides.length > 0 ? `${currentSlideIndex + 1} / ${lesson.slides.length}` : '0 / 0'}
        </span>

        <button
          onClick={goToNextSlide}
          disabled={currentSlideIndex >= lesson.slides.length - 1 || lesson.slides.length === 0}
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

        {/* File Portability Controls: Open & Export */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json,.elt.json"
            onChange={handleImportFile}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-indigo-700 hover:bg-white transition shadow-2xs cursor-pointer"
            title="Abrir y cargar lección desde archivo .elt.json"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden xl:inline">Abrir Lección</span>
            <span className="inline xl:hidden">Abrir</span>
          </button>

          <button
            onClick={exportLesson}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 hover:text-indigo-800 hover:bg-white bg-indigo-50/50 transition shadow-2xs cursor-pointer"
            title="Guardar y exportar lección en formato portable .elt.json"
          >
            <Save className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden xl:inline">Guardar / Exportar</span>
            <span className="inline xl:hidden">Exportar</span>
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
    </header>
  );
};
