import { create } from 'zustand';
import type { EvaluationResult } from '../core/evaluators';
import { evaluateInteraction } from '../core/evaluators';
import { evaluateAnswersWithGemini } from '../core/ai/semanticEvaluator';
import { useLessonStore } from './useLessonStore';

export interface SessionEvaluation extends EvaluationResult {
  isSubmitted: boolean;
  usedAi?: boolean;
  isGraded?: boolean;
}

interface SessionState {
  currentSlideId: string;
  mode: 'edit' | 'preview';
  liveSyncEnabled: boolean;

  // Student Answers & Evaluation
  studentAnswers: Record<string, any>;
  studentEvaluation: SessionEvaluation;
  isAiEvaluating: boolean;

  // Modals / Drawers
  isReferenceDrawerOpen: boolean;
  isOcrDrawerOpen: boolean;

  // Actions
  setCurrentSlideId: (id: string) => void;
  setMode: (mode: 'edit' | 'preview') => void;
  toggleLiveSync: () => void;
  setStudentAnswer: (key: string, value: any) => void;
  checkCurrentSlideAnswers: () => Promise<void>;
  resetStudentAnswers: () => void;
  toggleReferenceDrawer: () => void;
  setIsReferenceDrawerOpen: (open: boolean) => void;
  toggleOcrDrawer: () => void;
  setIsOcrDrawerOpen: (open: boolean) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  currentSlideId: 'slide-1',
  mode: 'edit',
  liveSyncEnabled: true,

  studentAnswers: {},
  studentEvaluation: {
    isSubmitted: false,
    score: 0,
    maxScore: 0,
    details: {},
  },
  isAiEvaluating: false,

  isReferenceDrawerOpen: false,
  isOcrDrawerOpen: false,

  setCurrentSlideId: (id: string) => {
    set({
      currentSlideId: id,
      studentAnswers: {},
      studentEvaluation: { isSubmitted: false, score: 0, maxScore: 0, details: {} },
      isAiEvaluating: false,
      isReferenceDrawerOpen: false,
    });
    const lessonStore = useLessonStore.getState();
    if (lessonStore.activeSlideId !== id) {
      lessonStore.setActiveSlideId(id);
    }
  },

  setMode: (mode) => {
    set({
      mode,
      studentAnswers: {},
      studentEvaluation: { isSubmitted: false, score: 0, maxScore: 0, details: {} },
      isAiEvaluating: false,
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

  checkCurrentSlideAnswers: async () => {
    const { currentSlideId, studentAnswers } = get();
    const slides = useLessonStore.getState().lesson.slides;
    const currentSlide = slides.find((s) => s.id === currentSlideId);

    if (!currentSlide || !currentSlide.interaction) return;

    // Support for non-graded activities / personal surveys: Register responses cleanly without errors or punitive scoring
    if (currentSlide.isGraded === false) {
      set({
        isAiEvaluating: false,
        studentEvaluation: {
          isSubmitted: true,
          score: 0,
          maxScore: 0,
          details: {},
          isGraded: false,
        },
      });
      return;
    }

    const interaction = currentSlide.interaction;

    // AI Semantic Evaluation for input_fields
    if (interaction.type === 'input_fields' && interaction.listItems && interaction.listItems.length > 0) {
      set({ isAiEvaluating: true });
      try {
        let referenceText = '';
        if (currentSlide.referenceContent) {
          if (currentSlide.referenceContent.type === 'text') {
            referenceText = `${currentSlide.referenceContent.title || ''}\n${currentSlide.referenceContent.content}`;
          } else if (currentSlide.referenceContent.type === 'table_reference') {
            const headers = currentSlide.referenceContent.headers?.join(' | ') || '';
            const rows = currentSlide.referenceContent.rows?.map((r) => r.join(' | ')).join('\n') || '';
            referenceText = `${currentSlide.referenceContent.title || ''}\n${headers}\n${rows}`;
          } else if (currentSlide.referenceContent.type === 'media') {
            referenceText = `${currentSlide.referenceContent.title || ''}\n${currentSlide.referenceContent.transcript || ''}`;
          }
        }

        const evalResult = await evaluateAnswersWithGemini({
          referenceText,
          questions: interaction.listItems,
          userAnswers: studentAnswers,
        });

        set({
          isAiEvaluating: false,
          studentEvaluation: {
            isSubmitted: true,
            score: evalResult.score,
            maxScore: evalResult.maxScore,
            details: evalResult.details,
            itemFeedback: evalResult.itemFeedback,
            usedAi: evalResult.usedAi,
            isGraded: true,
          },
        });
        return;
      } catch (aiErr) {
        console.warn('[useSessionStore] AI evaluation error, falling back locally:', aiErr);
      } finally {
        set({ isAiEvaluating: false });
      }
    }

    // Default pure evaluation for non-input interactions or on fallback
    const result = evaluateInteraction(currentSlide.interaction, studentAnswers);

    set({
      isAiEvaluating: false,
      studentEvaluation: {
        isSubmitted: true,
        ...result,
        isGraded: true,
      },
    });
  },

  resetStudentAnswers: () => {
    set({
      studentAnswers: {},
      studentEvaluation: { isSubmitted: false, score: 0, maxScore: 0, details: {} },
      isAiEvaluating: false,
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
