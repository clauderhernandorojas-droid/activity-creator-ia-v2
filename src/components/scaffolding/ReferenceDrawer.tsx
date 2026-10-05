import React from 'react';
import { useSessionStore } from '../../store/useSessionStore';
import { useLessonStore } from '../../store/useLessonStore';
import { REFERENCE_RENDERER_REGISTRY } from '../renderers/registry';
import { SlideErrorBoundary } from '../common/SlideErrorBoundary';
import { BookOpen, X } from 'lucide-react';

export const ReferenceDrawer: React.FC = () => {
  const { currentSlideId, isReferenceDrawerOpen, setIsReferenceDrawerOpen, mode } = useSessionStore();
  const { lesson, updateReferenceBlock } = useLessonStore();

  const currentSlide = lesson.slides.find((s) => s.id === currentSlideId);
  const reference = currentSlide?.referenceContent;

  if (!isReferenceDrawerOpen || !reference) return null;

  const Renderer = REFERENCE_RENDERER_REGISTRY[reference.type];
  const isEditMode = mode === 'edit';

  const getDrawerTitle = () => {
    switch (reference.type) {
      case 'table_reference':
        return 'Tabla Gramatical de Consulta';
      case 'media':
        return 'Audio y Transcripción (Listening)';
      default:
        return 'Lectura y Contexto';
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setIsReferenceDrawerOpen(false)}
        className="fixed inset-0 bg-slate-900/25 backdrop-blur-xs z-30 transition-opacity"
      />

      {/* Slide-over Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[540px] md:w-[620px] bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200 select-none">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {getDrawerTitle()}
              </h3>
              <p className="text-[11px] text-slate-500">
                Material de andamiaje pedagógico y consulta
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsReferenceDrawerOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
            title="Cerrar cajón de consulta"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Renderer Body wrapped in Error Boundary */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/40">
          <SlideErrorBoundary fallbackTitle="Error al cargar el material de consulta">
            {Renderer ? (
              <Renderer
                block={reference}
                isEditMode={isEditMode}
                onChange={(updated: any) => updateReferenceBlock(currentSlide.id, updated)}
              />
            ) : (
              <p className="text-xs text-slate-500">
                Tipo de referencia no reconocido: {reference.type}
              </p>
            )}
          </SlideErrorBoundary>
        </div>
      </aside>
    </>
  );
};
