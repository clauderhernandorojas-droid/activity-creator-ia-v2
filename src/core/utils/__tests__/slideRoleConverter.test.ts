import { describe, it, expect } from 'vitest';
import { convertSlideToRole, getCurrentRole } from '../slideRoleConverter';
import { hasDataForRole } from '../../ai/digitizeBook';
import type { Slide, StructuredReferenceBlock, InputFieldsBlock } from '../../../types/schema';

describe('slideRoleConverter & Archetype State Persistence', () => {
  it('convierte reference_table a reference_text preservando reglas explicativas, columnas y tips en formato Markdown', () => {
    const tableSlide: Slide = {
      id: 'slide-theory-1',
      title: 'Present Perfect: Rules and Paradigm',
      layout: 'single_column',
      isGraded: false,
      referenceContent: {
        type: 'reference_table',
        id: 'ref-tbl-1',
        title: 'Verb Forms Matrix',
        instruction: 'Study the rules and forms below:',
        body: 'Rule 1: Use have/has + past participle for experiences.\nRule 2: Never use did with present perfect.',
        columns: [
          { header: 'Affirmative', items: ['I have worked', 'She has lived'] },
          { header: 'Negative', items: ["I haven't worked", "She hasn't lived"] },
        ],
        caption: 'Remember to check irregular participles in the appendix.',
      } as StructuredReferenceBlock,
      interaction: null,
    };

    expect(getCurrentRole(tableSlide)).toBe('reference_table');

    const textSlide = convertSlideToRole(tableSlide, 'reference_text');
    expect(getCurrentRole(textSlide)).toBe('reference_text');

    expect(textSlide.referenceContent).not.toBeNull();
    expect(textSlide.referenceContent?.type).toBe('text');
    expect(textSlide.interaction).toBeNull();

    if (textSlide.referenceContent?.type === 'text') {
      // Debe contener las reglas del body
      expect(textSlide.referenceContent.content).toContain('Rule 1: Use have/has');
      expect(textSlide.referenceContent.content).toContain('Rule 2: Never use did');
      // Debe contener las columnas organizadas
      expect(textSlide.referenceContent.content).toContain('Affirmative');
      expect(textSlide.referenceContent.content).toContain('I have worked');
      // Debe contener el tip / caption
      expect(textSlide.referenceContent.content).toContain('Remember to check irregular participles');
    }

    // Verifica que el payload original de reference_table quedó guardado en rolePayloadCache
    expect(textSlide.rolePayloadCache).toBeDefined();
    expect(textSlide.rolePayloadCache?.['reference_table']).toEqual(tableSlide.referenceContent);
  });

  it('restaura el reference_table original intacto desde rolePayloadCache al alternar de vuelta sin re-extracción', () => {
    const tableSlide: Slide = {
      id: 'slide-theory-2',
      title: 'Grammar Focus',
      layout: 'single_column',
      isGraded: false,
      referenceContent: {
        type: 'reference_table',
        id: 'ref-tbl-2',
        title: 'Vocabulary Table',
        instruction: 'Review collocations:',
        body: 'Tip: Always learn verbs with their dependent prepositions.',
        columns: [
          { header: 'Verbs', items: ['depend on', 'listen to'] },
        ],
        caption: 'High frequency in IELTS.',
      } as StructuredReferenceBlock,
      interaction: null,
    };

    // 1. Convertir a texto
    const textSlide = convertSlideToRole(tableSlide, 'reference_text');
    expect(textSlide.referenceContent?.type).toBe('text');

    // 2. Convertir de vuelta a cuadro
    const restoredTableSlide = convertSlideToRole(textSlide, 'reference_table');
    expect(restoredTableSlide.referenceContent?.type).toBe('reference_table');
    expect(restoredTableSlide.referenceContent).toEqual(tableSlide.referenceContent);
  });

  it('preserva las oraciones e ítems al alternar entre input_fields y selection', () => {
    const inputSlide: Slide = {
      id: 'slide-practice-1',
      title: 'Fill in the blanks practice',
      layout: 'single_column',
      isGraded: true,
      referenceContent: null,
      interaction: {
        type: 'input_fields',
        id: 'int-inp-1',
        instruction: 'Complete with was or were:',
        layoutMode: 'list',
        listItems: [
          {
            id: 'item-1',
            prompt: '1. Yesterday I _______ at home.',
            expectedAnswer: 'was',
            acceptedAnswers: ['was'],
          },
          {
            id: 'item-2',
            prompt: '2. They _______ happy to see us.',
            expectedAnswer: 'were',
            acceptedAnswers: ['were'],
          },
        ],
        tableHeaders: [],
        tableRows: [],
        paragraphTemplate: '',
        paragraphInputs: {},
      } as InputFieldsBlock,
    };

    // 1. Convertir a selección
    const selectionSlide = convertSlideToRole(inputSlide, 'interaction_selection');
    expect(selectionSlide.interaction?.type).toBe('selection');
    if (selectionSlide.interaction?.type === 'selection') {
      expect(selectionSlide.interaction.questions).toHaveLength(2);
      expect(selectionSlide.interaction.questions[0].prompt).toContain('Yesterday I _______ at home.');
      expect(selectionSlide.interaction.questions[0].options[0].text).toBe('was');
      expect(selectionSlide.interaction.questions[0].options[0].isCorrect).toBe(true);
    }

    // 2. Convertir de vuelta a input_fields (debe restaurar desde cache)
    const restoredInputSlide = convertSlideToRole(selectionSlide, 'interaction_inputs');
    expect(restoredInputSlide.interaction?.type).toBe('input_fields');
    expect(restoredInputSlide.interaction).toEqual(inputSlide.interaction);
  });

  it('hasDataForRole detecta datos cuando existe un payload en rolePayloadCache', () => {
    const slideWithCache: Slide = {
      id: 'slide-cached-1',
      title: 'Cached Slide',
      layout: 'single_column',
      referenceContent: {
        type: 'text',
        id: 'ref-txt-1',
        title: 'Notes',
        content: 'Some notes',
        category: 'reading',
      },
      interaction: null,
      rolePayloadCache: {
        reference_table: {
          type: 'reference_table',
          id: 'ref-tbl-cached',
          title: 'Cached Table',
          columns: [{ header: 'A', items: ['1'] }],
        },
      },
    };

    // Para reference_text tiene datos directos
    expect(hasDataForRole(slideWithCache, 'reference_text')).toBe(true);
    // Para reference_table tiene datos en el cache
    expect(hasDataForRole(slideWithCache, 'reference_table')).toBe(true);
  });
});
