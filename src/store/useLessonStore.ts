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
    role: 'reference_text' | 'reference_table' | 'interaction_inputs' | 'interaction_selection' | 'interaction_buckets' | 'interaction_sequence'
  ) => string;
  reorderSlides: (startIndex: number, endIndex: number) => void;
  updateSlideTitle: (id: string, title: string) => void;
  updateSlideSubtitle: (id: string, subtitle: string) => void;
  updateSlideLayout: (id: string, layout: SlideLayout) => void;
  updateSlideNotes: (id: string, notes: string) => void;

  // Actions - Block Content
  updateReferenceBlock: (slideId: string, block: ReferenceBlock | null) => void;
  updateInteractionBlock: (slideId: string, block: InteractionBlock | null) => void;
  convertSlideRole: (slideId: string, role: PedagogicalRole) => void;

  // Actions - OCR Transcription (Step 1 & 2)
  setPastedImagePreview: (url: string | null) => void;
  addPastedImage: (url: string) => void;
  removePastedImage: (index: number) => void;
  clearPastedImages: () => void;
  processPastedImages: (images?: string[]) => Promise<void>;
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
    role: 'reference_text' | 'reference_table' | 'interaction_inputs' | 'interaction_selection' | 'interaction_buckets' | 'interaction_sequence'
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

      resetOcrState: () => {
        set({
          pastedImagePreview: null,
          pastedImages: [],
          extractedBlocks: [],
          lastExtractedPayload: null
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
        const state = get();
        const block = state.extractedBlocks.find((b) => b.id === blockId) || state.extractedBlocks[0];
        const newId = `slide-${Date.now()}`;
        const title = block?.parsedData?.title || 'Diapositiva Digitalizada';
        const subtitle = block?.parsedData?.instruction || 'Contenido adaptado desde libro de texto';
        const mapped = block ? mapBlockToRole(block, role) : {};

        const newSlide: Slide = {
          id: newId,
          title,
          subtitle,
          layout: 'split_50_50',
          referenceContent: mapped.reference || null,
          interaction: mapped.interaction || null,
          notes: '',
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

      reorderSlides: (startIndex, endIndex) => {
        set((state) => {
          const slides = [...state.lesson.slides];
          const [removed] = slides.splice(startIndex, 1);
          slides.splice(endIndex, 0, removed);
          return {
            ...recordHistory(state),
            lesson: { ...state.lesson, slides },
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

      updateReferenceBlock: (slideId, block) => {
        set((state) => ({
          ...recordHistory(state),
          lesson: {
            ...state.lesson,
            slides: state.lesson.slides.map((s) =>
              s.id === slideId ? { ...s, referenceContent: block } : s
            ),
          },
        }));
      },

      updateInteractionBlock: (slideId, block) => {
        set((state) => ({
          ...recordHistory(state),
          lesson: {
            ...state.lesson,
            slides: state.lesson.slides.map((s) =>
              s.id === slideId ? { ...s, interaction: block } : s
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

      processPastedImages: async (imagesToProcess) => {
        const state = get();
        const images = imagesToProcess || state.pastedImages;
        if (!images || images.length === 0) return;

        set({ ocrProcessing: true });
        try {
          const extracted = await digitizeBook(images);
          set({
            ocrProcessing: false,
            extractedBlocks: extracted,
            lastExtractedPayload: extracted
          });
        } catch (err) {
          console.error('Error processing images with AI:', err);
          set({ ocrProcessing: false });
        }
      },

      processPastedImage: async (fileOrUrl) => {
        const state = get();
        const nextImages = state.pastedImages.includes(fileOrUrl)
          ? state.pastedImages
          : [...state.pastedImages, fileOrUrl];

        set({
          pastedImages: nextImages,
          pastedImagePreview: nextImages[0] || null,
          ocrProcessing: true
        });

        try {
          const extracted = await digitizeBook(nextImages.length > 0 ? nextImages : [fileOrUrl]);
          set({
            ocrProcessing: false,
            extractedBlocks: extracted,
            lastExtractedPayload: extracted
          });
        } catch (err) {
          console.error('Error processing images with AI:', err);
          set({ ocrProcessing: false });
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
          template === 'sequence' ? 'interaction_sequence' : 'interaction_inputs';

        const mapped = mapBlockToRole(manualBlock, role);
        if (mapped.reference) {
          state.updateReferenceBlock(slideId, mapped.reference);
        }
        if (mapped.interaction) {
          state.updateInteractionBlock(slideId, mapped.interaction);
        }
      },

      assignExtractedBlock: (slideId, blockId, role) => {
        const state = get();
        const block = state.extractedBlocks.find((b) => b.id === blockId);
        if (!block) return;

        const mapped = mapBlockToRole(block, role);
        set((s) => ({
          ...recordHistory(s),
          lesson: {
            ...s.lesson,
            slides: s.lesson.slides.map((slide) => {
              if (slide.id !== slideId) return slide;
              return {
                ...slide,
                ...(mapped.reference ? { referenceContent: mapped.reference } : {}),
                ...(mapped.interaction ? { interaction: mapped.interaction } : {}),
              };
            }),
          },
        }));
      },
    }),
    {
      name: 'elt-slide-builder-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        lesson: state.lesson,
        activeSlideId: state.activeSlideId,
        extractedBlocks: state.extractedBlocks,
        lastExtractedPayload: state.lastExtractedPayload,
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
