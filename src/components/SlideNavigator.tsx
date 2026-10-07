import React, { useState, useEffect } from 'react';
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
  BookText,
  GripVertical
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

  // Inline confirmation states
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  // Drag and drop states
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Auto-dismiss confirmation timers after 5 seconds of inactivity
  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => {
      setConfirmDeleteId(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  useEffect(() => {
    if (!confirmClearAll) return;
    const timer = setTimeout(() => {
      setConfirmClearAll(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [confirmClearAll]);

  const handleAddSlide = () => {
    const newId = addSlide('single_column');
    setCurrentSlideId(newId);
  };

  const handleDuplicate = (id: string) => {
    const cloneId = duplicateSlide(id);
    setCurrentSlideId(cloneId);
  };

  const executeDelete = (id: string) => {
    const remainingSlides = lesson.slides.filter((s) => s.id !== id);
    deleteSlide(id);
    if (currentSlideId === id) {
      setCurrentSlideId(remainingSlides.length > 0 ? remainingSlides[0].id : '');
    }
    setConfirmDeleteId(null);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (confirmDeleteId) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (index: number) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      reorderSlides(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
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
          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
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
          const isDragging = draggedIndex === idx;
          const isDragOver = dragOverIndex === idx && draggedIndex !== idx;
          const isConfirmingDelete = confirmDeleteId === slide.id;

          return (
            <div
              key={slide.id}
              draggable={!isConfirmingDelete}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragLeave={() => handleDragLeave(idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              onClick={() => {
                if (!isConfirmingDelete) {
                  setCurrentSlideId(slide.id);
                }
              }}
              className={`group relative rounded-xl p-2.5 transition-all border text-left cursor-pointer ${
                isDragging
                  ? 'opacity-30 scale-[0.98] border-dashed border-indigo-400 bg-indigo-50/40'
                  : isDragOver
                    ? 'border-indigo-500 ring-2 ring-indigo-400 bg-indigo-50/70 shadow-md scale-[1.01]'
                    : isSelected
                      ? 'bg-white border-indigo-400 shadow-sm ring-1 ring-indigo-400/40'
                      : 'bg-white/80 border-slate-200/90 hover:border-slate-300 hover:bg-white'
              }`}
            >
              {/* Contextual Inline Delete Confirmation Overlay */}
              {isConfirmingDelete && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-0 bg-rose-50/95 backdrop-blur-[2px] rounded-xl p-2 flex flex-col justify-between z-20 border border-rose-300 shadow-sm animate-in fade-in duration-150"
                >
                  <div className="flex items-center gap-1.5 text-rose-800 text-[11px] font-bold">
                    <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>¿Eliminar diapositiva?</span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 mt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        executeDelete(slide.id);
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-2xs transition cursor-pointer"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {/* Header inside thumbnail card */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <div 
                    className="text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing transition-colors"
                    title="Arrastra para reordenar"
                  >
                    <GripVertical className="w-3 h-3" />
                  </div>
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
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 rounded hover:bg-slate-100 cursor-pointer"
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
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 rounded hover:bg-slate-100 cursor-pointer"
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
                    className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 cursor-pointer"
                    title="Duplicar diapositiva"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(slide.id);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition cursor-pointer"
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
              className="w-full py-2 px-3 bg-white border border-slate-200 hover:border-indigo-300 text-indigo-600 text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer"
            >
              + Crear Diapositiva
            </button>
          </div>
        )}
      </div>

      {/* Bottom Footer: Vaciar Lección */}
      {lesson.slides.length > 0 && (
        <div className="p-2.5 border-t border-slate-200/90 bg-slate-50/80">
          {confirmClearAll ? (
            <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 flex flex-col gap-1.5 animate-in fade-in duration-150">
              <p className="text-[11px] font-bold text-rose-800 text-center">
                ¿Vaciar toda la lección?
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200/50 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearLesson();
                    setCurrentSlideId('');
                    setConfirmClearAll(false);
                  }}
                  className="px-2.5 py-0.5 text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-2xs cursor-pointer"
                >
                  Sí, vaciar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClearAll(true)}
              className="w-full py-1.5 px-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              title="Eliminar todas las diapositivas y empezar con lienzo en blanco"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Vaciar Lección</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
};
