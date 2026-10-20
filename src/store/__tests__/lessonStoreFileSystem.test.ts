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
});
