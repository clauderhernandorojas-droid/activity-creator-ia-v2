import { create } from 'zustand';
import type { EvaluationResult } from '../core/evaluators';
import { evaluateInteraction } from '../core/evaluators';
import { initialLesson } from '../data/sampleData';
import { useLessonStore } from './useLessonStore';

export interface SessionEvaluation extends EvaluationResult {
  isSubmitted: boolean;
}

interface SessionState {
  currentSlideId: string;
  mode: 'edit' | 'preview';
  liveSyncEnabled: boolean;

  // Student Answers & Evaluation
  studentAnswers: Record<string, any>;
  studentEvaluation: SessionEvaluation;

  // Modals / Drawers
  isReferenceDrawerOpen: boolean;
  isOcrDrawerOpen: boolean;

  // Actions
  setCurrentSlideId: (id: string) => void;
  setMode: (mode: 'edit' | 'preview') => void;
  toggleLiveSync: () => void;
  setStudentAnswer: (key: string, value: any) => void;
  checkCurrentSlideAnswers: () => void;
  resetStudentAnswers: () => void;
  toggleReferenceDrawer: () => void;
  setIsReferenceDrawerOpen: (open: boolean) => void;
  toggleOcrDrawer: () => void;
  setIsOcrDrawerOpen: (open: boolean) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  currentSlideId: initialLesson.slides[0]?.id || '',
  mode: 'edit',
  liveSyncEnabled: true,

  studentAnswers: {},
  studentEvaluation: {
    isSubmitted: false,
    score: 0,
    maxScore: 0,
    details: {},
  },

  isReferenceDrawerOpen: false,
  isOcrDrawerOpen: false,

  setCurrentSlideId: (id: string) => {
    set({
      currentSlideId: id,
      studentAnswers: {},
      studentEvaluation: { isSubmitted: false, score: 0, maxScore: 0, details: {} },
      isReferenceDrawerOpen: false,
    });
  },

  setMode: (mode) => {
    set({
      mode,
      studentAnswers: {},
      studentEvaluation: { isSubmitted: false, score: 0, maxScore: 0, details: {} },
      isReferenceDrawerOpen: false,
      isOcrDrawerOpen: false,
    });
  },

  toggleLiveSync: () => {
    set((state) => ({ liveSyncEnabled: !state.liveSyncEnabled }));
  },

  setStudentAnswer: (key, value) => {
    set((state) => ({
      studentAnswers: {
        ...state.studentAnswers,
        [key]: value,
      },
    }));
  },

  checkCurrentSlideAnswers: () => {
    const { currentSlideId, studentAnswers } = get();
    const slides = useLessonStore.getState().lesson.slides;
    const currentSlide = slides.find((s) => s.id === currentSlideId);

    if (!currentSlide || !currentSlide.interaction) return;

    const result = evaluateInteraction(currentSlide.interaction, studentAnswers);

    set({
      studentEvaluation: {
        isSubmitted: true,
        ...result,
      },
    });
  },

  resetStudentAnswers: () => {
    set({
      studentAnswers: {},
      studentEvaluation: { isSubmitted: false, score: 0, maxScore: 0, details: {} },
    });
  },

  toggleReferenceDrawer: () => {
    set((state) => ({ isReferenceDrawerOpen: !state.isReferenceDrawerOpen }));
  },

  setIsReferenceDrawerOpen: (open) => {
    set({ isReferenceDrawerOpen: open });
  },

  toggleOcrDrawer: () => {
    set((state) => ({ isOcrDrawerOpen: !state.isOcrDrawerOpen }));
  },

  setIsOcrDrawerOpen: (open) => {
    set({ isOcrDrawerOpen: open });
  },
}));
