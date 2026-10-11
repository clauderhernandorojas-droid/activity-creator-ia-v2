import { describe, it, expect } from 'vitest';
import {
  mapBlockToSelection,
  mapBlockToInputFields,
  mapBlockToWriting,
  mapBlockToRole
} from '../payloadMapper';
import type { ExtractedBlock } from '../../../types/schema';

describe('payloadMapper - Architectural Invariants & Primitive Catalog Tests', () => {

  // =========================================================================
  // CASO A: Selección vs Matching (Invariante de Preservación de Texto)
  // =========================================================================
  describe('Caso A: Selección vs Matching', () => {
    it('debe mapear a selection (Flat Cards / Checklist) con texto íntegro ante consignas de selección', () => {
      const block: ExtractedBlock = {
        id: 'block-sel-1',
        rawText: `Which two questions ask about the past?
1. Where were you born?
2. What are you doing now?
3. Did you see that movie yesterday?
4. Where do you live?`,
        detectedType: 'numbered_list',
        confidence: 0.95,
        parsedData: {
          title: 'Past Tense Recognition',
          instruction: 'Which two questions ask about the past? Select the correct options:',
          interactionType: 'selection',
          items: [
            {
              prompt: 'Where were you born?',
              expectedAnswer: 'true',
              acceptedAnswers: ['true'],
              isExample: false,
              explanation: 'Past simple with was/were'
            },
            {
              prompt: 'What are you doing now?',
              expectedAnswer: 'false',
              acceptedAnswers: ['false'],
              isExample: false,
              explanation: 'Present continuous'
            },
            {
              prompt: 'Did you see that movie yesterday?',
              expectedAnswer: 'true',
              acceptedAnswers: ['true'],
              isExample: false,
              explanation: 'Past simple with did'
            },
            {
              prompt: 'Where do you live?',
              expectedAnswer: 'false',
              acceptedAnswers: ['false'],
              isExample: false,
              explanation: 'Present simple'
            }
          ]
        }
      };

      const selectionBlock = mapBlockToSelection(block);

      // 1. Debe ser estrictamente tipo 'selection'
      expect(selectionBlock.type).toBe('selection');

      // 2. Debe contener flat options para permitir checklist/selección directa
      expect(selectionBlock.options).toBeDefined();
      expect(selectionBlock.options!.length).toBe(4);

      // 3. Debe preservar los textos íntegros originales
      expect(selectionBlock.options![0].text).toBe('Where were you born?');
      expect(selectionBlock.options![1].text).toBe('What are you doing now?');
      expect(selectionBlock.options![2].text).toBe('Did you see that movie yesterday?');
      expect(selectionBlock.options![3].text).toBe('Where do you live?');

      // 4. Invariante: NO debe inventar permutaciones sintéticas como ["1, 2", "1, 3"]
      selectionBlock.options!.forEach((opt) => {
        expect(opt.text).not.toMatch(/^\d+(?:\s*[,&y+]\s*\d+)+$/);
        expect(opt.text).not.toBe('1, 2');
        expect(opt.text).not.toBe('1, 3');
        expect(opt.text).not.toBe('2, 4');
      });

      // 5. Invariante: NO debe usar modo 'dropdown'
      if (selectionBlock.questions && selectionBlock.questions.length > 0) {
        selectionBlock.questions.forEach((q) => {
          expect(q.mode).not.toBe('dropdown');
        });
      }

      // 6. Verificar resolución correcta esperada
      expect(selectionBlock.options![0].isCorrect).toBe(true);
      expect(selectionBlock.options![1].isCorrect).toBe(false);
      expect(selectionBlock.options![2].isCorrect).toBe(true);
      expect(selectionBlock.options![3].isCorrect).toBe(false);
    });

    it('debe rechazar dropdowns de correspondencia si no existen dos dominios diferenciados', () => {
      const block: ExtractedBlock = {
        id: 'block-sel-2',
        rawText: `Tick the sentences that are true for you:
1. I have never been to Tokyo.
2. I like drinking black coffee.
3. I wake up before 6 AM.`,
        detectedType: 'numbered_list',
        confidence: 0.98,
        parsedData: {
          title: 'Personal Survey',
          instruction: 'Tick the sentences that are true for you:',
          interactionType: 'selection',
          isGraded: false,
          items: [
            { prompt: 'I have never been to Tokyo.', expectedAnswer: 'true' },
            { prompt: 'I like drinking black coffee.', expectedAnswer: 'true' },
            { prompt: 'I wake up before 6 AM.', expectedAnswer: 'false' }
          ]
        }
      };

      const result = mapBlockToRole(block, 'interaction_inputs');

      // Debe enrutar determinísticamente a selection
      expect(result.interaction?.type).toBe('selection');
      if (result.interaction && result.interaction.type === 'selection') {
        expect(result.interaction.options).toBeDefined();
        expect(result.interaction.options?.length).toBe(3);
        expect(result.interaction.options?.[0].text).toBe('I have never been to Tokyo.');
        expect(result.interaction.questions?.length || 0).toBe(0);
      }
    });
  });

  // =========================================================================
  // CASO B: Tabla de Referencia + Preguntas Independientes
  // =========================================================================
  describe('Caso B: Tabla de Referencia + Preguntas', () => {
    it('debe desacoplar tabla informativa en referenceContent y preguntas en input_fields con wordBank vacío', () => {
      const block: ExtractedBlock = {
        id: 'block-ref-table-1',
        rawText: `Train Schedule:
| Destination | Departure | Platform |
| London      | 08:30     | 4        |
| Paris       | 10:15     | 2        |
| Madrid      | 14:00     | 7        |

Answer the questions:
1. What time does the train to Paris leave?
2. Which platform is the train to London on?`,
        detectedType: 'table',
        confidence: 0.92,
        parsedData: {
          title: 'Train Timetable Comprehension',
          instruction: 'Look at the train schedule and answer the questions:',
          interactionType: 'fill_blanks',
          tableHeaders: ['Destination', 'Departure', 'Platform'],
          tableRows: [
            [
              { text: 'London', isInput: false },
              { text: '08:30', isInput: false },
              { text: '4', isInput: false }
            ],
            [
              { text: 'Paris', isInput: false },
              { text: '10:15', isInput: false },
              { text: '2', isInput: false }
            ],
            [
              { text: 'Madrid', isInput: false },
              { text: '14:00', isInput: false },
              { text: '7', isInput: false }
            ]
          ],
          items: [
            {
              prompt: 'What time does the train to Paris leave?',
              expectedAnswer: '10:15',
              acceptedAnswers: ['10:15', '10:15 AM', 'at 10:15'],
              explanation: 'Found in row 2'
            },
            {
              prompt: 'Which platform is the train to London on?',
              expectedAnswer: 'Platform 4',
              acceptedAnswers: ['Platform 4', '4'],
              explanation: 'Found in row 1'
            }
          ],
          wordBank: ['London', 'Paris', 'Madrid', '08:30', '10:15'] // Ficticio generado por OCR
        }
      };

      const result = mapBlockToRole(block, 'interaction_inputs');

      // 1. La tabla debe preservarse en el canal ortogonal de referencia
      expect(result.reference).toBeDefined();
      expect(result.reference?.type).toBe('table_reference');
      if (result.reference && result.reference.type === 'table_reference') {
        expect(result.reference.headers).toEqual(['Destination', 'Departure', 'Platform']);
        expect(result.reference.rows.length).toBe(3);
        expect(result.reference.rows[0]).toEqual(['London', '08:30', '4']);
      }

      // 2. La interacción debe ser strictly 'input_fields'
      expect(result.interaction).toBeDefined();
      expect(result.interaction?.type).toBe('input_fields');

      if (result.interaction && result.interaction.type === 'input_fields') {
        // 3. LayoutMode debe ser 'list' (preguntas de comprensión), NO 'table'
        expect(result.interaction.layoutMode).toBe('list');
        expect(result.interaction.listItems.length).toBe(2);
        expect(result.interaction.listItems[0].prompt).toBe('What time does the train to Paris leave?');
        expect(result.interaction.listItems[0].expectedAnswer).toBe('10:15');

        // 4. Invariante estricta: wordBank DEBE ser undefined o vacío cuando existe tabla/referenceContent
        expect(result.interaction.wordBank).toBeUndefined();
      }
    });

    it('mapBlockToInputFields directamente debe vaciar wordBank cuando hay tabla de referencia y preguntas', () => {
      const block: ExtractedBlock = {
        id: 'block-input-table-ref',
        rawText: '',
        detectedType: 'table',
        confidence: 0.9,
        parsedData: {
          title: 'Grammar Reference Table & Exercises',
          instruction: 'Complete the sentences using the reference table:',
          headers: ['Subject', 'Verb', 'Complement'],
          rows: [['I', 'work', 'here'], ['She', 'works', 'there']],
          items: [
            { prompt: 'He _______ (work) in a bank.', expectedAnswer: 'works' }
          ],
          wordBank: ['work', 'works']
        }
      };

      const inputBlock = mapBlockToInputFields(block);
      expect(inputBlock.type).toBe('input_fields');
      expect(inputBlock.layoutMode).toBe('list');
      // Invariante: Si hay tabla de referencia y preguntas interactivas, wordBank no debe contaminar
      expect(inputBlock.wordBank).toBeUndefined();
    });
  });

  // =========================================================================
  // CASO C: Lectura + Producción Escrita (Writing)
  // =========================================================================
  describe('Caso C: Lectura + Writing', () => {
    it('debe mapear a writing y asegurar que guidelines no contengan guiones artificiales', () => {
      const block: ExtractedBlock = {
        id: 'block-writing-1',
        rawText: `Read the story of Alex:
Alex started his journey five years ago in Canada...

Task: Write a short biography about an inspiring person.
Guidelines:
- Where were they born? _______
- What did they achieve? _______
- Why do you admire them? _______`,
        detectedType: 'paragraph',
        confidence: 0.94,
        parsedData: {
          title: 'Writing: Inspirational Biography',
          instruction: 'Write a short biography about someone you admire following the guidelines:',
          prompt: 'Write a biography (60-120 words) detailing their achievements and impact.',
          guidelines: [
            'Where were they born? _______',
            'What did they achieve? _______',
            'Why do you admire them? _______'
          ],
          minWords: 60,
          maxWords: 120,
          interactionType: 'writing'
        }
      };

      const writingBlock = mapBlockToWriting(block);

      // 1. Debe ser estrictamente tipo 'writing'
      expect(writingBlock.type).toBe('writing');

      // 2. Debe preservar prompt e instrucción limpios
      expect(writingBlock.prompt).toBe('Write a biography (60-120 words) detailing their achievements and impact.');
      expect(writingBlock.prompt).not.toContain('___');

      // 3. Los guidelines DEBEN sanitizarse eliminando guiones bajos artificiales ("______")
      expect(writingBlock.guidelines).toBeDefined();
      expect(writingBlock.guidelines!.length).toBe(3);
      writingBlock.guidelines!.forEach((g) => {
        expect(g).not.toMatch(/_{2,}/);
      });
      expect(writingBlock.guidelines![0]).toBe('Where were they born?');
      expect(writingBlock.guidelines![1]).toBe('What did they achieve?');
      expect(writingBlock.guidelines![2]).toBe('Why do you admire them?');

      // 4. Parámetros de extensión preservados
      expect(writingBlock.minWords).toBe(60);
      expect(writingBlock.maxWords).toBe(120);
    });

    it('mapBlockToRole con rol interaction_writing debe desacoplar lectura y preservar guidelines limpios', () => {
      const block: ExtractedBlock = {
        id: 'block-writing-2',
        rawText: 'Article about green technology...',
        detectedType: 'paragraph',
        confidence: 0.95,
        parsedData: {
          title: 'Opinion Essay',
          instruction: 'Write your opinion essay on renewable energy:',
          prompt: 'Write an essay discussing solar vs wind energy. _______',
          referenceContent: 'Renewable energy has grown exponentially over the last two decades. Many countries now invest in solar panels and wind turbines to reduce carbon emissions and build sustainable infrastructure for future generations.',
          guidelines: [
            'Introduce the topic clearly. ______',
            'Provide at least two advantages. ______',
            'Conclude with your recommendation. ______'
          ],
          interactionType: 'writing'
        }
      };

      const result = mapBlockToRole(block, 'interaction_writing');

      // La interacción es estrictamente writing
      expect(result.interaction?.type).toBe('writing');
      const writing = result.interaction as any;

      // El prompt y guidelines no tienen guiones
      expect(writing.prompt).not.toContain('___');
      writing.guidelines?.forEach((g: string) => {
        expect(g).not.toMatch(/_{2,}/);
      });
    });
  });

  // =========================================================================
  // CASO D: Pregunta abierta de análisis con referencia de contexto
  // =========================================================================
  describe('Caso D: Pregunta abierta de análisis con referencia', () => {
    it('debe mapear a writing, preservar las 4 preguntas en referenceContent y dejar wordBank vacío', () => {
      const contextQuestions = `1. Where do you live?
2. What are you studying?
3. Did you go out last night?
4. Have you seen that new film?`;

      const block: ExtractedBlock = {
        id: 'block-analysis-1',
        rawText: `Grammar Analysis:
1. Where do you live?
2. What are you studying?
3. Did you go out last night?
4. Have you seen that new film?

How are the question forms in 1 and 2 different from 3 and 4?`,
        detectedType: 'numbered_list',
        confidence: 0.95,
        parsedData: {
          title: 'Question Forms Analysis',
          instruction: 'Look at questions 1-4. How are the question forms in 1 and 2 different from 3 and 4?',
          prompt: 'How are the question forms in 1 and 2 different from 3 and 4?',
          referenceContent: contextQuestions,
          interactionType: 'writing',
          wordBank: []
        }
      };

      const result = mapBlockToRole(block, 'interaction_writing');

      // 1. Comprobar que la interacción es estrictamente de tipo 'writing' con la consigna original
      expect(result.interaction).toBeDefined();
      expect(result.interaction?.type).toBe('writing');
      const writing = result.interaction as any;
      expect(writing.prompt).toBe('How are the question forms in 1 and 2 different from 3 and 4?');
      expect(writing.instruction).toContain('Look at questions 1-4');

      // 2. Comprobar que las 4 preguntas de contexto van al canal pasivo referenceContent (tipo 'text')
      expect(result.reference).toBeDefined();
      expect(result.reference?.type).toBe('text');
      const ref = result.reference as any;
      expect(ref.content).toContain('1. Where do you live?');
      expect(ref.content).toContain('2. What are you studying?');
      expect(ref.content).toContain('3. Did you go out last night?');
      expect(ref.content).toContain('4. Have you seen that new film?');

      // 3. Comprobar que wordBank queda vacío (undefined o [])
      expect(writing.wordBank).toBeUndefined();
    });

    it('debe rescatar preguntas de contexto si fueron volcadas erróneamente en wordBank', () => {
      const blockWithSpuriousWordBank: ExtractedBlock = {
        id: 'block-analysis-rescue',
        rawText: 'Look at questions 1-4...',
        detectedType: 'numbered_list',
        confidence: 0.9,
        parsedData: {
          title: 'Grammar Analysis',
          instruction: 'Explain why the question forms in 1 and 2 are different from 3 and 4:',
          prompt: 'Explain the difference between questions 1-2 and 3-4.',
          referenceContent: `1. Where do you live?
2. What are you studying?
3. Did you go out last night?
4. Have you seen that film?`,
          interactionType: 'writing',
          wordBank: ['1. Where do you live?', '2. What are you studying?'] // Spurious
        }
      };

      const result = mapBlockToRole(blockWithSpuriousWordBank, 'interaction_writing');
      expect(result.interaction?.type).toBe('writing');
      expect(result.reference?.type).toBe('text');
      expect((result.reference as any).content).toContain('1. Where do you live?');
      expect((result.interaction as any).wordBank).toBeUndefined();
    });
  });

});

