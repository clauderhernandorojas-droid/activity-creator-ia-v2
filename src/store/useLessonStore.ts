import { create } from 'zustand';
import type { 
  Lesson, 
  Slide, 
  ReferenceBlock, 
  InteractionBlock, 
  SlideLayout, 
  ExtractedBlock 
} from '../types/schema';
import { initialLesson, sampleExtractedBlocks } from '../data/sampleData';
import { digitizeBook, createManualBlock, type ManualTemplateType } from '../core/ai/digitizeBook';
import { mapBlockToRole, type PedagogicalRole } from '../core/ai/payloadMapper';
import { useSessionStore } from './useSessionStore';

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

interface LessonState {
  lesson: Lesson;
  extractedBlocks: ExtractedBlock[];
  lastExtractedPayload: ExtractedBlock[] | null;
  ocrProcessing: boolean;
  pastedImagePreview: string | null;

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

  // Actions - OCR Transcription (Step 1 & 2)
  setPastedImagePreview: (url: string | null) => void;
  processPastedImage: (fileOrUrl: string) => Promise<void>;
  loadPresetBookSample: (sampleIndex: number) => void;
  removeExtractedBlock: (id: string) => void;
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
}

function recordHistory(state: LessonState): Partial<LessonState> {
  const activeSlideId = useSessionStore.getState().currentSlideId || '';
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

export const useLessonStore = create<LessonState>((set, get) => ({
  lesson: initialLesson,
  extractedBlocks: sampleExtractedBlocks,
  lastExtractedPayload: sampleExtractedBlocks,
  ocrProcessing: false,
  pastedImagePreview: null,

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

    const currentSlideId = useSessionStore.getState().currentSlideId || '';
    const currentSnapshot: HistorySnapshot = {
      lesson: JSON.parse(JSON.stringify(state.lesson)),
      activeSlideId: currentSlideId
    };

    const newFuture = [currentSnapshot, ...state.future].slice(0, MAX_HISTORY);

    set({
      lesson: previousSnapshot.lesson,
      past: previousPast,
      future: newFuture,
      canUndo: previousPast.length > 0,
      canRedo: true
    });

    if (previousSnapshot.activeSlideId) {
      useSessionStore.getState().setCurrentSlideId(previousSnapshot.activeSlideId);
    } else if (previousSnapshot.lesson.slides.length > 0) {
      useSessionStore.getState().setCurrentSlideId(previousSnapshot.lesson.slides[0].id);
    } else {
      useSessionStore.getState().setCurrentSlideId('');
    }
  },

  redo: () => {
    const state = get();
    if (state.future.length === 0) return;

    const nextFuture = [...state.future];
    const nextSnapshot = nextFuture.shift();
    if (!nextSnapshot) return;

    const currentSlideId = useSessionStore.getState().currentSlideId || '';
    const currentSnapshot: HistorySnapshot = {
      lesson: JSON.parse(JSON.stringify(state.lesson)),
      activeSlideId: currentSlideId
    };

    const newPast = [...state.past, currentSnapshot].slice(-MAX_HISTORY);

    set({
      lesson: nextSnapshot.lesson,
      past: newPast,
      future: nextFuture,
      canUndo: true,
      canRedo: nextFuture.length > 0
    });

    if (nextSnapshot.activeSlideId) {
      useSessionStore.getState().setCurrentSlideId(nextSnapshot.activeSlideId);
    } else if (nextSnapshot.lesson.slides.length > 0) {
      useSessionStore.getState().setCurrentSlideId(nextSnapshot.lesson.slides[0].id);
    } else {
      useSessionStore.getState().setCurrentSlideId('');
    }
  },

  resetOcrState: () => {
    set({
      pastedImagePreview: null,
      extractedBlocks: [],
      lastExtractedPayload: null
    });
  },

  addSlide: (layout = 'split_50_50') => {
    const newId = `slide-${Date.now()}`;
    const newSlide: Slide = {
      id: newId,
      title: 'New ELT Activity Slide',
      subtitle: 'Click to edit subtitle or add textbook instructions',
      layout,
      referenceContent: {
        type: 'text',
        id: `ref-${Date.now()}`,
        title: 'Grammar or Reading Reference',
        content: 'Enter reading passage, context dialogue or grammar rule here.',
        category: 'grammar_note',
      },
      interaction: {
        type: 'input_fields',
        id: `inter-${Date.now()}`,
        instruction: 'Complete the sentences with the correct grammatical form:',
        layoutMode: 'list',
        listItems: [
          {
            id: `item-1`,
            prompt: 'She _______ (work) in London since 2015.',
            acceptedAnswers: ['has worked', 'has been working'],
            hint: 'Use present perfect'
          }
        ],
        tableHeaders: [],
        tableRows: [],
        paragraphTemplate: '',
        paragraphInputs: {}
      },
    };

    set((state) => ({
      ...recordHistory(state),
      lesson: {
        ...state.lesson,
        slides: [...state.lesson.slides, newSlide],
      },
    }));

    return newId;
  },

  deleteSlide: (id) => {
    set((state) => ({
      ...recordHistory(state),
      lesson: {
        ...state.lesson,
        slides: state.lesson.slides.filter((s) => s.id !== id),
      },
    }));
  },

  clearLesson: () => {
    set((state) => ({
      ...recordHistory(state),
      lesson: {
        ...state.lesson,
        slides: [],
      },
    }));
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
    };

    set((s) => ({
      ...recordHistory(s),
      lesson: {
        ...s.lesson,
        slides: [...s.lesson.slides, newSlide],
      },
    }));

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
      title: `${slideToDuplicate.title} (Copy)`,
    };

    const index = state.lesson.slides.findIndex((s) => s.id === id);
    const newSlides = [...state.lesson.slides];
    newSlides.splice(index + 1, 0, clonedSlide);

    set((s) => ({
      ...recordHistory(s),
      lesson: { ...s.lesson, slides: newSlides },
    }));

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

  setPastedImagePreview: (url) => {
    set({ pastedImagePreview: url });
  },

  processPastedImage: async (fileOrUrl) => {
    set({ ocrProcessing: true, pastedImagePreview: fileOrUrl });
    try {
      const extracted = await digitizeBook(fileOrUrl);
      set({
        ocrProcessing: false,
        extractedBlocks: extracted,
        lastExtractedPayload: extracted
      });
    } catch (err) {
      console.error('Error processing image with AI:', err);
      set({ ocrProcessing: false });
    }
  },

  loadPresetBookSample: (sampleIndex) => {
    const block = sampleExtractedBlocks[sampleIndex % sampleExtractedBlocks.length];
    if (block) {
      const cloned = { ...block, id: `ext-clone-${Date.now()}` };
      set((state) => ({
        extractedBlocks: [cloned, ...state.extractedBlocks],
        lastExtractedPayload: [cloned, ...(state.lastExtractedPayload || [])]
      }));
    }
  },

  removeExtractedBlock: (id) => {
    set((state) => ({
      extractedBlocks: state.extractedBlocks.filter((b) => b.id !== id)
    }));
  },

  restoreExtractedBlocks: () => {
    const state = get();
    const sourceBlocks = (state.lastExtractedPayload && state.lastExtractedPayload.length > 0)
      ? state.lastExtractedPayload
      : sampleExtractedBlocks;

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
}));
