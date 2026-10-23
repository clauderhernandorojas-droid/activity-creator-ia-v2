import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useLessonStore,
  defaultInitialLesson,
  ACTIVE_DRAFT_KEY,
  clearActiveDraft,
  saveActiveDraftImmediate,
  readActiveDraftFromStorage,
} from '../useLessonStore';
import { useSessionStore } from '../useSessionStore';
import type { Lesson } from '../../types/schema';

// Mock localStorage if in node environment
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}
Object.defineProperty((globalThis as any).window, 'localStorage', {
  value: storageMock,
  writable: true,
});

describe('useLessonStore - Local Draft Persistence (elt_active_draft)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storageMock.clear();
    useLessonStore.setState({
      lesson: JSON.parse(JSON.stringify(defaultInitialLesson)),
      lessonName: defaultInitialLesson.title,
      slides: JSON.parse(JSON.stringify(defaultInitialLesson.slides)),
      activeSlideIndex: 0,
      activeSlideId: defaultInitialLesson.slides[0].id,
      currentFileHandle: null,
      saveFeedback: null,
      past: [],
      future: [],
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    storageMock.clear();
  });

  describe('1. Persistencia de Sesión Activa con Debounce (300ms)', () => {
    it('guarda lesson, slides, activeSlideIndex y lessonName en elt_active_draft tras 300ms de inactividad', () => {
      // Trigger a state change: add slide
      const newSlideId = useLessonStore.getState().addSlide('single_column');
      const stateAfterAdd = useLessonStore.getState();
      expect(stateAfterAdd.slides).toHaveLength(2);

      // Before debounce fires (e.g. 150ms), localStorage is not yet updated
      vi.advanceTimersByTime(150);
      expect(storageMock.getItem(ACTIVE_DRAFT_KEY)).toBeNull();

      // After 300ms debounce completes
      vi.advanceTimersByTime(150);
      const rawStored = storageMock.getItem(ACTIVE_DRAFT_KEY);
      expect(rawStored).not.toBeNull();

      const parsed = JSON.parse(rawStored!);
      expect(parsed.slides).toHaveLength(2);
      expect(parsed.lesson.slides).toHaveLength(2);
      expect(parsed.activeSlideIndex).toBe(1);
      expect(parsed.lessonName).toBe(defaultInitialLesson.title);
      expect(parsed.slides[1].id).toBe(newSlideId);
    });

    it('acumula múltiples mutaciones rápidas en un único guardado tras el debounce', () => {
      useLessonStore.getState().setLessonTitle('Título en Edición 1');
      vi.advanceTimersByTime(100);

      useLessonStore.getState().setLessonTitle('Título en Edición 2');
      vi.advanceTimersByTime(100);

      useLessonStore.getState().setLessonTitle('Título Definitivo');
      vi.advanceTimersByTime(299);

      // Aún no transcurrieron los 300ms desde la última edición
      expect(storageMock.getItem(ACTIVE_DRAFT_KEY)).toBeNull();

      vi.advanceTimersByTime(1);
      const rawStored = storageMock.getItem(ACTIVE_DRAFT_KEY);
      expect(rawStored).not.toBeNull();
      const parsed = JSON.parse(rawStored!);
      expect(parsed.lessonName).toBe('Título Definitivo');
      expect(parsed.lesson.title).toBe('Título Definitivo');
    });
  });

  describe('2. Auto-hidratación al Inicializar y Preservación de activeSlideIndex', () => {
    it('restaura el borrador persistido preservando activeSlideIndex y activeSlideId', () => {
      const draftLesson: Lesson = {
        id: 'lesson-draft-abc',
        title: 'Borrador Guardado B2',
        level: 'B2',
        unit: 'Unit 3',
        slides: [
          {
            id: 'slide-draft-1',
            title: 'Draft Slide 1',
            subtitle: '',
            layout: 'single_column',
            referenceContent: null,
            interaction: null,
            notes: '',
            isGraded: true,
          },
          {
            id: 'slide-draft-2',
            title: 'Draft Slide 2 (Target Focus)',
            subtitle: 'Complete blanks',
            layout: 'split_50_50',
            referenceContent: null,
            interaction: null,
            notes: '',
            isGraded: true,
          },
          {
            id: 'slide-draft-3',
            title: 'Draft Slide 3',
            subtitle: '',
            layout: 'single_column',
            referenceContent: null,
            interaction: null,
            notes: '',
            isGraded: true,
          },
        ],
      };

      // Guardamos el borrador con activeSlideIndex = 1 (apuntando a slide-draft-2)
      saveActiveDraftImmediate({
        lesson: draftLesson,
        slides: draftLesson.slides,
        activeSlideIndex: 1,
        lessonName: draftLesson.title,
      });

      // Verificamos lectura de borrador
      const draft = readActiveDraftFromStorage();
      expect(draft).not.toBeNull();
      expect(draft?.activeSlideIndex).toBe(1);

      // Ejecutamos restoreActiveDraft
      const restored = useLessonStore.getState().restoreActiveDraft();
      expect(restored).toBe(true);

      const state = useLessonStore.getState();
      expect(state.lesson.title).toBe('Borrador Guardado B2');
      expect(state.slides).toHaveLength(3);
      expect(state.activeSlideIndex).toBe(1);
      expect(state.activeSlideId).toBe('slide-draft-2');
      expect(useSessionStore.getState().currentSlideId).toBe('slide-draft-2');
    });

    it('ignora borradores malformados o corruptos de forma resiliente', () => {
      storageMock.setItem(ACTIVE_DRAFT_KEY, '{ invalid json corrupted');
      const draft = readActiveDraftFromStorage();
      expect(draft).toBeNull();

      const restored = useLessonStore.getState().restoreActiveDraft();
      expect(restored).toBe(false);
    });
  });

  describe('3. Sincronización con Acciones Explícitas (Vaciar y Abrir)', () => {
    it('al pulsar clearLesson ("Vaciar Lección") limpia explícitamente elt_active_draft de localStorage', () => {
      // Guardar borrador previo
      saveActiveDraftImmediate({
        lesson: defaultInitialLesson,
        slides: defaultInitialLesson.slides,
        activeSlideIndex: 0,
        lessonName: defaultInitialLesson.title,
      });
      expect(storageMock.getItem(ACTIVE_DRAFT_KEY)).not.toBeNull();

      // Ejecutar vaciado de lección
      useLessonStore.getState().clearLesson();

      // Debe quedar limpiado de inmediato
      expect(storageMock.getItem(ACTIVE_DRAFT_KEY)).toBeNull();

      // Ningún debounce posterior debe reescribir un borrador vacío
      vi.advanceTimersByTime(500);
      expect(storageMock.getItem(ACTIVE_DRAFT_KEY)).toBeNull();
    });

    it('clearActiveDraft elimina directamente el borrador y cancela temporizadores pendientes', () => {
      saveActiveDraftImmediate({
        lesson: defaultInitialLesson,
        slides: defaultInitialLesson.slides,
        activeSlideIndex: 0,
        lessonName: 'Test Draft',
      });
      expect(storageMock.getItem(ACTIVE_DRAFT_KEY)).not.toBeNull();

      clearActiveDraft();
      expect(storageMock.getItem(ACTIVE_DRAFT_KEY)).toBeNull();
    });

    it('al pulsar openLesson ("Abrir Lección") sobreescribe elt_active_draft inmediatamente con la nueva lección', () => {
      // Borrador antiguo
      saveActiveDraftImmediate({
        lesson: defaultInitialLesson,
        slides: defaultInitialLesson.slides,
        activeSlideIndex: 0,
        lessonName: 'Lección Vieja',
      });

      const newLessonData = {
        id: 'lesson-imported-fresh',
        title: 'Lección Nueva Importada',
        level: 'C1',
        unit: 'Unit 9',
        slides: [
          {
            id: 'slide-new-1',
            title: 'New Slide 1',
            layout: 'single_column',
          },
          {
            id: 'slide-new-2',
            title: 'New Slide 2',
            layout: 'split_50_50',
          },
        ],
      };

      const success = useLessonStore.getState().openLesson(newLessonData, null, 'Lección Nueva Importada.elt.json');
      expect(success).toBe(true);

      // Se sobreescribe inmediatamente sin esperar el debounce
      const rawStored = storageMock.getItem(ACTIVE_DRAFT_KEY);
      expect(rawStored).not.toBeNull();
      const parsed = JSON.parse(rawStored!);
      expect(parsed.lessonName).toBe('Lección Nueva Importada');
      expect(parsed.slides).toHaveLength(2);
      expect(parsed.activeSlideIndex).toBe(0);
      expect(parsed.slides[0].id).toBe('slide-new-1');
    });
  });
});
