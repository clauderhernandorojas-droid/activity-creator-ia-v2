import React, { useMemo } from 'react';
import { useSessionStore } from '../../store/useSessionStore';
import { useLessonStore } from '../../store/useLessonStore';
import { REFERENCE_RENDERER_REGISTRY } from '../renderers/registry';
import { StructuredReferenceRenderer } from '../renderers/StructuredReferenceRenderer';
import { TextReferenceRenderer } from '../renderers/TextReferenceRenderer';
import { SlideErrorBoundary } from '../common/SlideErrorBoundary';
import { BookOpen, X } from 'lucide-react';
import { parseHierarchicalReference, parseStructuredReferenceColumns } from '../../core/ai/payloadMapper';
import type { ReferenceBlock, StructuredReferenceBlock } from '../../types/schema';

export const ReferenceDrawer: React.FC = () => {
  const { currentSlideId, isReferenceDrawerOpen, setIsReferenceDrawerOpen, mode } = useSessionStore();
  const { lesson, updateReferenceBlock } = useLessonStore();

  const currentSlide = lesson.slides.find((s) => s.id === currentSlideId);
  const rawReference = currentSlide?.referenceContent;

  const effectiveReference: ReferenceBlock | null = useMemo(() => {
    if (!rawReference) return null;
    if (rawReference.type === 'reference_table' || rawReference.type === 'table_reference' || rawReference.type === 'media') {
      return rawReference;
    }
    const rawText = typeof (rawReference as any).content === 'string'
      ? (rawReference as any).content
      : Array.isArray((rawReference as any).paragraphs)
      ? (rawReference as any).paragraphs.join('\n\n')
      : typeof (rawReference as any).rawText === 'string'
      ? (rawReference as any).rawText
      : '';

    if (rawText && rawText.trim().length > 0) {
      const parsedHierarchical = parseHierarchicalReference(rawText);
      const parsedCols = parseStructuredReferenceColumns(rawText);
      const validClusters = parsedCols.filter(
        (col) => col && Array.isArray(col.items) && col.items.length > 0
      );
      if (validClusters.length >= 2) {
        const promoted: StructuredReferenceBlock = {
          type: 'reference_table',
          id: rawReference.id,
          title: parsedHierarchical.title || rawReference.title || currentSlide?.title || 'Cuadro de Referencia',
          instruction: (rawReference as any).instruction || '',
          columns: validClusters,
        };
        return promoted;
      }
    }
    return rawReference;
  }, [rawReference, currentSlide?.title]);

  if (!isReferenceDrawerOpen || !effectiveReference || !currentSlide) return null;

  const Renderer: React.ComponentType<any> = effectiveReference.type === 'reference_table'
    ? StructuredReferenceRenderer
    : (REFERENCE_RENDERER_REGISTRY[effectiveReference.type] || TextReferenceRenderer);
  const isEditMode = mode === 'edit';

  const getDrawerTitle = () => {
    switch (effectiveReference.type) {
      case 'reference_table':
        return 'Cuadro de Vocabulario / Consulta';
      case 'table_reference':
        return 'Tabla Gramatical de Consulta';
      case 'media':
        return effectiveReference.mediaType === 'image'
          ? 'Material Visual de Consulta'
          : 'Audio y Transcripción (Listening)';
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
                block={effectiveReference as any}
                isEditMode={isEditMode}
                onChange={(updated: any) => updateReferenceBlock(currentSlide.id, updated)}
              />
            ) : (
              <p className="text-xs text-slate-500">
                Tipo de referencia no reconocido: {effectiveReference.type}
              </p>
            )}
          </SlideErrorBoundary>
        </div>
      </aside>
    </>
  );
};
