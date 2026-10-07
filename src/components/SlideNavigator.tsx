import React from 'react';
import { useLessonStore } from '../store/useLessonStore';
import { useSessionStore } from '../store/useSessionStore';
import { 
  Plus, 
  Trash2, 
  Copy, 
  ChevronUp, 
  ChevronDown, 
  PenTool, 
  CheckSquare, 
  FolderGit2, 
  ListOrdered,
  BookText
} from 'lucide-react';
import type { Slide } from '../types/schema';

export const SlideNavigator: React.FC = () => {
  const { 
    lesson, 
    addSlide, 
    deleteSlide, 
    clearLesson,
    duplicateSlide, 
    reorderSlides 
  } = useLessonStore();

  const { 
    currentSlideId, 
    setCurrentSlideId 
  } = useSessionStore();

  const handleAddSlide = () => {
    const newId = addSlide('single_column');
    setCurrentSlideId(newId);
  };

  const handleDuplicate = (id: string) => {
    const cloneId = duplicateSlide(id);
    setCurrentSlideId(cloneId);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar esta diapositiva?')) {
      const remainingSlides = lesson.slides.filter((s) => s.id !== id);
      deleteSlide(id);
      if (currentSlideId === id) {
        setCurrentSlideId(remainingSlides.length > 0 ? remainingSlides[0].id : '');
      }
    }
  };

  const handleClearLesson = () => {
    if (confirm('¿Eliminar todas las diapositivas para iniciar un libro nuevo desde cero?')) {
      clearLesson();
      setCurrentSlideId('');
    }
  };

  const getInteractionIcon = (slide: Slide) => {
    if (!slide.interaction) {
      return <BookText className="w-3.5 h-3.5 text-slate-400" />;
    }
    switch (slide.interaction.type) {
      case 'input_fields':
        return <PenTool className="w-3.5 h-3.5 text-blue-600" />;
      case 'selection':
        return <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />;
      case 'buckets_matching':
        return <FolderGit2 className="w-3.5 h-3.5 text-amber-600" />;
      case 'sequence':
        return <ListOrdered className="w-3.5 h-3.5 text-purple-600" />;
    }
  };

  const getInteractionLabel = (slide: Slide) => {
    if (!slide.interaction) return 'Referencia';
    switch (slide.interaction.type) {
      case 'input_fields':
        return 'Rellenar';
      case 'selection':
        return 'Selección';
      case 'buckets_matching':
        return 'Buckets';
      case 'sequence':
        return 'Secuencia';
    }
  };

  return (
    <aside className="w-60 bg-slate-50 border-r border-slate-200/90 flex flex-col h-[calc(100vh-4rem)] sticky top-16 shrink-0 select-none z-10">
      {/* Top Bar */}
      <div className="p-3 border-b border-slate-200/90 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Diapositivas ({lesson.slides.length})
        </span>
        <button
          onClick={handleAddSlide}
          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
          title="Añadir nueva diapositiva"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nueva</span>
        </button>
      </div>

      {/* Slide Thumbnails List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {lesson.slides.map((slide, idx) => {
          const isSelected = slide.id === currentSlideId;

          return (
            <div
              key={slide.id}
              onClick={() => setCurrentSlideId(slide.id)}
              className={`group relative rounded-xl p-2.5 cursor-pointer transition-all border text-left ${
                isSelected
                  ? 'bg-white border-indigo-400 shadow-sm ring-1 ring-indigo-400/40'
                  : 'bg-white/80 border-slate-200/90 hover:border-slate-300 hover:bg-white'
              }`}
            >
              {/* Header inside thumbnail card */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                    {getInteractionIcon(slide)}
                    <span className="truncate max-w-[80px]">{getInteractionLabel(slide)}</span>
                  </div>
                </div>

                {slide.isGraded === false && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200" title="Actividad no calificable / encuesta personal">
                    Encuesta
                  </span>
                )}
              </div>

              {/* Title preview */}
              <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug">
                {slide.title || 'Diapositiva sin título'}
              </p>

              {/* Quick Actions (Duplicate, Reorder, Delete) */}
              <div className={`mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between ${
                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              } transition-opacity`}>
                <div className="flex items-center gap-0.5">
                  <button
                    disabled={idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      reorderSlides(idx, idx - 1);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 rounded hover:bg-slate-100"
                    title="Mover arriba"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    disabled={idx === lesson.slides.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      reorderSlides(idx, idx + 1);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 rounded hover:bg-slate-100"
                    title="Mover abajo"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center gap-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicate(slide.id);
                    }}
                    className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100"
                    title="Duplicar diapositiva"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(slide.id);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition"
                    title="Eliminar diapositiva"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {lesson.slides.length === 0 && (
          <div className="py-8 px-2 text-center text-slate-400 space-y-3">
            <p className="text-xs">Sin diapositivas activas</p>
            <button
              onClick={handleAddSlide}
              className="w-full py-2 px-3 bg-white border border-slate-200 hover:border-indigo-300 text-indigo-600 text-xs font-semibold rounded-xl shadow-2xs transition"
            >
              + Crear Diapositiva
            </button>
          </div>
        )}
      </div>

      {/* Bottom Footer: Vaciar Lección */}
      {lesson.slides.length > 0 && (
        <div className="p-2.5 border-t border-slate-200/90 bg-slate-50/80">
          <button
            onClick={handleClearLesson}
            className="w-full py-1.5 px-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
            title="Eliminar todas las diapositivas y empezar con lienzo en blanco"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Vaciar Lección</span>
          </button>
        </div>
      )}
    </aside>
  );
};
