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

  describe('4. Inyección de Contexto Contextual (previousSlide) y Rescate de Raw Answer Key en reprocessSlide', () => {
    const mockPreviousSlide: Slide = {
      id: 'slide-prev-matching',
      title: 'Exercise 5a: Match sentence halves',
      layout: 'single_column',
      interaction: {
        id: 'int-prev',
        type: 'input_fields',
        instruction: 'Match the sentence halves',
        layoutMode: 'list',
        listItems: [
          { id: 'item-1', prompt: '1. She decided to go to the party', expectedAnswer: 'although she felt tired.', acceptedAnswers: ['although she felt tired.'] },
          { id: 'item-2', prompt: '2. He arrived on time', expectedAnswer: 'because he took a taxi.', acceptedAnswers: ['because he took a taxi.'] },
          { id: 'item-3', prompt: '3. We postponed the match', expectedAnswer: 'since it was raining heavily.', acceptedAnswers: ['since it was raining heavily.'] },
          { id: 'item-4', prompt: '4. I will call you', expectedAnswer: 'as soon as I arrive at the station.', acceptedAnswers: ['as soon as I arrive at the station.'] },
          { id: 'item-5', prompt: '5. They went for a walk', expectedAnswer: 'despite the bad weather.', acceptedAnswers: ['despite the bad weather.'] },
          { id: 'item-6', prompt: '6. Even though he studied hard', expectedAnswer: 'he did not pass the test.', acceptedAnswers: ['he did not pass the test.'] },
          { id: 'item-7', prompt: '7. Unless you hurry up', expectedAnswer: 'we will miss the train.', acceptedAnswers: ['we will miss the train.'] },
          { id: 'item-8', prompt: '8. In case of an emergency', expectedAnswer: 'press the red alarm button.', acceptedAnswers: ['press the red alarm button.'] },
          { id: 'item-9', prompt: '9. While we were waiting', expectedAnswer: 'it started snowing.', acceptedAnswers: ['it started snowing.'] },
        ],
        tableHeaders: [],
        tableRows: [],
        paragraphTemplate: '',
        paragraphInputs: {},
      },
    };

    it('re-procesa buckets_matching rescatando rawKey desde _rawExtraction.answersText e inyectando previousSlide determinísticamente', () => {
      const rawBucketsPayload = {
        title: 'Exercise 5b: Group the sentences',
        subtitle: 'Put sentences 1-9 from 5a into the correct category',
        interaction: {
          type: 'buckets_matching',
          instruction: 'Put sentences 1-9 into categories',
          buckets: [
            { id: 'slot-A', label: 'A · Contrast', _exampleMarker: '1' },
            { id: 'slot-B', label: 'B · Cause', items: [] },
            { id: 'slot-C', label: 'C · Time and Condition', items: [] },
          ],
          tokens: [],
        },
        _rawExtraction: {
          title: 'Exercise 5b: Group the sentences',
          answersText: 'A2; 6; 9 B3 C4; 5; 7; 8',
          interaction: {
            type: 'buckets_matching',
            buckets: [
              { id: 'slot-A', label: 'A · Contrast', _exampleMarker: '1' },
              { id: 'slot-B', label: 'B · Cause' },
              { id: 'slot-C', label: 'C · Time and Condition' },
            ],
          },
        },
      };

      const bucketsSlide: Slide = {
        id: 'slide-buckets-curr',
        title: 'Exercise 5b: Group the sentences',
        layout: 'single_column',
        interaction: {
          id: 'int-buckets',
          type: 'buckets_matching',
          instruction: 'Put sentences 1-9 into categories',
          buckets: [
            { id: 'slot-A', label: 'A · Contrast', items: [] },
            { id: 'slot-B', label: 'B · Cause', items: [] },
            { id: 'slot-C', label: 'C · Time and Condition', items: [] },
          ],
          tokens: [],
        },
        _rawExtraction: rawBucketsPayload._rawExtraction,
      };

      useLessonStore.setState({
        lesson: {
          ...defaultInitialLesson,
          slides: [mockPreviousSlide, bucketsSlide],
        },
        activeSlideId: 'slide-buckets-curr',
      });

      // 1. Ejecutar reprocessSlide sin argumentos explícitos: debe resolver previousSlide determinísticamente desde idx - 1
      const success = useLessonStore.getState().reprocessSlide();
      expect(success).toBe(true);

      const updatedSlide = useLessonStore.getState().lesson.slides[1];
      expect(updatedSlide.id).toBe('slide-buckets-curr');
      expect(updatedSlide.interaction?.type).toBe('buckets_matching');

      const tokens = (updatedSlide.interaction as any).tokens;
      // Exactamente 9 tokens: 1 ejemplo (k=1) + 8 interactivos (k=2..9)
      expect(tokens).toHaveLength(9);

      // Token ejemplo
      const exampleToken = tokens.find((t: any) => t.isExample);
      expect(exampleToken).toBeDefined();
      expect(exampleToken.correctBucketId).toBe('slot-A');
      expect(exampleToken.text).toBe('She decided to go to the party although she felt tired.');

      // Tokens interactivos
      const interactiveTokens = tokens.filter((t: any) => !t.isExample);
      expect(interactiveTokens).toHaveLength(8);

      const bucketMap: Record<string, string> = {};
      tokens.forEach((t: any) => {
        bucketMap[t.text] = t.correctBucketId;
      });

      // Clave: A2; 6; 9 B3 C4; 5; 7; 8
      // Ordinal 2 -> slot-A
      expect(bucketMap['He arrived on time because he took a taxi.']).toBe('slot-A');
      // Ordinal 3 -> slot-B
      expect(bucketMap['We postponed the match since it was raining heavily.']).toBe('slot-B');
      // Ordinal 4 -> slot-C
      expect(bucketMap['I will call you as soon as I arrive at the station.']).toBe('slot-C');
      // Ordinal 5 -> slot-C
      expect(bucketMap['They went for a walk despite the bad weather.']).toBe('slot-C');
      // Ordinal 6 -> slot-A
      expect(bucketMap['Even though he studied hard he did not pass the test.']).toBe('slot-A');
      // Ordinal 7 -> slot-C
      expect(bucketMap['Unless you hurry up we will miss the train.']).toBe('slot-C');
      // Ordinal 8 -> slot-C
      expect(bucketMap['In case of an emergency press the red alarm button.']).toBe('slot-C');
      // Ordinal 9 -> slot-A
      expect(bucketMap['While we were waiting it started snowing.']).toBe('slot-A');

      // Idempotencia: Una segunda ejecución de reprocessSlide debe producir exactamente el mismo resultado
      const secondSuccess = useLessonStore.getState().reprocessSlide();
      expect(secondSuccess).toBe(true);
      const reUpdatedSlide = useLessonStore.getState().lesson.slides[1];
      expect((reUpdatedSlide.interaction as any).tokens).toHaveLength(9);
    });

    it('rescata rawKey alternativamente desde slide.answerKeyText o interaction.answerKey si no está en _rawExtraction', () => {
      const rawBucketsPayload = {
        title: 'Exercise 5b: Classification',
        subtitle: 'Classify sentences from previous slide',
        interaction: {
          type: 'buckets_matching',
          buckets: [
            { id: 'b-1', label: 'A · Contrast', _exampleMarker: '1' },
            { id: 'b-2', label: 'B · Cause' },
            { id: 'b-3', label: 'C · Time' },
          ],
        },
      };

      const bucketsSlide: Slide = {
        id: 'slide-buckets-2',
        title: 'Exercise 5b: Classification',
        layout: 'single_column',
        answerKeyText: 'A2; 6; 9 B3 C4; 5; 7; 8',
        interaction: {
          id: 'int-b2',
          type: 'buckets_matching',
          instruction: 'Classify sentences',
          buckets: [
            { id: 'b-1', label: 'A · Contrast' },
            { id: 'b-2', label: 'B · Cause' },
            { id: 'b-3', label: 'C · Time' },
          ],
          tokens: [],
        },
        _rawExtraction: rawBucketsPayload,
      };

      useLessonStore.setState({
        lesson: {
          ...defaultInitialLesson,
          slides: [mockPreviousSlide, bucketsSlide],
        },
        activeSlideId: 'slide-buckets-2',
      });

      const success = useLessonStore.getState().reprocessSlide(bucketsSlide, { previousSlide: mockPreviousSlide });
      expect(success).toBe(true);

      const updatedSlide = useLessonStore.getState().lesson.slides[1];
      const tokens = (updatedSlide.interaction as any).tokens;
      expect(tokens).toHaveLength(9);

      const token3 = tokens.find((t: any) => t.text.includes('postponed the match'));
      expect(token3.correctBucketId).toBe('b-2');
    });
  });
});

