import { describe, it, expect, beforeEach } from 'vitest';
import { useLessonStore, defaultInitialLesson } from '../useLessonStore';

describe('useLessonStore - Multi-Slide Insertion & Initial Empty Slide Cleanup', () => {
  beforeEach(() => {
    // Reset store to fresh initial state
    useLessonStore.setState({
      lesson: JSON.parse(JSON.stringify(defaultInitialLesson)),
      activeSlideId: defaultInitialLesson.slides[0].id,
      extractedBlocks: [],
      past: [],
      future: [],
    });
  });

  it('debe reemplazar el slide inicial vacío al crear un slide único en vez de dejarlo como huérfano al inicio', () => {
    const mockBlock: any = {
      id: 'ext-block-1',
      title: 'Grammar Exercise 1',
      subtitle: 'Complete with past simple',
      layout: 'single_column',
      isGraded: true,
      referenceContent: null,
      interaction: {
        id: 'int-1',
        type: 'input_fields',
        instruction: 'Complete the blanks',
        layoutMode: 'list',
        listItems: [
          { id: 'i1', prompt: 'He {{blank}} yesterday', expectedAnswer: 'worked', acceptedAnswers: ['worked'] }
        ],
        tableHeaders: [],
        tableRows: [],
        paragraphTemplate: '',
        paragraphInputs: {}
      },
      rawText: '...',
      confidence: 1,
      detectedType: 'numbered_list',
      parsedData: {}
    };

    useLessonStore.setState({ extractedBlocks: [mockBlock] });

    // Estado inicial: 1 slide por defecto ('Diapositiva 1')
    expect(useLessonStore.getState().lesson.slides).toHaveLength(1);
    expect(useLessonStore.getState().lesson.slides[0].title).toBe('Diapositiva 1');

    // Ejecuta creación
    const newSlideId = useLessonStore.getState().createSlideFromBlock('ext-block-1');

    const updatedSlides = useLessonStore.getState().lesson.slides;
    // Invariante: Se reemplaza el slide inicial vacío, resultando en exactamente 1 slide con contenido
    expect(updatedSlides).toHaveLength(1);
    expect(updatedSlides[0].id).toBe(newSlideId);
    expect(updatedSlides[0].title).toBe('Grammar Exercise 1');
    expect(updatedSlides[0].interaction?.type).toBe('input_fields');
    expect(useLessonStore.getState().activeSlideId).toBe(newSlideId);
  });

  it('debe crear e insertar todos los bloques con createSlidesFromAllBlocks reemplazando el slide inicial vacío', () => {
    const mockBlocks: any[] = [
      {
        id: 'ext-block-1',
        title: 'Exercise 1: Matching',
        layout: 'single_column',
        isGraded: true,
        referenceContent: null,
        interaction: {
          id: 'int-1',
          type: 'selection',
          instruction: 'Choose',
          options: [{ id: 'o1', text: 'Opt 1', isCorrect: true }],
          questions: []
        },
        rawText: '...',
        confidence: 1,
        detectedType: 'numbered_list',
        parsedData: {}
      },
      {
        id: 'ext-block-2',
        title: 'Exercise 2: Buckets',
        layout: 'single_column',
        isGraded: true,
        referenceContent: null,
        interaction: {
          id: 'int-2',
          type: 'buckets_matching',
          instruction: 'Sort',
          buckets: [{ id: 'b1', label: 'Box' }],
          tokens: [{ id: 't1', text: 'Token', correctBucketId: 'b1' }]
        },
        rawText: '...',
        confidence: 1,
        detectedType: 'numbered_list',
        parsedData: {}
      }
    ];

    useLessonStore.setState({ extractedBlocks: mockBlocks });

    // Ejecuta creación de lote completo
    const createdIds = useLessonStore.getState().createSlidesFromAllBlocks();

    expect(createdIds).toHaveLength(2);
    const updatedSlides = useLessonStore.getState().lesson.slides;

    // Invariante: 2 slides creados sin dejar la diapositiva en blanco al inicio
    expect(updatedSlides).toHaveLength(2);
    expect(updatedSlides[0].title).toBe('Exercise 1: Matching');
    expect(updatedSlides[0].interaction?.type).toBe('selection');

    expect(updatedSlides[1].title).toBe('Exercise 2: Buckets');
    expect(updatedSlides[1].interaction?.type).toBe('buckets_matching');

    // Invariante: La primera diapositiva recién importada queda como activa
    expect(useLessonStore.getState().activeSlideId).toBe(createdIds[0]);
  });

  it('debe concatenar al final si la lección ya contiene diapositivas con contenido previo', () => {
    // Configura lección previa con 1 slide real con contenido
    const existingSlide: any = {
      id: 'existing-slide-1',
      title: 'Previous Warmup Activity',
      layout: 'single_column',
      referenceContent: null,
      interaction: {
        id: 'int-warmup',
        type: 'writing',
        instruction: 'Discuss with partner',
        prompt: 'Talk about your day',
        guidelines: []
      },
      isGraded: false
    };

    const newExtractedBlock: any = {
      id: 'ext-block-new',
      title: 'Imported Activity',
      layout: 'single_column',
      isGraded: true,
      referenceContent: null,
      interaction: {
        id: 'int-new',
        type: 'selection',
        instruction: 'Select',
        options: [{ id: 'o1', text: 'A', isCorrect: true }],
        questions: []
      },
      rawText: '',
      confidence: 1,
      detectedType: 'numbered_list',
      parsedData: {}
    };

    useLessonStore.setState({
      lesson: {
        id: 'lesson-1',
        title: 'My Lesson',
        level: 'B1',
        unit: '1',
        slides: [existingSlide]
      },
      activeSlideId: 'existing-slide-1',
      extractedBlocks: [newExtractedBlock]
    });

    const newSlideId = useLessonStore.getState().createSlideFromBlock('ext-block-new');

    const updatedSlides = useLessonStore.getState().lesson.slides;
    // Invariante: NO se reemplaza si el slide previo ya tenía contenido, se concatena
    expect(updatedSlides).toHaveLength(2);
    expect(updatedSlides[0].id).toBe('existing-slide-1');
    expect(updatedSlides[1].id).toBe(newSlideId);
    expect(useLessonStore.getState().activeSlideId).toBe(newSlideId);
  });
});
