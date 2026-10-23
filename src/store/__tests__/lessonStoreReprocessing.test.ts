import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLessonStore, defaultInitialLesson } from '../useLessonStore';
import { SlideSchema, type Slide } from '../../types/schema';
import { validateAndParseSlides } from '../../core/ai/digitizeBook';
import * as digitizeBookModule from '../../core/ai/digitizeBook';

describe('useLessonStore - Slide Re-processing and AI Regeneration', () => {
  beforeEach(() => {
    useLessonStore.setState({
      lesson: JSON.parse(JSON.stringify(defaultInitialLesson)),
      activeSlideId: defaultInitialLesson.slides[0].id,
      extractedBlocks: [],
      past: [],
      future: [],
      saveFeedback: null,
      ocrProcessing: false,
      ocrError: null,
    });
    vi.restoreAllMocks();
  });

  describe('1. SlideSchema Metadata & Provenance Validation', () => {
    it('SlideSchema valida y preserva _sourceImage, _rawExtraction y _answerKeyCrop sin romper esquema', () => {
      const mockSlide: Slide = {
        id: 'slide-test-provenance',
        title: 'Vocabulary: Animals',
        layout: 'single_column',
        _sourceImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        _rawExtraction: {
          title: 'Vocabulary: Animals',
          interaction: { type: 'input_fields', listItems: [] },
        },
        _answerKeyCrop: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      };

      const result = SlideSchema.safeParse(mockSlide);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data._sourceImage).toBe(mockSlide._sourceImage);
        expect(result.data._rawExtraction).toEqual(mockSlide._rawExtraction);
        expect(result.data._answerKeyCrop).toBe(mockSlide._answerKeyCrop);
      }
    });
  });

  describe('2. Pipeline Capture in validateAndParseSlides', () => {
    it('validateAndParseSlides almacena automáticamente _rawExtraction y preserva metadatos fuente', () => {
      const rawJson = JSON.stringify({
        slides: [
          {
            title: 'Grammar: Simple Present',
            subtitle: 'Choose the correct form',
            interaction: {
              type: 'selection',
              instruction: 'Choose the correct form',
              questions: [
                {
                  id: 'q1',
                  prompt: 'She (like / likes) tennis.',
                  options: [
                    { id: 'o1', text: 'like', isCorrect: false },
                    { id: 'o2', text: 'likes', isCorrect: true },
                  ],
                },
              ],
            },
          },
        ],
      });

      const sourceImage = 'data:image/png;base64,testSourceImg';
      const answerKeyCrop = 'data:image/png;base64,testAnsKey';

      const slides = validateAndParseSlides(rawJson, null, {
        sourceImage,
        answerKeyCrop,
      });

      expect(slides).toHaveLength(1);
      const slide = slides[0];
      expect(slide._sourceImage).toBe(sourceImage);
      expect(slide._answerKeyCrop).toBe(answerKeyCrop);
      expect(slide._rawExtraction).toBeDefined();
      expect((slide._rawExtraction as any).title).toBe('Grammar: Simple Present');
    });
  });

  describe('3. reprocessActiveSlide() Deterministic Execution (0 tokens)', () => {
    it('devuelve false de forma segura si la diapositiva activa no tiene _rawExtraction', () => {
      const state = useLessonStore.getState();
      const activeSlide = state.lesson.slides[0];
      delete activeSlide._rawExtraction;

      const success = useLessonStore.getState().reprocessActiveSlide();
      expect(success).toBe(false);
      expect(useLessonStore.getState().saveFeedback).toBeNull();
    });

    it('aplica las transformaciones actualizadas sobre _rawExtraction sin mutar la imagen fuente ni el objeto crudo original', () => {
      const originalSourceImage = 'data:image/png;base64,ORIGINAL_SOURCE_IMAGE_CLIPPING';
      const originalAnswerKey = 'data:image/png;base64,ORIGINAL_ANSWER_KEY';

      // Raw extraction with unnormalized raw instruction that TypeScript normalizes
      const rawExtractionPayload = {
        title: 'Exercise 4: Grammar Practice',
        subtitle: '1. Complete with am/is/are',
        interaction: {
          type: 'input_fields',
          instruction: '1. Complete with am/is/are',
          layoutMode: 'list',
          listItems: [
            { id: 'item-1', prompt: 'I {{blank}} a teacher.', expectedAnswer: 'am', acceptedAnswers: ['am'] },
            { id: 'item-2', prompt: 'He {{blank}} a doctor.', expectedAnswer: 'is', acceptedAnswers: ['is'] },
          ],
        },
      };

      // Clone for reference to verify immutability
      const pristineRawClone = JSON.parse(JSON.stringify(rawExtractionPayload));

      const initialSlide: Slide = {
        id: 'slide-active-1',
        title: 'Exercise 4: Grammar Practice',
        subtitle: 'Un-normalized subtitle',
        layout: 'single_column',
        interaction: {
          id: 'int-old',
          type: 'input_fields',
          instruction: 'Old interaction state',
          layoutMode: 'list',
          listItems: [],
          tableHeaders: [],
          tableRows: [],
          paragraphTemplate: '',
          paragraphInputs: {},
        },
        _sourceImage: originalSourceImage,
        _rawExtraction: rawExtractionPayload,
        _answerKeyCrop: originalAnswerKey,
        sourceImageSnippetUrl: originalSourceImage,
      };

      useLessonStore.setState({
        lesson: {
          ...defaultInitialLesson,
          slides: [initialSlide],
        },
        activeSlideId: 'slide-active-1',
      });

      // Execute deterministic re-processing
      const success = useLessonStore.getState().reprocessActiveSlide();

      expect(success).toBe(true);

      const updatedSlide = useLessonStore.getState().lesson.slides[0];

      // Verificación de invariantes:
      // 1. Mantiene el id del slide
      expect(updatedSlide.id).toBe('slide-active-1');

      // 2. Imagen fuente NO mutó
      expect(updatedSlide._sourceImage).toBe(originalSourceImage);
      expect(updatedSlide._answerKeyCrop).toBe(originalAnswerKey);

      // 3. El payload crudo original NO fue mutado internamente
      expect(rawExtractionPayload).toEqual(pristineRawClone);
      expect(updatedSlide._rawExtraction).toEqual(pristineRawClone);

      // 4. Se aplicó la normalización canónica de TypeScript
      expect(updatedSlide.interaction?.type).toBe('input_fields');
      const interaction = updatedSlide.interaction as any;
      expect(interaction.listItems).toHaveLength(2);
      expect(interaction.listItems[0].prompt).toBe('I {{blank}} a teacher.');

      // 5. Toast emitido correctamente
      expect(useLessonStore.getState().saveFeedback).toEqual({
        message: 'Diapositiva re-procesada con la lógica actual',
        timestamp: expect.any(Number),
      });
    });
  });

  describe('4. regenerateActiveSlideWithAI() AI Re-execution with In-Memory Clipping', () => {
    it('devuelve false si no existe _sourceImage en la diapositiva activa', async () => {
      const initialSlide: Slide = {
        id: 'slide-no-image',
        title: 'Diapositiva sin recorte',
        layout: 'single_column',
      };

      useLessonStore.setState({
        lesson: {
          ...defaultInitialLesson,
          slides: [initialSlide],
        },
        activeSlideId: 'slide-no-image',
      });

      const success = await useLessonStore.getState().regenerateActiveSlideWithAI();
      expect(success).toBe(false);
    });

    it('re-ejecuta digitizeBook con la imagen en memoria y actualiza la diapositiva activa emitiendo toast', async () => {
      const sourceImage = 'data:image/png;base64,IN_MEMORY_CLIP_PNG';
      const answerKeyCrop = 'data:image/png;base64,KEY_CLIP_PNG';

      const initialSlide: Slide = {
        id: 'slide-ai-target',
        title: 'Initial Slide Title',
        layout: 'single_column',
        _sourceImage: sourceImage,
        _answerKeyCrop: answerKeyCrop,
      };

      useLessonStore.setState({
        lesson: {
          ...defaultInitialLesson,
          slides: [initialSlide],
        },
        activeSlideId: 'slide-ai-target',
      });

      // Mock digitizeBook
      const mockRegenerated: any = [
        {
          id: 'slide-regenerated-temp',
          title: 'Regenerated by AI: Unit 3 Exercise',
          subtitle: 'Choose the best option',
          layout: 'single_column',
          isGraded: true,
          referenceContent: null,
          interaction: {
            type: 'selection',
            instruction: 'Choose the best option',
            questions: [
              {
                id: 'q1',
                prompt: 'Where are you from?',
                options: [
                  { id: 'o1', text: 'I am from Canada', isCorrect: true },
                  { id: 'o2', text: 'Yes, I am', isCorrect: false },
                ],
              },
            ],
          },
          _sourceImage: sourceImage,
          _rawExtraction: { regenerated: true },
          _answerKeyCrop: answerKeyCrop,
        },
      ];

      const digitizeSpy = vi.spyOn(digitizeBookModule, 'digitizeBook').mockResolvedValue(mockRegenerated);

      const success = await useLessonStore.getState().regenerateActiveSlideWithAI();

      expect(success).toBe(true);
      expect(digitizeSpy).toHaveBeenCalledTimes(1);
      // Confirma que envió la imagen en memoria y el solucionario
      expect(digitizeSpy.mock.calls[0][0]).toEqual([sourceImage, answerKeyCrop]);

      const finalSlide = useLessonStore.getState().lesson.slides[0];
      // Mantiene el ID original de la diapositiva
      expect(finalSlide.id).toBe('slide-ai-target');
      expect(finalSlide.title).toBe('Regenerated by AI: Unit 3 Exercise');
      expect(finalSlide._sourceImage).toBe(sourceImage);
      expect(finalSlide._answerKeyCrop).toBe(answerKeyCrop);
      expect(finalSlide.interaction?.type).toBe('selection');

      // Toast emitido
      expect(useLessonStore.getState().saveFeedback).toEqual({
        message: 'Diapositiva regenerada con IA',
        timestamp: expect.any(Number),
      });
    });
  });
});
