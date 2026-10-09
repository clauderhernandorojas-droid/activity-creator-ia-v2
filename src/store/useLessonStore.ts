import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { 
  Lesson, 
  Slide, 
  ReferenceBlock, 
  InteractionBlock, 
  SlideLayout, 
  ExtractedBlock 
} from '../types/schema';
import { digitizeBook, createManualBlock, type ManualTemplateType } from '../core/ai/digitizeBook';
import { mapBlockToRole, convertSlideToRole, type PedagogicalRole } from '../core/ai/payloadMapper';
import { compressImageBase64 } from '../core/utils/imageCompressor';
import { stripEditorialPrefix } from '../core/text/textDeduplication';
import { useSessionStore } from './useSessionStore';
export { validateFillInBlank, type FlexibleValidationResult } from '../core/evaluators/fillBlankValidator';

export interface HistorySnapshot {
  lesson: Lesson;
  activeSlideId: string;
}

const MAX_HISTORY = 40;

let lastTextEditTime = 0;
function shouldRecordTextSnapshot(): boolean {
  const now = Date.now();
  if (now - lastTextEditTime > 600) {
    lastTextEditTime = now;
    return true;
  }
  return false;
}

export const defaultInitialSlide: Slide = {
  id: 'slide-1',
  title: 'Diapositiva 1',
  subtitle: '',
  layout: 'split_50_50',
  referenceContent: null,
  interaction: null,
  notes: '',
  isGraded: true,
};

export const defaultInitialLesson: Lesson = {
  id: 'lesson-1',
  title: 'Nueva Lección',
  level: 'B1',
  unit: 'Unidad 1',
  slides: [defaultInitialSlide],
};

export function exportLessonToFile(lesson: Lesson): void {
  const jsonContent = JSON.stringify(lesson, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const safeTitle = (lesson.title || 'Nueva_Leccion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'Nueva_Leccion';

  const fileName = `${safeTitle}.elt.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface LessonState {
  lesson: Lesson;
  activeSlideId: string;
  setActiveSlideId: (id: string) => void;
  extractedBlocks: ExtractedBlock[];
  lastExtractedPayload: ExtractedBlock[] | null;
  ocrProcessing: boolean;
  activeOcrAbortController: AbortController | null;
  cancelOcrProcessing: () => void;
  pastedImagePreview: string | null;
  pastedImages: string[];

  // History (Undo / Redo)
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Actions - Reset OCR Session
  resetOcrState: () => void;

  // Actions - Slide Structure
  addSlide: (layout?: SlideLayout) => string;
  deleteSlide: (id: string) => void;
  clearLesson: () => void;
  duplicateSlide: (id: string) => string;
  createSlideFromBlock: (
    blockId: string,
    role: PedagogicalRole
  ) => string;
  reorderSlides: (sourceIndex: number, destinationIndex: number) => void;
  updateSlideTitle: (id: string, title: string) => void;
  updateSlideSubtitle: (id: string, subtitle: string) => void;
  updateSlideLayout: (id: string, layout: SlideLayout) => void;
  updateSlideNotes: (id: string, notes: string) => void;
  updateSlideIsGraded: (id: string, isGraded: boolean) => void;

  // Actions - Block Content
  updateReferenceBlock: (slideId: string, block: ReferenceBlock | null) => void;
  updateInteractionBlock: (slideId: string, block: InteractionBlock | null) => void;
  convertSlideRole: (slideId: string, role: PedagogicalRole) => void;

  // Actions - OCR Transcription (Step 1 & 2)
  setPastedImagePreview: (url: string | null) => void;
  addPastedImage: (url: string) => void;
  removePastedImage: (index: number) => void;
  clearPastedImages: () => void;
  processPastedImages: (images?: string[], signal?: AbortSignal) => Promise<void>;
  processPastedImage: (fileOrUrl: string) => Promise<void>;
  loadPresetBookSample: (sampleIndex: number) => void;
  removeExtractedBlock: (id: string) => void;
  updateExtractedBlock: (id: string, updates: Partial<ExtractedBlock>) => void;
  restoreExtractedBlocks: () => void;
  addManualBlock: (template: ManualTemplateType) => ExtractedBlock;
  directAssignTemplate: (
    slideId: string,
    template: ManualTemplateType | 'reference_text' | 'sequence'
  ) => void;
  assignExtractedBlock: (
    slideId: string,
    blockId: string,
    role: PedagogicalRole
  ) => void;

  // Actions - Lesson Metadata & File Portability
  setLessonTitle: (title: string) => void;
  loadLesson: (lesson: Lesson) => void;
  exportLesson: () => void;
}

function recordHistory(state: LessonState): Partial<LessonState> {
  const activeSlideId = state.activeSlideId || useSessionStore.getState().currentSlideId || '';
  const snapshot: HistorySnapshot = {
    lesson: JSON.parse(JSON.stringify(state.lesson)),
    activeSlideId
  };
  const newPast = [...state.past, snapshot].slice(-MAX_HISTORY);
  return {
    past: newPast,
    future: [],
    canUndo: true,
    canRedo: false
  };
}

export const useLessonStore = create<LessonState>()(
  persist(
    (set, get) => ({
      lesson: defaultInitialLesson,
      activeSlideId: defaultInitialSlide.id,
      setActiveSlideId: (id: string) => {
        set({ activeSlideId: id });
        const sessionState = useSessionStore.getState();
        if (sessionState.currentSlideId !== id) {
          sessionState.setCurrentSlideId(id);
        }
      },
      extractedBlocks: [],
      lastExtractedPayload: null,
      ocrProcessing: false,
      activeOcrAbortController: null,
      pastedImagePreview: null,
      pastedImages: [],

      // History State
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,

      undo: () => {
        const state = get();
        if (state.past.length === 0) return;

        const previousPast = [...state.past];
        const previousSnapshot = previousPast.pop();
        if (!previousSnapshot) return;

        const currentSlideId = state.activeSlideId || useSessionStore.getState().currentSlideId || '';
        const currentSnapshot: HistorySnapshot = {
          lesson: JSON.parse(JSON.stringify(state.lesson)),
          activeSlideId: currentSlideId
        };

        const newFuture = [currentSnapshot, ...state.future].slice(0, MAX_HISTORY);
        const activeId = previousSnapshot.activeSlideId || (previousSnapshot.lesson.slides[0]?.id ?? '');

        set({
          lesson: previousSnapshot.lesson,
          activeSlideId: activeId,
          past: previousPast,
          future: newFuture,
          canUndo: previousPast.length > 0,
          canRedo: true
        });

        useSessionStore.getState().setCurrentSlideId(activeId);
      },

      redo: () => {
        const state = get();
        if (state.future.length === 0) return;

        const nextFuture = [...state.future];
        const nextSnapshot = nextFuture.shift();
        if (!nextSnapshot) return;

        const currentSlideId = state.activeSlideId || useSessionStore.getState().currentSlideId || '';
        const currentSnapshot: HistorySnapshot = {
          lesson: JSON.parse(JSON.stringify(state.lesson)),
          activeSlideId: currentSlideId
        };

        const newPast = [...state.past, currentSnapshot].slice(-MAX_HISTORY);
        const activeId = nextSnapshot.activeSlideId || (nextSnapshot.lesson.slides[0]?.id ?? '');

        set({
          lesson: nextSnapshot.lesson,
          activeSlideId: activeId,
          past: newPast,
          future: nextFuture,
          canUndo: true,
          canRedo: nextFuture.length > 0
        });

        useSessionStore.getState().setCurrentSlideId(activeId);
      },

      cancelOcrProcessing: () => {
        const controller = get().activeOcrAbortController;
        if (controller) {
          controller.abort();
        }
        set({
          ocrProcessing: false,
          activeOcrAbortController: null,
        });
      },

      resetOcrState: () => {
        const controller = get().activeOcrAbortController;
        if (controller) {
          controller.abort();
        }
        set({
          pastedImagePreview: null,
          pastedImages: [],
          extractedBlocks: [],
          lastExtractedPayload: null,
          ocrProcessing: false,
          activeOcrAbortController: null,
        });
      },

      addSlide: (layout: SlideLayout = 'split_50_50') => {
        const newId = `slide-${Date.now()}`;
        const nextNumber = get().lesson.slides.length + 1;
        const newSlide: Slide = {
          id: newId,
          title: `Diapositiva ${nextNumber}`,
          subtitle: '',
          layout,
          referenceContent: null,
          interaction: null,
          notes: '',
          isGraded: true,
        };

        set((state) => ({
          ...recordHistory(state),
          activeSlideId: newId,
          lesson: {
            ...state.lesson,
            slides: [...state.lesson.slides, newSlide],
          },
        }));

        useSessionStore.getState().setCurrentSlideId(newId);
        return newId;
      },

      deleteSlide: (id) => {
        const state = get();
        const remaining = state.lesson.slides.filter((s) => s.id !== id);
        let nextActiveId = state.activeSlideId;
        if (state.activeSlideId === id) {
          nextActiveId = remaining.length > 0 ? remaining[0].id : '';
        }
        set((s) => ({
          ...recordHistory(s),
          activeSlideId: nextActiveId,
          lesson: {
            ...s.lesson,
            slides: remaining,
          },
        }));
        useSessionStore.getState().setCurrentSlideId(nextActiveId);
      },

      clearLesson: () => {
        set((state) => ({
          ...recordHistory(state),
          activeSlideId: '',
          lesson: {
            ...state.lesson,
            slides: [],
          },
        }));
        useSessionStore.getState().setCurrentSlideId('');
      },

      setLessonTitle: (title: string) => {
        const cleaned = title.trim();
        set((state) => ({
          ...recordHistory(state),
          lesson: {
            ...state.lesson,
            title: cleaned || 'Nueva Lección',
          },
        }));
      },

      loadLesson: (importedLesson: Lesson) => {
        const slides = Array.isArray(importedLesson.slides) && importedLesson.slides.length > 0
          ? importedLesson.slides
          : [defaultInitialSlide];

        const firstSlideId = slides[0].id;

        set((state) => ({
          ...recordHistory(state),
          lesson: {
            id: importedLesson.id || `lesson-${Date.now()}`,
            title: importedLesson.title || 'Nueva Lección',
            level: importedLesson.level || 'B1',
            unit: importedLesson.unit || 'Unidad 1',
            slides,
          },
          activeSlideId: firstSlideId,
        }));

        useSessionStore.getState().setCurrentSlideId(firstSlideId);
      },

      exportLesson: () => {
        const { lesson } = get();
        exportLessonToFile(lesson);
      },

      createSlideFromBlock: (blockId, role) => {
        try {
          const state = get();
          const block = state.extractedBlocks.find((b) => b.id === blockId) || state.extractedBlocks[0];
          const newId = `slide-${Date.now()}`;
          const title = stripEditorialPrefix(block?.parsedData?.title || 'Diapositiva Digitalizada');
          const subtitle = block?.parsedData?.instruction || 'Contenido adaptado desde libro de texto';
          const isGraded = block?.parsedData?.isGraded !== undefined ? Boolean(block.parsedData.isGraded) : true;
          const mapped = block ? mapBlockToRole(block, role) : {};

          let cleanRef = mapped.reference || null;
          if (cleanRef && cleanRef.type === 'text') {
            const words = (cleanRef.content || '').trim().split(/\s+/).filter(Boolean).length;
            if (words >= 30) {
              cleanRef = {
                ...cleanRef,
                imageUrl: undefined,
                images: [],
              };
            }
          }

          const newSlide: Slide = {
            id: newId,
            title,
            subtitle,
            layout: cleanRef ? 'split_50_50' : 'single_column',
            referenceContent: cleanRef,
            interaction: mapped.interaction || null,
            cachedInteraction: mapped.interaction || null,
            notes: '',
            isGraded,
          };

          set((s) => ({
            ...recordHistory(s),
            activeSlideId: newId,
            lesson: {
              ...s.lesson,
              slides: [...s.lesson.slides, newSlide],
            },
          }));

          useSessionStore.getState().setCurrentSlideId(newId);
          return newId;
        } catch (err) {
          console.error('[useLessonStore] Error creating slide from block:', err);
          const fallbackId = `slide-${Date.now()}`;
          return fallbackId;
        }
      },

      duplicateSlide: (id) => {
        const state = get();
        const slideToDuplicate = state.lesson.slides.find((s) => s.id === id);
        if (!slideToDuplicate) return id;

        const cloneId = `slide-${Date.now()}`;
        const clonedSlide: Slide = {
          ...JSON.parse(JSON.stringify(slideToDuplicate)),
          id: cloneId,
          title: `${slideToDuplicate.title} (Copia)`,
        };

        const index = state.lesson.slides.findIndex((s) => s.id === id);
        const newSlides = [...state.lesson.slides];
        newSlides.splice(index + 1, 0, clonedSlide);

        set((s) => ({
          ...recordHistory(s),
          activeSlideId: cloneId,
          lesson: { ...s.lesson, slides: newSlides },
        }));

        useSessionStore.getState().setCurrentSlideId(cloneId);
        return cloneId;
      },

      reorderSlides: (sourceIndex: number, destinationIndex: number) => {
        set((state) => {
          const total = state.lesson.slides.length;
          if (
            sourceIndex === destinationIndex ||
            sourceIndex < 0 ||
            sourceIndex >= total ||
            destinationIndex < 0 ||
            destinationIndex >= total
          ) {
            return state;
          }

          const slides = [...state.lesson.slides];
          const [movedSlide] = slides.splice(sourceIndex, 1);
          slides.splice(destinationIndex, 0, movedSlide);

          return {
            ...recordHistory(state),
            lesson: { ...state.lesson, slides },
            activeSlideId: state.activeSlideId,
          };
        });
      },

      updateSlideTitle: (id, title) => {
        set((state) => ({
          ...(shouldRecordTextSnapshot() ? recordHistory(state) : {}),
          lesson: {
            ...state.lesson,
            slides: state.lesson.slides.map((s) => (s.id === id ? { ...s, title } : s)),
          },
        }));
      },

      updateSlideSubtitle: (id, subtitle) => {
        set((state) => ({
          ...(shouldRecordTextSnapshot() ? recordHistory(state) : {}),
          lesson: {
            ...state.lesson,
            slides: state.lesson.slides.map((s) => (s.id === id ? { ...s, subtitle } : s)),
          },
        }));
      },

      updateSlideLayout: (id, layout) => {
        set((state) => ({
          ...recordHistory(state),
          lesson: {
            ...state.lesson,
            slides: state.lesson.slides.map((s) => (s.id === id ? { ...s, layout } : s)),
          },
        }));
      },

      updateSlideNotes: (id, notes) => {
        set((state) => ({
          ...(shouldRecordTextSnapshot() ? recordHistory(state) : {}),
          lesson: {
            ...state.lesson,
            slides: state.lesson.slides.map((s) => (s.id === id ? { ...s, notes } : s)),
          },
        }));
      },

      updateSlideIsGraded: (id, isGraded) => {
        set((state) => ({
          ...recordHistory(state),
          lesson: {
            ...state.lesson,
            slides: state.lesson.slides.map((s) => (s.id === id ? { ...s, isGraded } : s)),
          },
        }));
      },

      updateReferenceBlock: (slideId, block) => {
        set((state) => ({
          ...recordHistory(state),
          lesson: {
            ...state.lesson,
            slides: state.lesson.slides.map((s) => {
              if (s.id !== slideId) return s;
              const hasRef = Boolean(block);
              return {
                ...s,
                referenceContent: block,
                layout: hasRef && s.interaction ? 'split_50_50' : 'single_column',
              };
            }),
          },
        }));
      },

      updateInteractionBlock: (slideId, block) => {
        set((state) => ({
          ...recordHistory(state),
          lesson: {
            ...state.lesson,
            slides: state.lesson.slides.map((s) =>
              s.id === slideId ? { ...s, interaction: block, cachedInteraction: block } : s
            ),
          },
        }));
      },

      convertSlideRole: (slideId, role) => {
        set((state) => {
          const slide = state.lesson.slides.find((s) => s.id === slideId);
          if (!slide) return state;

          const converted = convertSlideToRole(slide, role);
          return {
            ...recordHistory(state),
            lesson: {
              ...state.lesson,
              slides: state.lesson.slides.map((s) => (s.id === slideId ? converted : s)),
            },
          };
        });
      },

      setPastedImagePreview: (url) => {
        set({
          pastedImagePreview: url,
          pastedImages: url ? [url] : []
        });
      },

      addPastedImage: (url) => {
        if (!url) return;
        // Asynchronously compress large image data URLs to keep memory & storage lightweight
        if (url.startsWith('data:image/') && url.length > 150_000) {
          compressImageBase64(url).then((compressed) => {
            if (compressed !== url) {
              set((state) => ({
                pastedImages: state.pastedImages.map((img) => (img === url ? compressed : img)),
                pastedImagePreview: state.pastedImagePreview === url ? compressed : state.pastedImagePreview,
              }));
            }
          });
        }
        set((state) => {
          const nextImages = [...state.pastedImages, url];
          return {
            pastedImages: nextImages,
            pastedImagePreview: nextImages[0] || null
          };
        });
      },

      removePastedImage: (index) => {
        set((state) => {
          const nextImages = state.pastedImages.filter((_, i) => i !== index);
          return {
            pastedImages: nextImages,
            pastedImagePreview: nextImages[0] || null
          };
        });
      },

      clearPastedImages: () => {
        set({
          pastedImages: [],
          pastedImagePreview: null
        });
      },

      processPastedImages: async (imagesToProcess, externalSignal) => {
        const state = get();
        const images = imagesToProcess || state.pastedImages;
        if (!images || images.length === 0) return;

        if (state.activeOcrAbortController) {
          state.activeOcrAbortController.abort();
        }

        const controller = new AbortController();
        if (externalSignal) {
          externalSignal.addEventListener('abort', () => controller.abort());
          if (externalSignal.aborted) controller.abort();
        }

        set({ ocrProcessing: true, activeOcrAbortController: controller });
        try {
          const extracted = await digitizeBook(images, controller.signal);
          set({
            ocrProcessing: false,
            activeOcrAbortController: null,
            extractedBlocks: extracted,
            lastExtractedPayload: extracted
          });
        } catch (err: any) {
          if (controller.signal.aborted || err?.name === 'AbortError') {
            set({ ocrProcessing: false, activeOcrAbortController: null });
            return;
          }
          console.error('Error processing images with AI:', err);
          set({ ocrProcessing: false, activeOcrAbortController: null });
        }
      },

      processPastedImage: async (fileOrUrl) => {
        const state = get();
        const nextImages = state.pastedImages.includes(fileOrUrl)
          ? state.pastedImages
          : [...state.pastedImages, fileOrUrl];

        if (state.activeOcrAbortController) {
          state.activeOcrAbortController.abort();
        }

        const controller = new AbortController();

        set({
          pastedImages: nextImages,
          pastedImagePreview: nextImages[0] || null,
          ocrProcessing: true,
          activeOcrAbortController: controller
        });

        try {
          const extracted = await digitizeBook(
            nextImages.length > 0 ? nextImages : [fileOrUrl],
            controller.signal
          );
          set({
            ocrProcessing: false,
            activeOcrAbortController: null,
            extractedBlocks: extracted,
            lastExtractedPayload: extracted
          });
        } catch (err: any) {
          if (controller.signal.aborted || err?.name === 'AbortError') {
            set({ ocrProcessing: false, activeOcrAbortController: null });
            return;
          }
          console.error('Error processing images with AI:', err);
          set({ ocrProcessing: false, activeOcrAbortController: null });
        }
      },

      loadPresetBookSample: (_sampleIndex) => {
        // Presets removed - no-op for backward compatibility
      },

      removeExtractedBlock: (id) => {
        set((state) => ({
          extractedBlocks: state.extractedBlocks.filter((b) => b.id !== id)
        }));
      },

      updateExtractedBlock: (id, updates) => {
        set((state) => ({
          extractedBlocks: state.extractedBlocks.map((b) => {
            if (b.id !== id) return b;
            return {
              ...b,
              ...updates,
              parsedData: {
                ...b.parsedData,
                ...(updates.parsedData || {}),
              },
            };
          }),
          lastExtractedPayload: state.lastExtractedPayload
            ? state.lastExtractedPayload.map((b) => {
                if (b.id !== id) return b;
                return {
                  ...b,
                  ...updates,
                  parsedData: {
                    ...b.parsedData,
                    ...(updates.parsedData || {}),
                  },
                };
              })
            : null,
        }));
      },

      restoreExtractedBlocks: () => {
        const state = get();
        const sourceBlocks = (state.lastExtractedPayload && state.lastExtractedPayload.length > 0)
          ? state.lastExtractedPayload
          : [];

        const restored = sourceBlocks.map((b, idx) => ({
          ...JSON.parse(JSON.stringify(b)),
          id: `restored-${Date.now()}-${idx}`
        }));

        set({
          extractedBlocks: restored,
          lastExtractedPayload: restored
        });
      },

      addManualBlock: (template) => {
        const manualBlock = createManualBlock(template);
        set((state) => ({
          extractedBlocks: [manualBlock, ...state.extractedBlocks],
          lastExtractedPayload: [manualBlock, ...(state.lastExtractedPayload || [])]
        }));
        return manualBlock;
      },

      directAssignTemplate: (slideId, template) => {
        const state = get();
        if (template === 'reference_text') {
          const refBlock: ReferenceBlock = {
            type: 'text',
            id: `ref-text-${Date.now()}`,
            title: 'Manual Reading Passage',
            content: 'Enter the reading text, dialogue or grammar context here for student reference.',
            category: 'reading'
          };
          state.updateReferenceBlock(slideId, refBlock);
          return;
        }

        const manualBlock = createManualBlock(template === 'sequence' ? 'input_fields' : template);
        const role: PedagogicalRole = 
          template === 'reference_table' ? 'reference_table' :
          template === 'buckets' ? 'interaction_buckets' :
          template === 'selection' ? 'interaction_selection' :
          template === 'sequence' ? 'interaction_sequence' :
          template === 'writing' ? 'interaction_writing' : 'interaction_inputs';

        const mapped = mapBlockToRole(manualBlock, role);
        if (mapped.reference) {
          state.updateReferenceBlock(slideId, mapped.reference);
        }
        if (mapped.interaction) {
          state.updateInteractionBlock(slideId, mapped.interaction);
        }
      },

      assignExtractedBlock: (slideId, blockId, role) => {
        try {
          const state = get();
          const block = state.extractedBlocks.find((b) => b.id === blockId);
          if (!block) return;

          const mapped = mapBlockToRole(block, role);
          const isGraded = block.parsedData?.isGraded !== undefined ? Boolean(block.parsedData.isGraded) : undefined;
          const blockTitle = block.parsedData?.title;
          const blockInstruction = block.parsedData?.instruction;

          const refRaw = String(block.parsedData?.referenceContent || block.parsedData?.content || (block as any).referenceText || block.rawText || '').trim();
          const wordCount = refRaw.split(/\s+/).filter(Boolean).length;
          const isTranscribedReadingArticle = wordCount >= 30;

          const hasExplicitVisuals = Array.isArray(block.parsedData?.images) && block.parsedData.images.length > 0;

          const blockImages = (
            isTranscribedReadingArticle
              ? [] // Descartar recortes si el bloque es un artículo de lectura completo transcrito (>= 30 palabras)
              : (hasExplicitVisuals
                ? block.parsedData!.images!
                : (Array.isArray(block.sourceImages)
                  ? block.sourceImages
                  : (block.sourceImageSnippetUrl ? [block.sourceImageSnippetUrl] : [])))
          ).filter(Boolean);

          set((s) => ({
            ...recordHistory(s),
            lesson: {
              ...s.lesson,
              slides: s.lesson.slides.map((slide) => {
                if (slide.id !== slideId) return slide;
                const shouldUpdateTitle = blockTitle && (!slide.title || slide.title === 'Nueva diapositiva' || slide.title === 'Diapositiva Digitalizada');
                const shouldUpdateSubtitle = blockInstruction && (!slide.subtitle || slide.subtitle === 'Instrucción o contexto breve' || slide.subtitle === 'Contenido adaptado desde libro de texto');
                
                let refContent = mapped.reference;
                if (refContent && refContent.type === 'text') {
                  const refWords = (refContent.content || '').trim().split(/\s+/).filter(Boolean).length;
                  if (refWords >= 30) {
                    refContent = {
                      ...refContent,
                      images: [],
                      imageUrl: undefined,
                    };
                  }
                }

                if (!refContent && slide.referenceContent && slide.referenceContent.type === 'text') {
                  const currentWords = (slide.referenceContent.content || '').trim().split(/\s+/).filter(Boolean).length;
                  if (currentWords >= 30) {
                    refContent = {
                      ...slide.referenceContent,
                      images: [],
                      imageUrl: undefined,
                    };
                  } else if (blockImages.length > 0 && (!slide.referenceContent.images || slide.referenceContent.images.length === 0)) {
                    refContent = {
                      ...slide.referenceContent,
                      images: blockImages,
                      imageUrl: blockImages[0],
                    };
                  }
                }

                const nextLayout = (refContent || slide.referenceContent) && (mapped.interaction || slide.interaction)
                  ? 'split_50_50'
                  : slide.layout;

                return {
                  ...slide,
                  layout: nextLayout,
                  ...(shouldUpdateTitle ? { title: blockTitle } : {}),
                  ...(shouldUpdateSubtitle ? { subtitle: blockInstruction } : {}),
                  ...(isGraded !== undefined ? { isGraded } : {}),
                  ...(refContent ? { referenceContent: refContent } : {}),
                  ...(mapped.interaction ? { interaction: mapped.interaction, cachedInteraction: mapped.interaction } : {}),
                };
              }),
            },
          }));
        } catch (err) {
          console.error('[useLessonStore] Error assigning block to slide:', err);
        }
      },
    }),
    {
      name: 'elt-slide-builder-storage',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({
        lesson: state.lesson,
        activeSlideId: state.activeSlideId,
        // Keep structure of extractedBlocks without raw multi-megabyte base64 clippings
        extractedBlocks: state.extractedBlocks.map((b) => ({
          ...b,
          sourceImages: undefined,
          sourceImageSnippetUrl: undefined,
        })),
        lastExtractedPayload: undefined,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const validSlideId = state.lesson.slides.some((s) => s.id === state.activeSlideId)
            ? state.activeSlideId
            : (state.lesson.slides[0]?.id ?? '');
          if (validSlideId !== state.activeSlideId) {
            state.activeSlideId = validSlideId;
          }
          useSessionStore.getState().setCurrentSlideId(validSlideId);
        }
      },
    }
  )
);

/**
 * Defensive localStorage adapter that absorbs QuotaExceededError and prevents runtime crashes.
 */
const safeLocalStorage = {
  getItem: (name: string): string | null => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(name);
    } catch (e) {
      console.warn('[Storage] Error reading from localStorage:', e);
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(name, value);
    } catch (e: any) {
      console.warn('[Storage] QuotaExceededError or write failure in localStorage. Continuing safely in memory:', e);
      try {
        // Recovery strategy: prune heavy transient cache and re-attempt write
        const parsed = JSON.parse(value);
        if (parsed?.state) {
          if (parsed.state.extractedBlocks) {
            parsed.state.extractedBlocks = [];
          }
          if (parsed.state.lastExtractedPayload) {
            parsed.state.lastExtractedPayload = undefined;
          }
          window.localStorage.setItem(name, JSON.stringify(parsed));
          console.info('[Storage] Successfully preserved lesson state by pruning transient OCR cache.');
        }
      } catch {
        // Safe no-op: memory state remains 100% active and healthy!
      }
    }
  },
  removeItem: (name: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(name);
    } catch (e) {
      console.warn('[Storage] Error removing from localStorage:', e);
    }
  },
};
