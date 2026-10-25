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
import { digitizeBook, validateAndParseSlides, createManualBlock, roleToForcedTargetType, slideToExtractedBlock, parseClozeOptionsFromText, normalizeClozeMultichoiceInteraction, extractRealOptionsForOrdinal, areGapOptionsPlaceholderOrEmpty, collectRawTextSources, type ManualTemplateType, type ForcedTargetArchetype } from '../core/ai/digitizeBook';
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

/**
 * Retrocompatible Defensive Migration for ELT Lesson JSON structures.
 * Hydrates missing fields (_rawExtraction, _sourceImage, items on targetSlots, etc.)
 * with resilient defaults without aborting lesson load.
 */
export function migrateAndSanitizeLesson(
  rawJson: unknown,
  fileNameFallback?: string
): { success: true; data: Lesson } | { success: false; error: any } {
  try {
    let candidate = rawJson;
    if (typeof candidate === 'string') {
      try {
        candidate = JSON.parse(candidate);
      } catch (err: any) {
        return {
          success: false,
          error: {
            format: () => ({ _errors: ['JSON corrupto: ' + (err?.message || 'Error de parseo')] }),
          },
        };
      }
    }

    if (candidate && typeof candidate === 'object') {
      if ('lesson' in candidate && (candidate as any).lesson && typeof (candidate as any).lesson === 'object') {
        candidate = (candidate as any).lesson;
      } else if ('data' in candidate && (candidate as any).data && typeof (candidate as any).data === 'object' && 'lesson' in (candidate as any).data) {
        candidate = (candidate as any).data.lesson;
      }
    }

    // Support raw array of slides
    if (Array.isArray(candidate)) {
      candidate = {
        title: fileNameFallback?.replace(/\.(elt\.)?json$/i, '') || 'Lección Importada',
        slides: candidate,
      };
    }

    if (!candidate || typeof candidate !== 'object') {
      const parsed = LessonSchema.safeParse(candidate);
      if (!parsed.success) {
        return { success: false, error: parsed.error };
      }
      return { success: true, data: parsed.data };
    }

    const obj = candidate as Record<string, any>;
    const rawTitle = obj.title || obj.lessonName || (fileNameFallback ? fileNameFallback.replace(/\.(elt\.)?json$/i, '') : '') || 'Nueva Lección';
    const rawLevel = ['A1-A2', 'B1', 'B2', 'C1'].includes(obj.level) ? obj.level : 'B1';
    const rawUnit = obj.unit || 'Unidad 1';
    const rawSlides = Array.isArray(obj.slides) ? obj.slides : (Array.isArray(obj.items) ? obj.items : []);

    const sanitizedSlides = rawSlides.map((slide: any, index: number) => {
      if (!slide || typeof slide !== 'object') {
        return {
          id: `slide-${index + 1}-${Date.now()}`,
          title: `Diapositiva ${index + 1}`,
          layout: 'split_50_50',
          rolePayloadCache: {},
          _sourceImage: null,
          _rawExtraction: null,
          _answerKeyCrop: null,
        };
      }

      const s = { ...slide };
      s.id = s.id || `slide-${index + 1}-${Date.now()}`;
      s.title = s.title || `Diapositiva ${index + 1}`;

      // Invariante de Reconstitución: Si interaction es null/inválido pero el cuerpo contiene {{gap-, reconstituir cloze_multichoice
      const textCandidates = [
        s.referenceContent?.content,
        s.referenceContent?.body,
        s.contextBody,
        s.notes,
        s.title,
        s.subtitle,
      ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
      const hasGapMarker = textCandidates.some((t) => /\{\{\s*gap-/i.test(t));

      if ((!s.interaction || s.interaction.type !== 'cloze_multichoice') && hasGapMarker) {
        const rawText = textCandidates.join('\n\n');
        const { gaps, optionsStartIndex } = parseClozeOptionsFromText(rawText);
        let passageText = optionsStartIndex > 0 ? rawText.slice(0, optionsStartIndex).trim() : rawText;
        if (gaps.length === 0) {
          const gapMatches = [...passageText.matchAll(/\{\{\s*gap-(\d+)\s*\}\}/gi)];
          const ordinals = Array.from(new Set(gapMatches.map((m) => parseInt(m[1], 10)))).sort((a, b) => a - b);
          console.warn(`[useLessonStore] cloze_multichoice slide "${s.id}" has empty gaps; preserving raw passage text without dummy options.`);
          ordinals.forEach((k) => {
            gaps.push({
              id: `gap-${k}`,
              ordinal: k,
              options: [],
              correctOptionId: 'a',
            });
          });
        }
        s.interaction = {
          id: `interaction-${s.id}`,
          type: 'cloze_multichoice',
          instruction: s.subtitle || s.title || 'Choose the correct option for each gap.',
          passageText,
          gaps,
        };
        s.layout = 'single_column';
        s.referenceContent = null;
        delete s.contextBody;
        s.format = 'cloze_multichoice';
      }

      if (s.interaction?.type === 'cloze_multichoice') {
        s.layout = 'single_column';
        s.referenceContent = null;
        delete s.contextBody;
        s.format = 'cloze_multichoice';
      } else if (!['single_column', 'split_50_50', 'header_stacked'].includes(s.layout)) {
        s.layout = 'split_50_50';
      }
      s._sourceImage = s._sourceImage !== undefined ? s._sourceImage : (s.sourceImageSnippetUrl || null);
      s._rawExtraction = s._rawExtraction !== undefined ? s._rawExtraction : null;
      s._answerKeyCrop = s._answerKeyCrop !== undefined ? s._answerKeyCrop : null;
      s.rolePayloadCache = s.rolePayloadCache && typeof s.rolePayloadCache === 'object' ? s.rolePayloadCache : {};
      s.notes = s.notes || '';
      s.isGraded = s.isGraded !== undefined ? Boolean(s.isGraded) : true;

      // Interaction defensive hydration
      if (s.interaction && typeof s.interaction === 'object') {
        const interaction = { ...s.interaction };
        if (interaction.type === 'buckets_matching') {
          s.format = 'buckets';

          // Normalize buckets & targetSlots
          let buckets = Array.isArray(interaction.buckets) ? interaction.buckets : [];
          let targetSlots = Array.isArray(interaction.targetSlots) ? interaction.targetSlots : [];

          if (buckets.length === 0 && targetSlots.length > 0) {
            buckets = targetSlots.map((ts: any) => ({
              id: ts.id || `target-${Date.now()}`,
              label: ts.label || 'Target',
              description: ts.description,
              color: ts.color,
              items: Array.isArray(ts.items) ? ts.items : [],
            }));
          }

          if (targetSlots.length === 0 && buckets.length > 0) {
            targetSlots = buckets.map((b: any) => ({
              id: b.id || `bucket-${Date.now()}`,
              label: b.label || 'Bucket',
              description: b.description,
              color: b.color,
              items: Array.isArray(b.items) ? b.items : [],
            }));
          }

          // Ensure every bucket and targetSlot has items: []
          interaction.buckets = buckets.map((b: any) => ({
            ...b,
            items: Array.isArray(b.items) ? b.items : [],
          }));
          interaction.targetSlots = targetSlots.map((t: any) => ({
            ...t,
            items: Array.isArray(t.items) ? t.items : [],
          }));

          // Normalize tokens and sourceItems
          let tokens = Array.isArray(interaction.tokens) ? interaction.tokens : [];
          let sourceItems = Array.isArray(interaction.sourceItems) ? interaction.sourceItems : [];

          if (tokens.length === 0 && sourceItems.length > 0) {
            tokens = sourceItems.map((si: any) => ({
              id: si.id || `token-${Date.now()}`,
              text: si.text || '',
              correctBucketId: si.correctTargetId || '',
              isExample: si.isExample,
              hint: si.hint,
            }));
          }
          if (sourceItems.length === 0 && tokens.length > 0) {
            sourceItems = tokens.map((tk: any) => ({
              id: tk.id || `item-${Date.now()}`,
              text: tk.text || '',
              correctTargetId: tk.correctBucketId || '',
              isExample: tk.isExample,
              hint: tk.hint,
            }));
          }

          // Normalize correctPairs
          const pairsMap: Record<string, string> = {};
          if (interaction.correctPairs) {
            if (typeof interaction.correctPairs === 'object' && !Array.isArray(interaction.correctPairs)) {
              Object.assign(pairsMap, interaction.correctPairs);
            } else if (Array.isArray(interaction.correctPairs)) {
              for (const p of interaction.correctPairs) {
                if (p && p.sourceId && p.targetId) {
                  pairsMap[p.sourceId] = p.targetId;
                }
              }
            }
          }
          for (const si of sourceItems) {
            if (si.id && si.correctTargetId && !pairsMap[si.id]) {
              pairsMap[si.id] = si.correctTargetId;
            }
          }
          for (const tk of tokens) {
            if (tk.id && tk.correctBucketId && !pairsMap[tk.id]) {
              pairsMap[tk.id] = tk.correctBucketId;
            }
          }
          interaction.correctPairs = pairsMap;

          interaction.tokens = tokens;
          interaction.sourceItems = sourceItems;
        } else if (interaction.type === 'selection') {
          if (!Array.isArray(interaction.questions)) {
            interaction.questions = [];
          }
          interaction.questions = interaction.questions.map((q: any, qIdx: number) => ({
            ...q,
            id: q.id || `q-${qIdx + 1}`,
            prompt: q.prompt || q.question || '',
            options: Array.isArray(q.options) ? q.options : [],
          }));
        } else if (interaction.type === 'input_fields') {
          if (!Array.isArray(interaction.listItems)) interaction.listItems = [];
          if (!Array.isArray(interaction.tableHeaders)) interaction.tableHeaders = [];
          if (!Array.isArray(interaction.tableRows)) interaction.tableRows = [];
          if (!interaction.paragraphInputs || typeof interaction.paragraphInputs !== 'object') {
            interaction.paragraphInputs = {};
          }
        } else if (interaction.type === 'sequence') {
          if (!Array.isArray(interaction.items)) interaction.items = [];
        } else if (interaction.type === 'cloze_multichoice') {
          if (typeof interaction.passageText !== 'string') {
            interaction.passageText = '';
          }
          if (!Array.isArray(interaction.gaps)) {
            interaction.gaps = [];
          }
          if (interaction.gaps.length === 0 && /\{\{\s*gap-/i.test(interaction.passageText)) {
            const { gaps, optionsStartIndex } = parseClozeOptionsFromText(interaction.passageText);
            if (gaps.length > 0) {
              interaction.gaps = gaps;
              if (optionsStartIndex > 0) {
                interaction.passageText = interaction.passageText.slice(0, optionsStartIndex).trim();
              }
            } else {
              const gapMatches = [...interaction.passageText.matchAll(/\{\{\s*gap-(\d+)\s*\}\}/gi)];
              const ordinals = Array.from(new Set(gapMatches.map((m) => parseInt(m[1], 10)))).sort((a, b) => a - b);
              console.warn(`[useLessonStore] cloze_multichoice slide "${s.id}" has empty gaps; preserving raw passage text without dummy options.`);
              ordinals.forEach((k) => {
                interaction.gaps.push({
                  id: `gap-${k}`,
                  ordinal: k,
                  options: [],
                  correctOptionId: 'a',
                });
              });
            }
          }
          s.layout = 'single_column';
          s.referenceContent = null;
          delete s.contextBody;
          s.format = 'cloze_multichoice';
        }

        s.interaction = interaction;
      }

      return s;
    });

    const candidateToParse = {
      ...obj,
      id: obj.id || `lesson-${Date.now()}`,
      title: rawTitle,
      level: rawLevel,
      unit: rawUnit,
      slides: sanitizedSlides.length > 0 ? sanitizedSlides : [defaultInitialSlide],
    };

    const parsed = LessonSchema.safeParse(candidateToParse);
    if (!parsed.success) {
      return { success: false, error: parsed.error };
    }
    return { success: true, data: parsed.data };
  } catch (err: any) {
    return {
      success: false,
      error: {
        format: () => ({ _errors: [err?.message || 'Error desconocido parseando lección'] }),
      },
    };
  }
}

interface LessonState {
  lesson: Lesson;
  lessonName: string;
  slides: Slide[];
  activeSlideIndex: number;
  fileHandle: FileSystemFileHandle | null;
  hasUnsavedChanges: boolean;
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
  reprocessSlide: (
    targetSlide?: Slide | null,
    context?: { previousSlide?: Slide | null; [key: string]: any }
  ) => boolean;
  reprocessActiveSlide: (
    targetSlide?: Slide | null,
    context?: { previousSlide?: Slide | null; [key: string]: any }
  ) => boolean;
  regenerateActiveSlideWithAI: (targetSlideId?: string) => Promise<boolean>;
  regenerateSlideWithAI: (targetSlideId?: string) => Promise<boolean>;

  // File System Access API & File Portability
  currentFileHandle: FileSystemFileHandle | null;
  setCurrentFileHandle: (handle: FileSystemFileHandle | null) => void;
  saveFeedback: { message: string; timestamp: number } | null;
  clearSaveFeedback: () => void;
  saveLesson: () => Promise<boolean>;
  saveLessonCopy: () => Promise<boolean>;
  saveLessonAs: () => Promise<boolean>;
  openLessonWithPicker: () => Promise<boolean>;
  loadLessonFromFile: (file: File) => Promise<boolean>;
  openLesson: (lessonOrData: unknown, fileHandle?: FileSystemFileHandle | null, fileNameFallback?: string) => boolean;

  // Actions - Lesson Metadata & File Portability
  setLessonTitle: (title: string) => void;
  loadLesson: (lesson: Lesson, fileHandle?: FileSystemFileHandle | null) => void;
  exportLesson: () => void;
  exportLessonAsScorm: () => Promise<boolean>;
  restoreActiveDraft: () => boolean;
}

/**
 * Defensive localStorage adapter that absorbs QuotaExceededError and prevents runtime crashes.
 */
export const safeLocalStorage = {
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
        // Safe no-op
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

export const ACTIVE_DRAFT_KEY = 'elt_active_draft';

export interface ActiveDraftPayload {
  lesson: Lesson;
  slides: Slide[];
  activeSlideIndex: number;
  lessonName: string;
  updatedAt?: number;
}

export function readActiveDraftFromStorage(): ActiveDraftPayload | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(ACTIVE_DRAFT_KEY);
    if (!raw) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const candidate = parsed?.lesson || parsed;
    const result = migrateAndSanitizeLesson(candidate, parsed?.lessonName);
    if (result.success && Array.isArray(result.data.slides) && result.data.slides.length > 0) {
      const lesson = result.data;
      const slides = lesson.slides;
      const rawIdx = typeof parsed?.activeSlideIndex === 'number' ? parsed.activeSlideIndex : 0;
      const activeSlideIndex = rawIdx >= 0 && rawIdx < slides.length ? rawIdx : 0;
      return {
        lesson,
        slides,
        activeSlideIndex,
        lessonName: parsed?.lessonName || lesson.title || 'Nueva Lección',
        updatedAt: parsed?.updatedAt,
      };
    }
  } catch (e) {
    console.warn('[useLessonStore] Error reading active draft from localStorage:', e);
  }
  return null;
}

let draftDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function clearActiveDraft(): void {
  if (draftDebounceTimer) {
    clearTimeout(draftDebounceTimer);
    draftDebounceTimer = null;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(ACTIVE_DRAFT_KEY);
    }
  } catch (e) {
    console.warn('[Draft] Error removing active draft from localStorage:', e);
  }
}

export function saveActiveDraftImmediate(payload: {
  lesson: Lesson;
  slides?: Slide[];
  activeSlideIndex?: number;
  lessonName?: string;
}): void {
  if (draftDebounceTimer) {
    clearTimeout(draftDebounceTimer);
    draftDebounceTimer = null;
  }
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const slides = payload.slides || payload.lesson.slides || [];
    if (slides.length === 0) {
      clearActiveDraft();
      return;
    }
    const activeSlideIndex = typeof payload.activeSlideIndex === 'number' ? payload.activeSlideIndex : 0;
    const draft: ActiveDraftPayload = {
      lesson: payload.lesson,
      slides,
      activeSlideIndex,
      lessonName: payload.lessonName || payload.lesson.title || 'Nueva Lección',
      updatedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(draft));
    } catch (quotaErr) {
      console.warn('[Draft] Quota exceeded writing draft. Pruning transient clippings:', quotaErr);
      const prunedLesson: Lesson = {
        ...draft.lesson,
        slides: draft.lesson.slides.map((s) => ({
          ...s,
          _sourceImage: undefined,
          sourceImageSnippetUrl: undefined,
        })),
      };
      const prunedDraft: ActiveDraftPayload = {
        ...draft,
        lesson: prunedLesson,
        slides: prunedLesson.slides,
      };
      window.localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(prunedDraft));
    }
  } catch (e: any) {
    console.warn('[Draft] Error writing draft to localStorage:', e);
  }
}

export function scheduleSaveActiveDraft(
  payload: {
    lesson: Lesson;
    slides?: Slide[];
    activeSlideIndex?: number;
    lessonName?: string;
  },
  delayMs: number = 300
): void {
  if (draftDebounceTimer) {
    clearTimeout(draftDebounceTimer);
  }
  draftDebounceTimer = setTimeout(() => {
    draftDebounceTimer = null;
    saveActiveDraftImmediate(payload);
  }, delayMs);
}

function getInitialLessonState() {
  const draft = readActiveDraftFromStorage();
  if (draft && draft.slides.length > 0) {
    const activeSlideIndex = Math.min(Math.max(0, draft.activeSlideIndex), draft.slides.length - 1);
    const activeSlideId = draft.slides[activeSlideIndex]?.id || draft.slides[0]?.id || defaultInitialSlide.id;
    return {
      lesson: draft.lesson,
      lessonName: draft.lessonName,
      slides: draft.slides,
      activeSlideIndex,
      activeSlideId,
    };
  }
  return {
    lesson: defaultInitialLesson,
    lessonName: defaultInitialLesson.title,
    slides: defaultInitialLesson.slides,
    activeSlideIndex: 0,
    activeSlideId: defaultInitialSlide.id,
  };
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
    canRedo: false,
    hasUnsavedChanges: true,
  };
}

const initialLessonState = getInitialLessonState();

/**
 * Ensures write permission on a FileSystemFileHandle.
 * Checks queryPermission({ mode: 'readwrite' }) first; if not granted,
 * requests permission via requestPermission({ mode: 'readwrite' }).
 */
export async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const handleAny = handle as any;
  if (!handleAny) return false;
  if (typeof handleAny.queryPermission === 'function') {
    try {
      const perm = await handleAny.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        return true;
      }
      if (typeof handleAny.requestPermission === 'function') {
        const req = await handleAny.requestPermission({ mode: 'readwrite' });
        return req === 'granted';
      }
      return false;
    } catch (err) {
      console.warn('[useLessonStore] Error verificando permisos de archivo:', err);
      return false;
    }
  }
  return true;
}

export const useLessonStore = create<LessonState>()(
  persist(
    (set, get) => ({
      lesson: initialLessonState.lesson,
      lessonName: initialLessonState.lessonName,
      slides: initialLessonState.slides,
      activeSlideIndex: initialLessonState.activeSlideIndex,
      activeSlideId: initialLessonState.activeSlideId,
      fileHandle: null,
      currentFileHandle: null,
      hasUnsavedChanges: false,
      setActiveSlideId: (id: string) => {
        const state = get();
        const index = state.lesson.slides.findIndex((s) => s.id === id);
        set({
          activeSlideId: id,
          activeSlideIndex: index >= 0 ? index : 0,
        });
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
      setCurrentFileHandle: (handle) => set({ currentFileHandle: handle, fileHandle: handle }),
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

        const updatedSlides = [...get().lesson.slides, newSlide];
        set((state) => ({
          ...recordHistory(state),
          activeSlideId: newId,
          activeSlideIndex: updatedSlides.length - 1,
          slides: updatedSlides,
          lesson: {
            ...state.lesson,
            slides: updatedSlides,
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
        const nextIdx = remaining.findIndex((s) => s.id === nextActiveId);
        set((s) => ({
          ...recordHistory(s),
          activeSlideId: nextActiveId,
          activeSlideIndex: nextIdx >= 0 ? nextIdx : 0,
          slides: remaining,
          lesson: {
            ...s.lesson,
            slides: remaining,
          },
        }));
        useSessionStore.getState().setCurrentSlideId(nextActiveId);
      },

      clearLesson: () => {
        clearActiveDraft();
        safeLocalStorage.removeItem('elt-slide-builder-storage');
        set((state) => ({
          ...recordHistory(state),
          activeSlideId: '',
          activeSlideIndex: 0,
          currentFileHandle: null,
          fileHandle: null,
          slides: [],
          lessonName: state.lesson.title,
          lesson: {
            ...state.lesson,
            slides: [],
          },
        }));
        useSessionStore.getState().setCurrentSlideId('');
      },

      restoreActiveDraft: (): boolean => {
        const draft = readActiveDraftFromStorage();
        if (draft && Array.isArray(draft.slides) && draft.slides.length > 0) {
          const activeSlideIndex = Math.min(Math.max(0, draft.activeSlideIndex), draft.slides.length - 1);
          const activeSlide = draft.slides[activeSlideIndex] || draft.slides[0];
          set({
            lesson: draft.lesson,
            slides: draft.slides,
            lessonName: draft.lessonName || draft.lesson.title,
            activeSlideIndex,
            activeSlideId: activeSlide.id,
            hasUnsavedChanges: false,
          });
          useSessionStore.getState().setCurrentSlideId(activeSlide.id);
          return true;
        }
        return false;
      },

      setLessonTitle: (title: string) => {
        const cleaned = title.trim();
        const nextTitle = cleaned || 'Nueva Lección';
        set((state) => ({
          ...recordHistory(state),
          lesson: {
            ...state.lesson,
            title: nextTitle,
          },
          lessonName: nextTitle,
          hasUnsavedChanges: true,
        }));
      },

      openLesson: (lessonOrData: unknown, fileHandle?: FileSystemFileHandle | null, fileNameFallback?: string): boolean => {
        const result = migrateAndSanitizeLesson(lessonOrData, fileNameFallback || fileHandle?.name);
        if (!result.success) {
          console.error("Error validando lección:", result.error.format());
          set({
            saveFeedback: {
              message: "No se pudo cargar la lección: estructura incompatible",
              timestamp: Date.now(),
            },
          });
          return false;
        }

        const validLesson = result.data;
        const slides = Array.isArray(validLesson.slides) && validLesson.slides.length > 0
          ? validLesson.slides
          : [defaultInitialSlide];
        const firstSlideId = slides[0].id;
        const displayName = fileHandle?.name || fileNameFallback || validLesson.title;

        set({
          lesson: {
            ...validLesson,
            slides,
          },
          lessonName: validLesson.title,
          slides,
          activeSlideIndex: 0,
          activeSlideId: firstSlideId,
          fileHandle: fileHandle !== undefined ? fileHandle : null,
          currentFileHandle: fileHandle !== undefined ? fileHandle : null,
          hasUnsavedChanges: false,
          past: [],
          future: [],
          canUndo: false,
          canRedo: false,
          saveFeedback: {
            message: `Abierto: ${displayName}`,
            timestamp: Date.now(),
          },
        });

        // Sincronización explícita con 'elt_active_draft': sobreescribe inmediatamente
        saveActiveDraftImmediate({
          lesson: validLesson,
          slides,
          activeSlideIndex: 0,
          lessonName: validLesson.title,
        });

        useSessionStore.getState().setCurrentSlideId(firstSlideId);
        useSessionStore.getState().resetStudentAnswers?.();
        return true;
      },

      loadLesson: (importedLesson: Lesson, fileHandle?: FileSystemFileHandle | null) => {
        get().openLesson(importedLesson, fileHandle);
      },

      loadLessonFromFile: async (file: File): Promise<boolean> => {
        try {
          const text = await file.text();
          let json: any;
          try {
            json = JSON.parse(text);
          } catch (jsonErr: any) {
            console.error("Error validando lección:", { _errors: ['JSON corrupto o inválido: ' + jsonErr?.message] });
            set({
              saveFeedback: {
                message: "No se pudo cargar la lección: estructura incompatible",
                timestamp: Date.now(),
              },
            });
            return false;
          }
          return get().openLesson(json, null, file.name);
        } catch (err: any) {
          console.error("Error validando lección:", { _errors: [err?.message || 'Error al leer el archivo'] });
          set({
            saveFeedback: {
              message: "No se pudo cargar la lección: estructura incompatible",
              timestamp: Date.now(),
            },
          });
          return false;
        }
      },

      saveLesson: async () => {
        const { lesson, currentFileHandle } = get();
        const jsonContent = JSON.stringify(lesson, null, 2);

        // 1. Si currentFileHandle existe y tiene permisos de escritura: sobrescritura directa sin abrir ventanas del SO
        if (currentFileHandle) {
          try {
            const hasPermission = await ensureWritePermission(currentFileHandle);
            if (!hasPermission) {
              set({
                saveFeedback: {
                  message: 'Permiso de escritura denegado',
                  timestamp: Date.now(),
                },
              });
              return false;
            }

            const writable = await currentFileHandle.createWritable();
            await writable.write(jsonContent);
            await writable.close();

            set({
              currentFileHandle,
              fileHandle: currentFileHandle,
              hasUnsavedChanges: false,
              saveFeedback: {
                message: `Guardado en ${currentFileHandle.name}`,
                timestamp: Date.now(),
              },
            });
            return true;
          } catch (err: any) {
            if (err?.name === 'AbortError') return false;
            console.error('[useLessonStore] Error al sobrescribir archivo vinculado:', err);
            set({
              saveFeedback: {
                message: `Error al guardar: ${err?.message || 'Fallo de escritura'}`,
                timestamp: Date.now(),
              },
            });
            return false;
          }
        }

        // 2. Solo si currentFileHandle es null: llamar a showSaveFilePicker, guardar handle y escribir archivo
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

            const hasPermission = await ensureWritePermission(handle);
            if (!hasPermission) {
              set({
                saveFeedback: {
                  message: 'Permiso de escritura denegado',
                  timestamp: Date.now(),
                },
              });
              return false;
            }

            const writable = await handle.createWritable();
            await writable.write(jsonContent);
            await writable.close();

            set({
              currentFileHandle: handle,
              fileHandle: handle,
              hasUnsavedChanges: false,
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
          hasUnsavedChanges: false,
          saveFeedback: {
            message: 'Copia exportada a Descargas',
            timestamp: Date.now(),
          },
        });
        return true;
      },

      saveLessonCopy: async () => {
        const { lesson } = get();
        const jsonContent = JSON.stringify(lesson, null, 2);

        // Forzar SIEMPRE la apertura de showSaveFilePicker() para seleccionar una nueva ruta o nombre
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

            const hasPermission = await ensureWritePermission(handle);
            if (!hasPermission) {
              set({
                saveFeedback: {
                  message: 'Permiso de escritura denegado',
                  timestamp: Date.now(),
                },
              });
              return false;
            }

            const writable = await handle.createWritable();
            await writable.write(jsonContent);
            await writable.close();

            // Guardar el nuevo fileHandle en currentFileHandle
            set({
              currentFileHandle: handle,
              fileHandle: handle,
              hasUnsavedChanges: false,
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

        // Fallback para navegadores sin File System Access API
        exportLessonToFile(lesson);
        set({
          hasUnsavedChanges: false,
          saveFeedback: {
            message: 'Copia exportada a Descargas',
            timestamp: Date.now(),
          },
        });
        return true;
      },

      saveLessonAs: async () => {
        return get().saveLessonCopy();
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
          let parsedJson: any;
          try {
            parsedJson = JSON.parse(text);
          } catch (jsonErr: any) {
            console.error("Error validando lección:", { _errors: ['JSON corrupto: ' + jsonErr?.message] });
            set({
              saveFeedback: {
                message: "No se pudo cargar la lección: estructura incompatible",
                timestamp: Date.now(),
              },
            });
            return false;
          }

          return get().openLesson(parsedJson, handle, handle.name);
        } catch (err: any) {
          if (err?.name === 'AbortError') return true;
          console.error('[useLessonStore] Error abriendo archivo con picker:', err);
          return false;
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

          const isCloze = interaction?.type === 'cloze_multichoice';
          const newSlide: Slide = {
            id: newId,
            title,
            subtitle,
            layout: isCloze ? 'single_column' : (isTargetReference ? 'single_column' : (block.layout || (refContent && interaction ? 'split_50_50' : 'single_column'))),
            referenceContent: isCloze ? null : refContent,
            interaction,
            cachedInteraction: interaction || block.cachedInteraction || null,
            contextBody: isCloze ? undefined : contextBody,
            notes: block.notes || '',
            isGraded,
            format: isCloze ? 'cloze_multichoice' : (block as any).format,
            sourceImageSnippetUrl,
            _sourceImage: block._sourceImage || sourceImageSnippetUrl || undefined,
            _rawExtraction: block._rawExtraction,
            _answerKeyCrop: block._answerKeyCrop,
          };
          if (isCloze) {
            delete (newSlide as any).contextBody;
          }

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

            const isCloze = block.interaction?.type === 'cloze_multichoice';
            const s: Slide = {
              id: slideId,
              title,
              subtitle,
              layout: isCloze ? 'single_column' : (block.layout || (refContent ? 'split_50_50' : 'single_column')),
              referenceContent: isCloze ? null : refContent,
              interaction: block.interaction || null,
              cachedInteraction: block.interaction || null,
              contextBody: isCloze ? undefined : contextBody,
              notes: block.notes || '',
              isGraded,
              format: isCloze ? 'cloze_multichoice' : (block as any).format,
              ...(sourceImageSnippetUrl ? { sourceImageSnippetUrl } : {}),
              _sourceImage: block._sourceImage || sourceImageSnippetUrl || undefined,
              _rawExtraction: block._rawExtraction,
              _answerKeyCrop: block._answerKeyCrop,
            };
            if (isCloze) {
              delete (s as any).contextBody;
            }
            return s;
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
            slides: state.lesson.slides.map((s) => {
              if (s.id !== id) return s;
              const safeLayout = s.interaction?.type === 'cloze_multichoice' ? 'single_column' : layout;
              return { ...s, layout: safeLayout };
            }),
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
              if (s.interaction?.type === 'cloze_multichoice') {
                return {
                  ...s,
                  referenceContent: null,
                  layout: 'single_column',
                };
              }
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
            slides: state.lesson.slides.map((s) => {
              if (s.id !== slideId) return s;
              if (s.interaction?.type === 'cloze_multichoice' && !block) {
                return s;
              }
              if (block?.type === 'cloze_multichoice') {
                const updated = {
                  ...s,
                  interaction: block,
                  cachedInteraction: block,
                  layout: 'single_column' as const,
                  referenceContent: null,
                  format: 'cloze_multichoice',
                };
                delete (updated as any).contextBody;
                return updated;
              }
              return { ...s, interaction: block, cachedInteraction: block };
            }),
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

                const isCloze = interaction?.type === 'cloze_multichoice';
                const nextLayout: SlideLayout = isCloze ? 'single_column' : (isTargetReference ? 'single_column' : (refContent && interaction ? 'split_50_50' : 'single_column'));
                const nextRef = isCloze ? null : refContent;
                const nextContext = isCloze ? undefined : (source.contextBody || source.parsedData?.contextBody || slide.contextBody);

                const updated = {
                  ...slide,
                  layout: nextLayout,
                  ...(source.title ? { title: source.title } : {}),
                  ...(source.subtitle ? { subtitle: source.subtitle } : {}),
                  isGraded: isTargetReference ? false : (source.isGraded !== undefined ? source.isGraded : slide.isGraded),
                  referenceContent: nextRef,
                  interaction,
                  cachedInteraction: interaction || slide.cachedInteraction || null,
                  contextBody: nextContext,
                  format: isCloze ? 'cloze_multichoice' : (source as any).format || slide.format,
                  ...(sourceImageSnippetUrl ? { sourceImageSnippetUrl } : {}),
                };
                if (isCloze) {
                  delete (updated as any).contextBody;
                }
                return updated;
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
                    const isCloze = regSlide.interaction?.type === 'cloze_multichoice';
                    const nextLayout: SlideLayout = isCloze ? 'single_column' : (isTargetReference ? 'single_column' : (regSlide.layout || (regSlide.referenceContent && regSlide.interaction ? 'split_50_50' : 'single_column')));
                    const nextRef = isCloze ? null : (regSlide.referenceContent || null);
                    const updated = {
                      ...sl,
                      title: regSlide.title || sl.title,
                      subtitle: regSlide.subtitle || sl.subtitle,
                      layout: nextLayout,
                      referenceContent: nextRef,
                      interaction: isTargetReference ? null : (regSlide.interaction || null),
                      cachedInteraction: regSlide.interaction || sl.cachedInteraction || null,
                      rolePayloadCache: nextRoleCache,
                      isGraded: isTargetReference ? false : (regSlide.isGraded !== undefined ? regSlide.isGraded : sl.isGraded),
                      format: isCloze ? 'cloze_multichoice' : (regSlide as any).format || sl.format,
                      sourceImageSnippetUrl: clip,
                      _sourceImage: clip,
                      _rawExtraction: regSlide._rawExtraction || sl._rawExtraction,
                      _answerKeyCrop: regSlide._answerKeyCrop || sl._answerKeyCrop,
                    };
                    if (isCloze) {
                      delete (updated as any).contextBody;
                    }
                    return updated;
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

      reprocessSlide: (
        targetSlide?: Slide | null,
        context?: { previousSlide?: Slide | null; [key: string]: any }
      ) => {
        const state = get();
        const activeId = targetSlide?.id || state.activeSlideId || useSessionStore.getState().currentSlideId;
        const slideIndex = state.lesson.slides.findIndex((s) => s.id === activeId);
        const currentSlide = targetSlide || (slideIndex >= 0 ? state.lesson.slides[slideIndex] : null);

        if (!currentSlide || !currentSlide._rawExtraction) {
          return false;
        }

        try {
          // 1. Inyección de Contexto Contextual (previousSlide)
          const previousSlide = context?.previousSlide !== undefined
            ? context.previousSlide
            : (slideIndex > 0 ? state.lesson.slides[slideIndex - 1] : null);

          // 2. Persistencia y Rescate del Raw Answer Key ('_rawExtraction')
          const rawKey = (currentSlide._rawExtraction as any)?.answersText 
                      || (currentSlide._rawExtraction as any)?.secondaryText
                      || (currentSlide as any).answerKeyText
                      || (currentSlide.interaction as any)?.answerKey;

          // Preparar rawPayload preservando textos crudos e inyectando rawKey para re-procesados idempotentes
          const rawPayload = JSON.parse(JSON.stringify(currentSlide._rawExtraction));
          if (rawKey) {
            if (!rawPayload.answersText) rawPayload.answersText = rawKey;
            if (!rawPayload.answerKeyText) rawPayload.answerKeyText = rawKey;
          }
          if (!rawPayload._rawInstructionText && (currentSlide as any)._rawInstructionText) {
            rawPayload._rawInstructionText = (currentSlide as any)._rawInstructionText;
          }
          if (!rawPayload.contextBody && currentSlide.contextBody) {
            rawPayload.contextBody = currentSlide.contextBody;
          }
          if (!rawPayload.subtitle && currentSlide.subtitle) {
            rawPayload.subtitle = currentSlide.subtitle;
          }

          const reprocessedSlides = validateAndParseSlides(
            rawPayload,
            previousSlide,
            {
              sourceImage: currentSlide._sourceImage || currentSlide.sourceImageSnippetUrl,
              answerKeyCrop: currentSlide._answerKeyCrop || undefined,
            }
          );

          if (!reprocessedSlides || reprocessedSlides.length === 0) {
            return false;
          }

          const reprocessed = reprocessedSlides[0];

          // 3. Sincronización Inmediata del Store:
          // Reemplazar íntegramente 'interaction.tokens' en el store con los 9 tokens generados
          const updatedSlide: Slide = {
            ...reprocessed,
            id: currentSlide.id,
            _sourceImage: currentSlide._sourceImage || reprocessed._sourceImage,
            _rawExtraction: currentSlide._rawExtraction, // Maintain original raw extraction without mutation
            _answerKeyCrop: currentSlide._answerKeyCrop || reprocessed._answerKeyCrop,
            sourceImageSnippetUrl: currentSlide._sourceImage || currentSlide.sourceImageSnippetUrl || reprocessed.sourceImageSnippetUrl,
          };

          if (reprocessed.interaction && reprocessed.interaction.type === 'buckets_matching') {
            updatedSlide.interaction = {
              ...reprocessed.interaction,
              tokens: [...(reprocessed.interaction.tokens || [])],
              sourceItems: [...(reprocessed.interaction.sourceItems || [])],
            };
          }

          set((s) => ({
            ...recordHistory(s),
            lesson: {
              ...s.lesson,
              slides: s.lesson.slides.map((sl) => (sl.id === activeId ? updatedSlide : sl)),
            },
            extractedBlocks: s.extractedBlocks.map((b) => (b.id === activeId ? slideToExtractedBlock(updatedSlide) : b)),
            saveFeedback: {
              message: 'Diapositiva re-procesada con la lógica actual',
              timestamp: Date.now(),
            },
          }));

          useSessionStore.getState().resetStudentAnswers();

          return true;
        } catch (err: any) {
          console.error('[useLessonStore] Error in reprocessSlide:', err);
          return false;
        }
      },

      reprocessActiveSlide: (
        targetSlide?: Slide | null,
        context?: { previousSlide?: Slide | null; [key: string]: any }
      ) => {
        return get().reprocessSlide(targetSlide, context);
      },

      regenerateActiveSlideWithAI: async (targetSlideId?: string) => {
        const state = get();
        const activeId = targetSlideId || state.activeSlideId || useSessionStore.getState().currentSlideId;
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

          // Blindaje en 'regenerateSlideWithAI':
          // Si la diapositiva actual es de formato 'cloze_multichoice' o su texto contiene marcadores '{{gap-':
          // - Queda prohibido regenerarla como plantilla de lectura dividida ('split_50_50' / 'lecture').
          // - El prompt de regeneración debe mantener estrictamente el contrato 'cloze_multichoice':
          //   preservar el pasaje con '{{gap-k}}' y un array 'gaps' con sus opciones respectivas.
          const slideAllText = [
            activeSlide.title,
            activeSlide.subtitle,
            (activeSlide.interaction as any)?.passageText,
            (activeSlide.interaction as any)?.prompt,
            (activeSlide.interaction as any)?.instruction,
            (activeSlide.referenceContent as any)?.content,
            (activeSlide.referenceContent as any)?.body,
            activeSlide.contextBody,
            activeSlide.notes,
          ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0).join('\n');

          const hasGapMarker = /\{\{\s*gap-/i.test(slideAllText);
          const isCloze =
            activeSlide.format === 'cloze_multichoice' ||
            activeSlide.interaction?.type === 'cloze_multichoice' ||
            hasGapMarker;

          const forcedTargetType: ForcedTargetArchetype | undefined = isCloze ? 'cloze_multichoice' : undefined;

          const regeneratedBlocks = await digitizeBook(
            imagesToDigitize,
            controller.signal,
            {
              forcedTargetType,
              previousSlideContext,
              currentSlide: activeSlide,
              answerKeyCrop: activeSlide._answerKeyCrop || undefined,
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

            const isResultCloze =
              isCloze ||
              regSlide.format === 'cloze_multichoice' ||
              regSlide.interaction?.type === 'cloze_multichoice' ||
              /\{\{\s*gap-/i.test(
                `${regSlide.title || ''} ${regSlide.subtitle || ''} ${(regSlide.interaction as any)?.passageText || ''} ${(regSlide.referenceContent as any)?.content || ''} ${regSlide.contextBody || ''} ${regSlide.notes || ''}`
              );

            if (isResultCloze) {
              normalizeClozeMultichoiceInteraction(updatedSlide);
              updatedSlide.layout = 'single_column';
              updatedSlide.referenceContent = null;
              delete (updatedSlide as any).contextBody;
              updatedSlide.format = 'cloze_multichoice';

              // Preservación estricta del contrato cloze: si el modelo degradó o vació interacción/pasaje/gaps
              if (
                !updatedSlide.interaction ||
                updatedSlide.interaction.type !== 'cloze_multichoice' ||
                !Array.isArray((updatedSlide.interaction as any).gaps) ||
                (updatedSlide.interaction as any).gaps.length === 0
              ) {
                if (activeSlide.interaction?.type === 'cloze_multichoice') {
                  updatedSlide.interaction = {
                    ...activeSlide.interaction,
                    id: `interaction-${activeSlide.id}`,
                  };
                }
              }

              // Extracción de opciones reales vs placeholders en gaps
              if (updatedSlide.interaction?.type === 'cloze_multichoice' && Array.isArray(updatedSlide.interaction.gaps)) {
                const rawSources = [
                  (updatedSlide.interaction as any).passageText,
                  ...collectRawTextSources(updatedSlide),
                  ...collectRawTextSources(activeSlide),
                ];
                updatedSlide.interaction.gaps.forEach((gap, idx) => {
                  const k = typeof gap.ordinal === 'number' ? gap.ordinal : idx + 1;
                  if (areGapOptionsPlaceholderOrEmpty(gap.options)) {
                    for (const src of rawSources) {
                      const realOpts = extractRealOptionsForOrdinal(src, k);
                      if (realOpts && realOpts.length >= 2) {
                        gap.options = realOpts;
                        break;
                      }
                    }
                  } else if (Array.isArray(gap.options) && gap.options.length < 3) {
                    for (const src of rawSources) {
                      const realOpts = extractRealOptionsForOrdinal(src, k);
                      if (realOpts && realOpts.length >= 3) {
                        gap.options = realOpts;
                        break;
                      }
                    }
                  }
                });
              }

              if (updatedSlide.interaction) {
                updatedSlide.interaction.id = `interaction-${activeSlide.id}`;
              }
            }

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

      regenerateSlideWithAI: async (targetSlideId?: string) => {
        return get().regenerateActiveSlideWithAI(targetSlideId);
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
          const draft = readActiveDraftFromStorage();
          if (draft && Array.isArray(draft.slides) && draft.slides.length > 0) {
            state.lesson = draft.lesson;
            state.slides = draft.slides;
            state.lessonName = draft.lessonName;
            state.activeSlideIndex = draft.activeSlideIndex;
            state.activeSlideId = draft.slides[draft.activeSlideIndex]?.id || draft.slides[0]?.id;
          } else {
            const validSlideId = state.lesson.slides.some((s) => s.id === state.activeSlideId)
              ? state.activeSlideId
              : (state.lesson.slides[0]?.id ?? '');
            if (validSlideId !== state.activeSlideId) {
              state.activeSlideId = validSlideId;
            }
          }
          useSessionStore.getState().setCurrentSlideId(state.activeSlideId);
        }
      },
    }
  )
);

// Sincronización continua del estado activo de la lección ('elt_active_draft') en localStorage con debounce de 300ms
useLessonStore.subscribe((state, prevState) => {
  // Si no hay diapositivas o la lección fue vaciada, omitir guardado
  if (!state.slides || state.slides.length === 0) {
    return;
  }

  // Detectar cambios en lesson, slides, activeSlideIndex o lessonName
  if (
    state.lesson !== prevState.lesson ||
    state.slides !== prevState.slides ||
    state.activeSlideIndex !== prevState.activeSlideIndex ||
    state.lessonName !== prevState.lessonName
  ) {
    scheduleSaveActiveDraft(
      {
        lesson: state.lesson,
        slides: state.slides,
        activeSlideIndex: state.activeSlideIndex,
        lessonName: state.lessonName || state.lesson.title,
      },
      300
    );
  }
});
