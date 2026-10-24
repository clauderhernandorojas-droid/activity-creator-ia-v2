import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useLessonStore, defaultInitialLesson } from '../useLessonStore';

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

describe('useLessonStore - File System Access API & Quick Save', () => {
  beforeEach(() => {
    useLessonStore.setState({
      lesson: JSON.parse(JSON.stringify(defaultInitialLesson)),
      activeSlideId: defaultInitialLesson.slides[0].id,
      currentFileHandle: null,
      saveFeedback: null,
      past: [],
      future: [],
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (window as any).showOpenFilePicker;
    delete (window as any).showSaveFilePicker;
  });

  it('inicia con currentFileHandle en null y saveFeedback en null', () => {
    const state = useLessonStore.getState();
    expect(state.currentFileHandle).toBeNull();
    expect(state.saveFeedback).toBeNull();
  });

  it('saveLesson sobrescribe directamente en el archivo vinculado si currentFileHandle existe', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });

    const mockHandle: any = {
      name: 'MyClass_Unit1.elt.json',
      createWritable: createWritableMock,
      queryPermission: vi.fn().mockResolvedValue('granted'),
    };

    useLessonStore.setState({ currentFileHandle: mockHandle });

    const success = await useLessonStore.getState().saveLesson();

    expect(success).toBe(true);
    expect(createWritableMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    // Verificamos que se haya escrito el JSON de la lección
    const writtenData = JSON.parse(writeMock.mock.calls[0][0]);
    expect(writtenData.title).toBe(defaultInitialLesson.title);
    expect(closeMock).toHaveBeenCalledTimes(1);

    // Feedback visual
    expect(useLessonStore.getState().saveFeedback?.message).toBe('Guardado en MyClass_Unit1.elt.json');
  });

  it('saveLesson solicita ubicación con showSaveFilePicker si currentFileHandle es null y almacena el handle', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });

    const mockNewHandle: any = {
      name: 'Nueva_Leccion.elt.json',
      createWritable: createWritableMock,
    };

    window.showSaveFilePicker = vi.fn().mockResolvedValue(mockNewHandle);

    const success = await useLessonStore.getState().saveLesson();

    expect(success).toBe(true);
    expect(window.showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(createWritableMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);

    // El store ahora conserva el nuevo handle vinculado para subsiguientes Quick Saves
    expect(useLessonStore.getState().currentFileHandle).toBe(mockNewHandle);
    expect(useLessonStore.getState().saveFeedback?.message).toBe('Guardado en Nueva_Leccion.elt.json');
  });

  it('openLessonWithPicker abre el archivo, valida el esquema, carga la lección y vincula el handle', async () => {
    const lessonData = {
      id: 'lesson-imported-1',
      title: 'Vocabulary & Grammar B1',
      level: 'B1',
      unit: 'Unit 4',
      slides: [
        {
          id: 'slide-imp-1',
          title: 'Jobs in Tech',
          subtitle: 'Choose the correct word',
          layout: 'single_column',
          referenceContent: null,
          interaction: null,
          notes: '',
          isGraded: true,
        },
      ],
    };

    const mockFile = {
      text: vi.fn().mockResolvedValue(JSON.stringify(lessonData)),
    };

    const mockOpenedHandle: any = {
      name: 'Unit4_Tech.elt.json',
      getFile: vi.fn().mockResolvedValue(mockFile),
    };

    window.showOpenFilePicker = vi.fn().mockResolvedValue([mockOpenedHandle]);

    const opened = await useLessonStore.getState().openLessonWithPicker();

    expect(opened).toBe(true);
    expect(window.showOpenFilePicker).toHaveBeenCalledTimes(1);
    expect(useLessonStore.getState().currentFileHandle).toBe(mockOpenedHandle);
    expect(useLessonStore.getState().lesson.title).toBe('Vocabulary & Grammar B1');
    expect(useLessonStore.getState().lesson.slides).toHaveLength(1);
    expect(useLessonStore.getState().saveFeedback?.message).toBe('Abierto: Unit4_Tech.elt.json');
  });

  it('saveLessonAs crea una copia independiente invocando showSaveFilePicker con el nombre sugerido', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const createWritableMock = vi.fn().mockResolvedValue({
      write: writeMock,
      close: closeMock,
    });

    const mockCopyHandle: any = {
      name: 'Copia_Leccion.elt.json',
      createWritable: createWritableMock,
    };

    window.showSaveFilePicker = vi.fn().mockResolvedValue(mockCopyHandle);

    const success = await useLessonStore.getState().saveLessonAs();

    expect(success).toBe(true);
    expect(window.showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(createWritableMock).toHaveBeenCalledTimes(1);
    expect(useLessonStore.getState().currentFileHandle).toBe(mockCopyHandle);
    expect(useLessonStore.getState().saveFeedback?.message).toBe('Copia guardada en Copia_Leccion.elt.json');
  });

  it('clearLesson desvincula currentFileHandle devolviéndolo a null', () => {
    const mockHandle: any = { name: 'OldFile.elt.json' };
    useLessonStore.setState({ currentFileHandle: mockHandle });

    useLessonStore.getState().clearLesson();

    expect(useLessonStore.getState().currentFileHandle).toBeNull();
    expect(useLessonStore.getState().lesson.slides).toHaveLength(0);
  });

  it('migración defensiva retrocompatible: hidrata _rawExtraction, _sourceImage, items en buckets y permite metadatos desconocidos con .passthrough()', () => {
    const legacyLesson = {
      id: 'lesson-legacy-99',
      title: 'Legacy ELT Lesson',
      level: 'B1',
      unit: 'Unit 2',
      customPluginMetadata: { version: '1.0.0', author: 'ELT Publisher' },
      slides: [
        {
          id: 'slide-leg-1',
          title: 'Classification Activity',
          layout: 'unknown_old_layout',
          legacySlideTag: 'review_unit',
          interaction: {
            type: 'buckets_matching',
            id: 'bm-1',
            instruction: 'Classify words into groups',
            buckets: [
              { id: 'b1', label: 'Fruits' }, // missing items: []
              { id: 'b2', label: 'Vegetables' } // missing items: []
            ],
            tokens: [
              { id: 'tok-1', text: 'Apple', correctBucketId: 'b1' },
              { id: 'tok-2', text: 'Carrot', correctBucketId: 'b2' }
            ]
          }
        }
      ]
    };

    const mockHandle: any = { name: 'Legacy_Unit2.elt.json' };
    const success = useLessonStore.getState().openLesson(legacyLesson, mockHandle);

    expect(success).toBe(true);
    const state = useLessonStore.getState();

    // Actualización forzada de estado al abrir
    expect(state.lessonName).toBe('Legacy ELT Lesson');
    expect(state.slides).toHaveLength(1);
    expect(state.activeSlideIndex).toBe(0);
    expect(state.fileHandle).toBe(mockHandle);
    expect(state.currentFileHandle).toBe(mockHandle);
    expect(state.hasUnsavedChanges).toBe(false);
    expect(state.canUndo).toBe(false);
    expect(state.saveFeedback?.message).toBe('Abierto: Legacy_Unit2.elt.json');

    // Hidratación defensiva retrocompatible
    const slide = state.lesson.slides[0];
    expect(slide.layout).toBe('split_50_50'); // normalized fallback
    expect(slide._rawExtraction).toBeNull();
    expect(slide._sourceImage).toBeNull();
    expect(slide._answerKeyCrop).toBeNull();

    // Passthrough de metadatos antiguos
    expect((slide as any).legacySlideTag).toBe('review_unit');
    expect((state.lesson as any).customPluginMetadata).toEqual({ version: '1.0.0', author: 'ELT Publisher' });

    // TargetSlots / buckets hidratados con items: []
    const interaction = slide.interaction as any;
    expect(interaction.buckets[0].items).toEqual([]);
    expect(interaction.buckets[1].items).toEqual([]);
    expect(interaction.targetSlots[0].items).toEqual([]);
  });

  it('diagnóstico de error: si safeParse falla, imprime console.error con format() y emite toast visible', () => {
    const invalidLesson = {
      id: 'invalid-lesson',
      slides: [
        {
          id: 'slide-fail',
          title: 'Bad Interaction',
          interaction: {
            type: 'completely_unsupported_interaction_type',
            id: 'bad-1',
          }
        }
      ]
    };

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const success = useLessonStore.getState().openLesson(invalidLesson);

    expect(success).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error validando lección:',
      expect.objectContaining({
        _errors: expect.any(Array),
      })
    );

    const feedback = useLessonStore.getState().saveFeedback;
    expect(feedback?.message).toBe('No se pudo cargar la lección: estructura incompatible');

    consoleErrorSpy.mockRestore();
  });

  it('loadLessonFromFile procesa un archivo File válido, resetea estado y sincroniza propiedades', async () => {
    const validJson = {
      title: 'Grammar in Context',
      level: 'B2',
      slides: [
        {
          id: 'slide-f1',
          title: 'Conditionals',
          layout: 'single_column',
          isGraded: true,
        },
        {
          id: 'slide-f2',
          title: 'Practice',
          layout: 'split_50_50',
          isGraded: true,
        }
      ]
    };

    const mockFile: any = {
      name: 'Grammar_B2.elt.json',
      text: vi.fn().mockResolvedValue(JSON.stringify(validJson)),
    };

    // Dirty state before load
    useLessonStore.setState({ hasUnsavedChanges: true });

    const success = await useLessonStore.getState().loadLessonFromFile(mockFile);

    expect(success).toBe(true);
    const state = useLessonStore.getState();
    expect(state.lessonName).toBe('Grammar in Context');
    expect(state.slides).toHaveLength(2);
    expect(state.activeSlideIndex).toBe(0);
    expect(state.hasUnsavedChanges).toBe(false);
    expect(state.canUndo).toBe(false);
    expect(state.saveFeedback?.message).toBe('Abierto: Grammar_B2.elt.json');
  });

  it('loadLessonFromFile captura JSON malformado y emite toast de estructura incompatible', async () => {
    const corruptedFile: any = {
      name: 'Corrupted.elt.json',
      text: vi.fn().mockResolvedValue('{ "invalidJson": [ unclosed array'),
    };

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const success = await useLessonStore.getState().loadLessonFromFile(corruptedFile);

    expect(success).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error validando lección:',
      expect.anything()
    );
    expect(useLessonStore.getState().saveFeedback?.message).toBe('No se pudo cargar la lección: estructura incompatible');

    consoleErrorSpy.mockRestore();
  });
});
