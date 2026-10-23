import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { 
  type Lesson, 
  type Slide, 
  type ReferenceBlock, 
  type InteractionBlock, 
  type SlideLayout, 
  type ExtractedBlock,
  LessonSchema
} from '../types/schema';
import { digitizeBook, validateAndParseSlides, createManualBlock, roleToForcedTargetType, type ManualTemplateType } from '../core/ai/digitizeBook';
import { convertSlideToRole, type PedagogicalRole } from '../core/utils/slideRoleConverter';
import { compressImageBase64 } from '../core/utils/imageCompressor';
import { useSessionStore } from './useSessionStore';
import { exportScormPackage } from '../core/scorm/exportScormPackage';
export { validateFillInBlank, type FlexibleValidationResult } from '../core/evaluators/fillBlankValidator';

declare global {
  interface Window {
    showOpenFilePicker?: (options?: {
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
      multiple?: boolean;
      excludeAcceptAllOption?: boolean;
    }) => Promise<FileSystemFileHandle[]>;

    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
      excludeAcceptAllOption?: boolean;
    }) => Promise<FileSystemFileHandle>;
  }
}

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

export async function downloadScormPackage(lesson: Lesson): Promise<void> {
  const blob = await exportScormPackage(lesson);
  const safeTitle = (lesson.title || 'Leccion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'Leccion';

  const fileName = `${safeTitle}_SCORM1.2.zip`;
  const url = URL.createObjectURL(blob);
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
  ocrError: string | null;
  clearOcrError: () => void;
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
    role?: PedagogicalRole
  ) => string;
  createSlidesFromAllBlocks: () => string[];
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
  reExtractBlockWithRole: (blockId: string, role: PedagogicalRole) => Promise<void>;
  reExtractSlideWithRole: (slideId: string, role: PedagogicalRole, clipUrl?: string) => Promise<void>;
  reprocessActiveSlide: () => boolean;
  regenerateActiveSlideWithAI: () => Promise<boolean>;

  // File System Access API & File Portability
  currentFileHandle: FileSystemFileHandle | null;
  setCurrentFileHandle: (handle: FileSystemFileHandle | null) => void;
  saveFeedback: { message: string; timestamp: number } | null;
  clearSaveFeedback: () => void;
  saveLesson: () => Promise<boolean>;
  saveLessonAs: () => Promise<boolean>;
  openLessonWithPicker: () => Promise<boolean>;

  // Actions - Lesson Metadata & File Portability
  setLessonTitle: (title: string) => void;
  loadLesson: (lesson: Lesson, fileHandle?: FileSystemFileHandle | null) => void;
  exportLesson: () => void;
  exportLessonAsScorm: () => Promise<boolean>;
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
      ocrError: null,
      clearOcrError: () => set({ ocrError: null }),
      pastedImagePreview: null,
      pastedImages: [],
      currentFileHandle: null,
      setCurrentFileHandle: (handle) => set({ currentFileHandle: handle }),
      saveFeedback: null,
      clearSaveFeedback: () => set({ saveFeedback: null }),

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
          ocrError: null,
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
          ocrError: null,
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
          currentFileHandle: null,
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

      loadLesson: (importedLesson: Lesson, fileHandle?: FileSystemFileHandle | null) => {
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
          currentFileHandle: fileHandle !== undefined ? fileHandle : state.currentFileHandle,
        }));

        useSessionStore.getState().setCurrentSlideId(firstSlideId);
      },

      saveLesson: async () => {
        const { lesson, currentFileHandle } = get();
        const jsonContent = JSON.stringify(lesson, null, 2);

        // 1. Quick Save: Sobrescritura directa si currentFileHandle existe
        if (currentFileHandle) {
          try {
            const handleAny = currentFileHandle as any;
            if (typeof handleAny.queryPermission === 'function') {
              const perm = await handleAny.queryPermission({ mode: 'readwrite' });
              if (perm !== 'granted') {
                if (typeof handleAny.requestPermission === 'function') {
                  const req = await handleAny.requestPermission({ mode: 'readwrite' });
                  if (req !== 'granted') {
                    throw new Error('Permiso de escritura denegado');
                  }
                }
              }
            }
            const writable = await currentFileHandle.createWritable();
            await writable.write(jsonContent);
            await writable.close();

            set({
              saveFeedback: {
                message: `Guardado en ${currentFileHandle.name}`,
                timestamp: Date.now(),
              },
            });
            return true;
          } catch (err: any) {
            if (err?.name === 'AbortError') return false;
            console.warn('[useLessonStore] Error al sobrescribir archivo vinculado, solicitando ubicación:', err);
          }
        }

        // 2. Si no hay handle o falló la sobrescritura, invocar showSaveFilePicker
        if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
          try {
            const safeTitle = (lesson.title || 'lesson')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-zA-Z0-9_-]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '') || 'lesson';

            const handle = await window.showSaveFilePicker({
              suggestedName: `${safeTitle}.elt.json`,
              types: [
                {
                  description: 'ELT Lesson JSON',
                  accept: {
                    'application/json': ['.json', '.elt.json'],
                  },
                },
              ],
            });

            const writable = await handle.createWritable();
            await writable.write(jsonContent);
            await writable.close();

            set({
              currentFileHandle: handle,
              saveFeedback: {
                message: `Guardado en ${handle.name}`,
                timestamp: Date.now(),
              },
            });
            return true;
          } catch (err: any) {
            if (err?.name === 'AbortError') return false;
            console.warn('[useLessonStore] showSaveFilePicker cancelado o fallido:', err);
            return false;
          }
        }

        // 3. Fallback para navegadores sin File System Access API
        exportLessonToFile(lesson);
        set({
          saveFeedback: {
            message: 'Copia exportada a Descargas',
            timestamp: Date.now(),
          },
        });
        return true;
      },

      saveLessonAs: async () => {
        const { lesson } = get();
        const jsonContent = JSON.stringify(lesson, null, 2);

        if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
          try {
            const safeTitle = (lesson.title || 'lesson')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-zA-Z0-9_-]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '') || 'lesson';

            const handle = await window.showSaveFilePicker({
              suggestedName: `${safeTitle}.elt.json`,
              types: [
                {
                  description: 'ELT Lesson JSON',
                  accept: {
                    'application/json': ['.json', '.elt.json'],
                  },
                },
              ],
            });

            const writable = await handle.createWritable();
            await writable.write(jsonContent);
            await writable.close();

            set({
              currentFileHandle: handle,
              saveFeedback: {
                message: `Copia guardada en ${handle.name}`,
                timestamp: Date.now(),
              },
            });
            return true;
          } catch (err: any) {
            if (err?.name === 'AbortError') return false;
            console.warn('[useLessonStore] Guardar copia cancelado:', err);
            return false;
          }
        }

        // Fallback
        exportLessonToFile(lesson);
        set({
          saveFeedback: {
            message: 'Copia exportada a Descargas',
            timestamp: Date.now(),
          },
        });
        return true;
      },

      openLessonWithPicker: async () => {
        if (typeof window === 'undefined' || typeof window.showOpenFilePicker !== 'function') {
          return false;
        }

        try {
          const handles = await window.showOpenFilePicker({
            types: [
              {
                description: 'ELT Lesson JSON',
                accept: {
                  'application/json': ['.json', '.elt.json'],
                },
              },
            ],
            multiple: false,
          });

          const handle = handles?.[0];
          if (!handle) return false;

          const file = await handle.getFile();
          const text = await file.text();
          const parsedJson = JSON.parse(text);

          const candidate = (parsedJson && typeof parsedJson === 'object' && 'lesson' in parsedJson)
            ? parsedJson.lesson
            : parsedJson;

          if (!candidate || typeof candidate !== 'object') {
            throw new Error('El archivo no contiene un formato de lección válido.');
          }

          const candidateWithDefaults = {
            id: candidate.id || `lesson-${Date.now()}`,
            title: candidate.title || handle.name.replace(/\.(elt\.)?json$/i, '') || 'Lección Importada',
            level: ['A1-A2', 'B1', 'B2', 'C1'].includes(candidate.level) ? candidate.level : 'B1',
            unit: candidate.unit || 'Unidad 1',
            slides: Array.isArray(candidate.slides) ? candidate.slides : [],
          };

          const validation = LessonSchema.safeParse(candidateWithDefaults);
          if (!validation.success) {
            const firstIssues = validation.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('\n');
            throw new Error(`El archivo no cumple con el esquema de lección:\n${firstIssues}`);
          }

          get().loadLesson(validation.data, handle);
          set({
            saveFeedback: {
              message: `Abierto: ${handle.name}`,
              timestamp: Date.now(),
            },
          });
          return true;
        } catch (err: any) {
          if (err?.name === 'AbortError') return true;
          console.error('[useLessonStore] Error abriendo archivo con picker:', err);
          throw err;
        }
      },

      exportLesson: () => {
        const { lesson } = get();
        exportLessonToFile(lesson);
        set({
          saveFeedback: {
            message: 'Copia exportada a Descargas',
            timestamp: Date.now(),
          },
        });
      },

      exportLessonAsScorm: async () => {
        const { lesson } = get();
        try {
          await downloadScormPackage(lesson);
          const safeTitle = (lesson.title || 'Leccion')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || 'Leccion';

          set({
            saveFeedback: {
              message: `Paquete SCORM 1.2 descargado: ${safeTitle}_SCORM1.2.zip`,
              timestamp: Date.now(),
            },
          });
          return true;
        } catch (err: any) {
          console.error('[useLessonStore] Error al exportar paquete SCORM 1.2:', err);
          return false;
        }
      },

      createSlideFromBlock: (blockId, role) => {
        try {
          const state = get();
          const block = (state.extractedBlocks.find((b) => b.id === blockId) || state.extractedBlocks[0]) as (Slide & ExtractedBlock) | undefined;
          const newId = `slide-${Date.now()}`;
          if (!block) return newId;

          const title = block.title || block.parsedData?.title || 'Diapositiva Digitalizada';
          const subtitle = block.subtitle || block.parsedData?.instruction;
          const isTargetReference = role === 'reference_text' || role === 'reference_table';
          const isGraded = isTargetReference ? false : (block.isGraded !== undefined ? block.isGraded : (block.parsedData?.isGraded !== undefined ? Boolean(block.parsedData.isGraded) : true));
          const sourceImageSnippetUrl = block.sourceImageSnippetUrl || block.sourceImages?.[0] || state.pastedImages[0];

          const contextBody = block.contextBody || block.parsedData?.contextBody || undefined;
          let refContent = block.referenceContent || null;
          let interaction = isTargetReference ? null : (block.interaction || null);

          if (isTargetReference && !refContent && block.interaction) {
            refContent = {
              id: `ref-${Date.now()}`,
              type: role === 'reference_table' ? 'reference_table' : 'text',
              title,
              content: (block.interaction as any).prompt || (block.interaction as any).instruction || subtitle || '',
              body: contextBody,
              category: 'grammar_note',
              ...(role === 'reference_table' ? { columns: [] } : {})
            } as any;
          } else if (!refContent && contextBody && interaction) {
            refContent = {
              id: `ref-${Date.now()}`,
              type: 'text',
              title: title || 'Notas de Referencia',
              content: contextBody,
              body: contextBody,
              category: 'grammar_note',
            };
          } else if (refContent && contextBody && 'body' in refContent && !(refContent as any).body) {
            refContent = { ...(refContent as any), body: contextBody };
          }

          const newSlide: Slide = {
            id: newId,
            title,
            subtitle,
            layout: isTargetReference ? 'single_column' : (block.layout || (refContent && interaction ? 'split_50_50' : 'single_column')),
            referenceContent: refContent,
            interaction,
            cachedInteraction: interaction || block.cachedInteraction || null,
            contextBody,
            notes: block.notes || '',
            isGraded,
            sourceImageSnippetUrl,
            _sourceImage: block._sourceImage || sourceImageSnippetUrl || undefined,
            _rawExtraction: block._rawExtraction,
            _answerKeyCrop: block._answerKeyCrop,
          };

          const isInitialEmptySlide = (lesson: Lesson) => {
            if (lesson.slides.length !== 1) return false;
            const single = lesson.slides[0];
            return (
              !single.interaction &&
              !single.referenceContent &&
              (single.title === 'Diapositiva 1' || single.title === 'Nueva Diapositiva' || !single.title.trim())
            );
          };

          set((s) => {
            const shouldReplace = isInitialEmptySlide(s.lesson);
            return {
              ...recordHistory(s),
              activeSlideId: newId,
              lesson: {
                ...s.lesson,
                slides: shouldReplace ? [newSlide] : [...s.lesson.slides, newSlide],
              },
            };
          });

          useSessionStore.getState().setCurrentSlideId(newId);
          return newId;
        } catch (err) {
          console.error('[useLessonStore] Error creating slide from block:', err);
          const fallbackId = `slide-${Date.now()}`;
          return fallbackId;
        }
      },

      createSlidesFromAllBlocks: () => {
        try {
          const state = get();
          const blocks = state.extractedBlocks as (Slide & ExtractedBlock)[];
          if (!blocks || blocks.length === 0) return [];

          const now = Date.now();
          const newSlides: Slide[] = blocks.map((block, idx) => {
            const slideId = `slide-${now}-${idx}`;
            const title = block.title || block.parsedData?.title || `Diapositiva ${idx + 1}`;
            const subtitle = block.subtitle || block.parsedData?.instruction;
            const isGraded = block.isGraded !== undefined ? block.isGraded : (block.parsedData?.isGraded !== undefined ? Boolean(block.parsedData.isGraded) : true);

            const sourceImageSnippetUrl = block.sourceImageSnippetUrl || block.sourceImages?.[0] || state.pastedImages[idx] || state.pastedImages[0];
            const contextBody = block.contextBody || block.parsedData?.contextBody || undefined;
            let refContent = block.referenceContent || null;
            if (contextBody && !refContent && block.interaction) {
              refContent = {
                id: `ref-${now}-${idx}`,
                type: 'text',
                title: title || 'Notas de Referencia',
                content: contextBody,
                body: contextBody,
                category: 'grammar_note',
              };
            } else if (contextBody && refContent && 'body' in refContent && !(refContent as any).body) {
              refContent = { ...(refContent as any), body: contextBody };
            }

            return {
              id: slideId,
              title,
              subtitle,
              layout: block.layout || (refContent ? 'split_50_50' : 'single_column'),
              referenceContent: refContent,
              interaction: block.interaction || null,
              cachedInteraction: block.interaction || null,
              contextBody,
              notes: block.notes || '',
              isGraded,
              ...(sourceImageSnippetUrl ? { sourceImageSnippetUrl } : {}),
              _sourceImage: block._sourceImage || sourceImageSnippetUrl || undefined,
              _rawExtraction: block._rawExtraction,
              _answerKeyCrop: block._answerKeyCrop,
            };
          });

          const isInitialEmptySlide = (lesson: Lesson) => {
            if (lesson.slides.length !== 1) return false;
            const single = lesson.slides[0];
            return (
              !single.interaction &&
              !single.referenceContent &&
              (single.title === 'Diapositiva 1' || single.title === 'Nueva Diapositiva' || !single.title.trim())
            );
          };

          const firstNewId = newSlides[0]?.id || `slide-${now}`;

          set((s) => {
            const shouldReplace = isInitialEmptySlide(s.lesson);
            return {
              ...recordHistory(s),
              activeSlideId: firstNewId,
              lesson: {
                ...s.lesson,
                slides: shouldReplace ? newSlides : [...s.lesson.slides, ...newSlides],
              },
            };
          });

          useSessionStore.getState().setCurrentSlideId(firstNewId);
          return newSlides.map((s) => s.id);
        } catch (err) {
          console.error('[useLessonStore] Error creating slides from all blocks:', err);
          return [];
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

        set({ ocrProcessing: true, activeOcrAbortController: controller, ocrError: null });
        try {
          const lastSlide = get().lesson.slides[get().lesson.slides.length - 1] || null;
          const extracted = await digitizeBook(images, controller.signal, { previousSlideContext: lastSlide });
          set({
            ocrProcessing: false,
            activeOcrAbortController: null,
            extractedBlocks: extracted,
            lastExtractedPayload: extracted,
            ocrError: null,
          });
        } catch (err: any) {
          if (controller.signal.aborted || err?.name === 'AbortError') {
            set({ ocrProcessing: false, activeOcrAbortController: null });
            return;
          }
          console.error('Error processing images with AI:', err);
          set({
            ocrProcessing: false,
            activeOcrAbortController: null,
            ocrError: err?.message || 'Error al procesar las imágenes con IA',
          });
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
          activeOcrAbortController: controller,
          ocrError: null,
        });

        try {
          const lastSlide = state.lesson.slides[state.lesson.slides.length - 1] || null;
          const extracted = await digitizeBook(
            nextImages.length > 0 ? nextImages : [fileOrUrl],
            controller.signal,
            { previousSlideContext: lastSlide }
          );
          set({
            ocrProcessing: false,
            activeOcrAbortController: null,
            extractedBlocks: extracted,
            lastExtractedPayload: extracted,
            ocrError: null,
          });
        } catch (err: any) {
          if (controller.signal.aborted || err?.name === 'AbortError') {
            set({ ocrProcessing: false, activeOcrAbortController: null });
            return;
          }
          console.error('Error processing images with AI:', err);
          set({
            ocrProcessing: false,
            activeOcrAbortController: null,
            ocrError: err?.message || 'Error al procesar la imagen con IA',
          });
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

        if (template === 'reference_table') {
          const refBlock: ReferenceBlock = {
            type: 'reference_table',
            id: `ref-table-${Date.now()}`,
            title: 'Grammar Reference Table',
            instruction: 'Study the table below:',
            columns: [
              { header: 'Form', items: ['Affirmative', 'Negative', 'Question'] },
              { header: 'Structure', items: ['Subject + Verb', 'Subject + Aux + not', 'Aux + Subject + Verb'] }
            ]
          };
          state.updateReferenceBlock(slideId, refBlock);
          return;
        }

        if (template === 'buckets') {
          const intBlock: InteractionBlock = {
            type: 'buckets_matching',
            id: `int-buckets-${Date.now()}`,
            instruction: 'Categorize each item into the correct category:',
            buckets: [
              { id: 'b1', label: 'Category A', color: '#4f46e5' },
              { id: 'b2', label: 'Category B', color: '#059669' }
            ],
            tokens: [
              { id: 't1', text: 'Item 1', correctBucketId: 'b1' },
              { id: 't2', text: 'Item 2', correctBucketId: 'b2' }
            ]
          };
          state.updateInteractionBlock(slideId, intBlock);
          return;
        }

        if (template === 'selection') {
          const intBlock: InteractionBlock = {
            type: 'selection',
            id: `int-sel-${Date.now()}`,
            instruction: 'Choose the correct option:',
            questions: [
              {
                id: 'q1',
                prompt: 'Select the correct statement:',
                mode: 'single_choice',
                options: [
                  { id: 'opt1', text: 'Option A (Correct)', isCorrect: true },
                  { id: 'opt2', text: 'Option B', isCorrect: false }
                ]
              }
            ]
          };
          state.updateInteractionBlock(slideId, intBlock);
          return;
        }

        if (template === 'sequence') {
          const intBlock: InteractionBlock = {
            type: 'sequence',
            id: `int-seq-${Date.now()}`,
            instruction: 'Put the sentences in order:',
            items: [
              { id: 'seq-1', text: 'First sentence', correctOrder: 1 },
              { id: 'seq-2', text: 'Second sentence', correctOrder: 2 },
              { id: 'seq-3', text: 'Third sentence', correctOrder: 3 }
            ]
          };
          state.updateInteractionBlock(slideId, intBlock);
          return;
        }

        if (template === 'writing') {
          const intBlock: InteractionBlock = {
            type: 'writing',
            id: `int-write-${Date.now()}`,
            instruction: 'Write a short text following the guidelines:',
            prompt: 'Write your answer here...',
            guidelines: ['Use complete sentences', 'Check spelling and grammar']
          };
          state.updateInteractionBlock(slideId, intBlock);
          return;
        }

        // Default: input_fields
        const intBlock: InteractionBlock = {
          type: 'input_fields',
          id: `int-inputs-${Date.now()}`,
          instruction: 'Complete the sentences with the correct word:',
          layoutMode: 'list',
          listItems: [
            { id: 'item-1', prompt: '1. She _______ (live) in London for three years.', expectedAnswer: 'has lived', acceptedAnswers: ['has lived', 'lived'] },
            { id: 'item-2', prompt: '2. We _______ (already / see) that documentary.', expectedAnswer: 'have already seen', acceptedAnswers: ['have already seen'] }
          ],
          tableHeaders: [],
          tableRows: [],
          paragraphTemplate: '',
          paragraphInputs: {}
        };
        state.updateInteractionBlock(slideId, intBlock);
      },

      assignExtractedBlock: (slideId, blockId, role) => {
        try {
          const state = get();
          const source = state.extractedBlocks.find((b) => b.id === blockId) as (Slide & ExtractedBlock) | undefined;
          if (!source) return;

          const isTargetReference = role === 'reference_text' || role === 'reference_table';
          const sourceImageSnippetUrl = source.sourceImageSnippetUrl || source.sourceImages?.[0] || state.pastedImages[0];

          set((s) => ({
            ...recordHistory(s),
            lesson: {
              ...s.lesson,
              slides: s.lesson.slides.map((slide) => {
                if (slide.id !== slideId) return slide;

                let refContent = source.referenceContent !== undefined ? source.referenceContent : slide.referenceContent;
                let interaction = isTargetReference ? null : (source.interaction !== undefined ? source.interaction : slide.interaction);

                if (isTargetReference && !refContent && source.interaction) {
                  refContent = {
                    id: `ref-${Date.now()}`,
                    type: role === 'reference_table' ? 'reference_table' : 'text',
                    title: source.title || slide.title,
                    content: (source.interaction as any).prompt || (source.interaction as any).instruction || '',
                    category: 'grammar_note',
                    ...(role === 'reference_table' ? { columns: [] } : {})
                  } as any;
                }

                const nextLayout = isTargetReference ? 'single_column' : (refContent && interaction ? 'split_50_50' : 'single_column');

                return {
                  ...slide,
                  layout: nextLayout,
                  ...(source.title ? { title: source.title } : {}),
                  ...(source.subtitle ? { subtitle: source.subtitle } : {}),
                  isGraded: isTargetReference ? false : (source.isGraded !== undefined ? source.isGraded : slide.isGraded),
                  referenceContent: refContent,
                  interaction,
                  cachedInteraction: interaction || slide.cachedInteraction || null,
                  contextBody: source.contextBody || source.parsedData?.contextBody || slide.contextBody,
                  ...(sourceImageSnippetUrl ? { sourceImageSnippetUrl } : {}),
                };
              }),
            },
          }));
        } catch (err) {
          console.error('[useLessonStore] Error assigning block to slide:', err);
        }
      },

      reExtractBlockWithRole: async (blockId, role) => {
        const state = get();
        const blockIndex = state.extractedBlocks.findIndex((b) => b.id === blockId);
        const block = state.extractedBlocks[blockIndex >= 0 ? blockIndex : 0] as (Slide & ExtractedBlock) | undefined;
        if (!block) return;

        const clip = block.sourceImageSnippetUrl || block.sourceImages?.[0] || state.pastedImages[blockIndex >= 0 ? blockIndex : 0] || state.pastedImages[0];
        if (!clip) return;

        const controller = new AbortController();
        set({ ocrProcessing: true, activeOcrAbortController: controller, ocrError: null });

        try {
          const forcedTargetType = roleToForcedTargetType(role);
          const regenerated = await digitizeBook([clip], controller.signal, { forcedTargetType });
          if (regenerated && regenerated.length > 0) {
            const newBlock = {
              ...regenerated[0],
              id: block.id,
              sourceImageSnippetUrl: clip,
              sourceImages: [clip],
            };
            set((s) => ({
              ocrProcessing: false,
              activeOcrAbortController: null,
              ocrError: null,
              extractedBlocks: s.extractedBlocks.map((b) => (b.id === blockId ? newBlock : b)),
              lastExtractedPayload: s.extractedBlocks.map((b) => (b.id === blockId ? newBlock : b)),
            }));
          } else {
            set({ ocrProcessing: false, activeOcrAbortController: null });
          }
        } catch (err: any) {
          if (controller.signal.aborted || err?.name === 'AbortError') {
            set({ ocrProcessing: false, activeOcrAbortController: null });
            return;
          }
          console.error('[useLessonStore] Error during reExtractBlockWithRole:', err);
          set({
            ocrProcessing: false,
            activeOcrAbortController: null,
            ocrError: err?.message || 'Error durante la re-extracción dirigida',
          });
        }
      },

      reExtractSlideWithRole: async (slideId, role, clipUrl) => {
        const state = get();
        const slide = state.lesson.slides.find((s) => s.id === slideId);
        if (!slide) return;

        const clip = clipUrl || slide.sourceImageSnippetUrl || state.pastedImages[0] || (state.extractedBlocks[0] as any)?.sourceImageSnippetUrl;
        if (!clip) {
          state.convertSlideRole(slideId, role);
          return;
        }

        const controller = new AbortController();
        set({ ocrProcessing: true, activeOcrAbortController: controller, ocrError: null });

        try {
          const forcedTargetType = roleToForcedTargetType(role);
          const regenerated = await digitizeBook([clip], controller.signal, { forcedTargetType });
          if (regenerated && regenerated.length > 0) {
            const regSlide = regenerated[0];
            const isTargetReference = role === 'reference_text' || role === 'reference_table';
            set((s) => ({
              ...recordHistory(s),
              ocrProcessing: false,
              activeOcrAbortController: null,
              ocrError: null,
              lesson: {
                ...s.lesson,
                slides: s.lesson.slides.map((sl) => {
                  if (sl.id !== slideId) return sl;
                    const nextRoleCache = { ...(sl.rolePayloadCache || {}) };
                    if (isTargetReference && regSlide.referenceContent) {
                      nextRoleCache[role] = regSlide.referenceContent;
                    } else if (regSlide.interaction) {
                      nextRoleCache[role] = regSlide.interaction;
                    }
                    return {
                      ...sl,
                      title: regSlide.title || sl.title,
                      subtitle: regSlide.subtitle || sl.subtitle,
                      layout: isTargetReference ? 'single_column' : (regSlide.layout || (regSlide.referenceContent && regSlide.interaction ? 'split_50_50' : 'single_column')),
                      referenceContent: regSlide.referenceContent || null,
                      interaction: isTargetReference ? null : (regSlide.interaction || null),
                      cachedInteraction: regSlide.interaction || sl.cachedInteraction || null,
                      rolePayloadCache: nextRoleCache,
                      isGraded: isTargetReference ? false : (regSlide.isGraded !== undefined ? regSlide.isGraded : sl.isGraded),
                      sourceImageSnippetUrl: clip,
                      _sourceImage: clip,
                      _rawExtraction: regSlide._rawExtraction || sl._rawExtraction,
                      _answerKeyCrop: regSlide._answerKeyCrop || sl._answerKeyCrop,
                    };
                }),
              },
            }));
          } else {
            set({ ocrProcessing: false, activeOcrAbortController: null });
            state.convertSlideRole(slideId, role);
          }
        } catch (err: any) {
          if (controller.signal.aborted || err?.name === 'AbortError') {
            set({ ocrProcessing: false, activeOcrAbortController: null });
            return;
          }
          console.error('[useLessonStore] Error during reExtractSlideWithRole:', err);
          set({
            ocrProcessing: false,
            activeOcrAbortController: null,
            ocrError: err?.message || 'Error en re-extracción dirigida',
          });
          state.convertSlideRole(slideId, role);
        }
      },

      reprocessActiveSlide: () => {
        const state = get();
        const activeId = state.activeSlideId || useSessionStore.getState().currentSlideId;
        const slideIndex = state.lesson.slides.findIndex((s) => s.id === activeId);
        const activeSlide = slideIndex >= 0 ? state.lesson.slides[slideIndex] : null;

        if (!activeSlide || !activeSlide._rawExtraction) {
          return false;
        }

        try {
          const previousSlideContext = slideIndex > 0 ? state.lesson.slides[slideIndex - 1] : null;
          const reprocessedSlides = validateAndParseSlides(
            activeSlide._rawExtraction,
            previousSlideContext,
            {
              sourceImage: activeSlide._sourceImage || activeSlide.sourceImageSnippetUrl,
              answerKeyCrop: activeSlide._answerKeyCrop,
            }
          );

          if (!reprocessedSlides || reprocessedSlides.length === 0) {
            return false;
          }

          const reprocessed = reprocessedSlides[0];
          const updatedSlide: Slide = {
            ...reprocessed,
            id: activeSlide.id,
            _sourceImage: activeSlide._sourceImage || reprocessed._sourceImage,
            _rawExtraction: activeSlide._rawExtraction, // Maintain original raw extraction without mutation
            _answerKeyCrop: activeSlide._answerKeyCrop || reprocessed._answerKeyCrop,
            sourceImageSnippetUrl: activeSlide._sourceImage || activeSlide.sourceImageSnippetUrl || reprocessed.sourceImageSnippetUrl,
          };

          set((s) => ({
            ...recordHistory(s),
            lesson: {
              ...s.lesson,
              slides: s.lesson.slides.map((sl) => (sl.id === activeId ? updatedSlide : sl)),
            },
            saveFeedback: {
              message: 'Diapositiva re-procesada con la lógica actual',
              timestamp: Date.now(),
            },
          }));

          return true;
        } catch (err: any) {
          console.error('[useLessonStore] Error in reprocessActiveSlide:', err);
          return false;
        }
      },

      regenerateActiveSlideWithAI: async () => {
        const state = get();
        const activeId = state.activeSlideId || useSessionStore.getState().currentSlideId;
        const slideIndex = state.lesson.slides.findIndex((s) => s.id === activeId);
        const activeSlide = slideIndex >= 0 ? state.lesson.slides[slideIndex] : null;

        const sourceImage = activeSlide?._sourceImage || activeSlide?.sourceImageSnippetUrl;
        if (!activeSlide || !sourceImage) {
          return false;
        }

        if (state.activeOcrAbortController) {
          state.activeOcrAbortController.abort();
        }

        const controller = new AbortController();
        set({ ocrProcessing: true, activeOcrAbortController: controller, ocrError: null });

        try {
          const previousSlideContext = slideIndex > 0 ? state.lesson.slides[slideIndex - 1] : null;
          const imagesToDigitize = [sourceImage];
          if (activeSlide._answerKeyCrop) {
            imagesToDigitize.push(activeSlide._answerKeyCrop);
          }

          const regeneratedBlocks = await digitizeBook(
            imagesToDigitize,
            controller.signal,
            {
              previousSlideContext,
              answerKeyCrop: activeSlide._answerKeyCrop,
            }
          );

          if (regeneratedBlocks && regeneratedBlocks.length > 0) {
            const regSlide = regeneratedBlocks[0];
            const updatedSlide: Slide = {
              ...regSlide,
              id: activeSlide.id,
              _sourceImage: sourceImage,
              _answerKeyCrop: activeSlide._answerKeyCrop || regSlide._answerKeyCrop,
              _rawExtraction: regSlide._rawExtraction || activeSlide._rawExtraction,
              sourceImageSnippetUrl: sourceImage,
            };

            set((s) => ({
              ...recordHistory(s),
              ocrProcessing: false,
              activeOcrAbortController: null,
              ocrError: null,
              lesson: {
                ...s.lesson,
                slides: s.lesson.slides.map((sl) => (sl.id === activeId ? updatedSlide : sl)),
              },
              saveFeedback: {
                message: 'Diapositiva regenerada con IA',
                timestamp: Date.now(),
              },
            }));

            return true;
          } else {
            set({ ocrProcessing: false, activeOcrAbortController: null });
            return false;
          }
        } catch (err: any) {
          if (controller.signal.aborted || err?.name === 'AbortError') {
            set({ ocrProcessing: false, activeOcrAbortController: null });
            return false;
          }
          console.error('[useLessonStore] Error during regenerateActiveSlideWithAI:', err);
          set({
            ocrProcessing: false,
            activeOcrAbortController: null,
            ocrError: err?.message || 'Error durante la regeneración con IA',
          });
          return false;
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
