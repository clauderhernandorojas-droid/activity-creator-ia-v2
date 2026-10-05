import React from 'react';
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
  Redo2
} from 'lucide-react';

export const Header: React.FC = () => {
  const { 
    lesson, 
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
            <h1 className="text-sm font-semibold text-slate-900 truncate max-w-[240px] sm:max-w-xs md:max-w-md">
              {lesson.title}
            </h1>
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

        {/* Vaciar Lección Button (Only in Edit Mode when slides exist) */}
        {mode === 'edit' && lesson.slides.length > 0 && (
          <button
            onClick={() => {
              if (confirm('¿Eliminar todas las diapositivas para iniciar un libro nuevo desde cero?')) {
                clearLesson();
                setCurrentSlideId('');
              }
            }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition shadow-2xs"
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
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition shadow-xs ${
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
          className="hidden sm:flex items-center p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
          title="Compartir enlace de clase"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
