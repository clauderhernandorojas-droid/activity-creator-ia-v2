import { describe, it, expect } from 'vitest';
import { SlideSchema } from '../../../types/schema';
import { validateAndParseSlides, SchemaValidationError } from '../digitizeBook';

describe('slideValidation - Direct Schema & Architectural Invariant Tests', () => {

  // =========================================================================
  // CASO A: Selección vs Matching (Invariante de Preservación de Texto)
  // =========================================================================
  describe('Caso A: Selección vs Matching (Preservación de Entidades Candidatas)', () => {
    it('debe validar directamente un Slide de tipo selection con candidatos de texto íntegro', () => {
      const rawSlideJson = JSON.stringify({
        slides: [
          {
            id: 'slide-sel-1',
            title: 'Past Tense Recognition',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-sel-1',
              type: 'selection',
              instruction: 'Which two questions ask about the past? Select the correct options:',
              options: [
                {
                  id: 'opt-1',
                  text: 'Where were you born?',
                  isCorrect: true,
                  feedback: 'Past simple with was/were'
                },
                {
                  id: 'opt-2',
                  text: 'What are you doing now?',
                  isCorrect: false,
                  feedback: 'Present continuous'
                },
                {
                  id: 'opt-3',
                  text: 'Did you see that movie yesterday?',
                  isCorrect: true,
                  feedback: 'Past simple with did'
                },
                {
                  id: 'opt-4',
                  text: 'Where do you live?',
                  isCorrect: false,
                  feedback: 'Present simple'
                }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideJson);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      expect(slide.interaction?.type).toBe('selection');

      if (slide.interaction?.type === 'selection') {
        const options = slide.interaction.options || [];
        expect(options).toHaveLength(4);

        // Invariante 1: Preservar el texto íntegro de cada ítem
        expect(options[0].text).toBe('Where were you born?');
        expect(options[1].text).toBe('What are you doing now?');
        expect(options[2].text).toBe('Did you see that movie yesterday?');
        expect(options[3].text).toBe('Where do you live?');

        // Invariante 2: Prohibido colapsar en permutaciones sintéticas tipo "1, 2"
        options.forEach((opt) => {
          expect(opt.text).not.toMatch(/^\d+(?:\s*[,&y+]\s*\d+)+$/);
          expect(opt.text).not.toBe('1, 2');
          expect(opt.text).not.toBe('1, 3');
          expect(opt.text).not.toBe('3, 4');
        });

        // Invariante 3: Respuestas correctas preservadas
        expect(options[0].isCorrect).toBe(true);
        expect(options[1].isCorrect).toBe(false);
        expect(options[2].isCorrect).toBe(true);
        expect(options[3].isCorrect).toBe(false);
      }
    });

    it('debe validar un checklist con opciones múltiples sin crear correspondencias artificiales', () => {
      const rawSlideJson = JSON.stringify({
        slides: [
          {
            id: 'slide-sel-2',
            title: 'Personal Survey',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-sel-2',
              type: 'selection',
              instruction: 'Tick the sentences that are true for you:',
              allowMultiple: true,
              options: [
                { id: 'opt-1', text: 'I have never been to Tokyo.', isCorrect: true },
                { id: 'opt-2', text: 'I like drinking black coffee.', isCorrect: true },
                { id: 'opt-3', text: 'I wake up before 6 AM.', isCorrect: false }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideJson);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.interaction?.type).toBe('selection');
      if (slide.interaction?.type === 'selection') {
        expect(slide.interaction.allowMultiple).toBe(true);
        expect(slide.interaction.options).toHaveLength(3);
        expect(slide.interaction.options?.[0].text).toBe('I have never been to Tokyo.');
      }
    });
  });

  // =========================================================================
  // CASO B: Universal Matching (Buckets & Slots entre dos dominios)
  // =========================================================================
  describe('Caso B: Universal Matching (Buckets & Slots)', () => {
    it('debe validar un Slide de tipo buckets_matching con biyección formal entre dos dominios', () => {
      const rawSlideJson = JSON.stringify({
        slides: [
          {
            id: 'slide-match-1',
            title: 'Vocabulary Definitions Match',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-match-1',
              type: 'buckets_matching',
              instruction: 'Match each word with its correct definition:',
              buckets: [
                { id: 'slot-1', label: 'Extremely large or huge' },
                { id: 'slot-2', label: 'Extremely small or tiny' }
              ],
              tokens: [
                { id: 'src-1', text: 'Gigantic', correctBucketId: 'slot-1' },
                { id: 'src-2', text: 'Minuscule', correctBucketId: 'slot-2' }
              ],
              targetSlots: [
                { id: 'slot-1', label: 'Extremely large or huge' },
                { id: 'slot-2', label: 'Extremely small or tiny' }
              ],
              sourceItems: [
                { id: 'src-1', text: 'Gigantic', correctTargetId: 'slot-1' },
                { id: 'src-2', text: 'Minuscule', correctTargetId: 'slot-2' }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideJson);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      expect(slide.interaction?.type).toBe('buckets_matching');
      if (slide.interaction?.type === 'buckets_matching') {
        expect(slide.interaction.buckets).toHaveLength(2);
        expect(slide.interaction.tokens).toHaveLength(2);
        expect(slide.interaction.tokens[0].text).toBe('Gigantic');
        expect(slide.interaction.tokens[0].correctBucketId).toBe('slot-1');
      }
    });
  });

  // =========================================================================
  // CASO C: Tabla de Referencia + Preguntas Independientes (Canales Ortogonales)
  // =========================================================================
  describe('Caso C: Referencia Ortogonal + Preguntas Independientes', () => {
    it('debe desacoplar tabla informativa en referenceContent y preguntas en input_fields', () => {
      const rawSlideJson = JSON.stringify({
        slides: [
          {
            id: 'slide-table-input-1',
            title: 'Train Timetable Comprehension',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-table-1',
              type: 'table_reference',
              title: 'Train Schedule',
              headers: ['Destination', 'Departure', 'Platform'],
              rows: [
                ['London', '08:30', '4'],
                ['Paris', '10:15', '2'],
                ['Madrid', '14:00', '7']
              ]
            },
            interaction: {
              id: 'int-input-1',
              type: 'input_fields',
              instruction: 'Look at the train schedule and answer the questions:',
              layoutMode: 'list',
              listItems: [
                {
                  id: 'item-1',
                  prompt: 'What time does the train to Paris leave?',
                  expectedAnswer: '10:15',
                  acceptedAnswers: ['10:15', '10:15 AM'],
                  explanation: 'Found in row 2'
                },
                {
                  id: 'item-2',
                  prompt: 'Which platform is the train to London on?',
                  expectedAnswer: 'Platform 4',
                  acceptedAnswers: ['Platform 4', '4'],
                  explanation: 'Found in row 1'
                }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideJson);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      // 1. Canal ortogonal de referencia (tabla)
      expect(slide.referenceContent?.type).toBe('table_reference');
      if (slide.referenceContent?.type === 'table_reference') {
        expect(slide.referenceContent.headers).toEqual(['Destination', 'Departure', 'Platform']);
        expect(slide.referenceContent.rows).toHaveLength(3);
        expect(slide.referenceContent.rows[0]).toEqual(['London', '08:30', '4']);
      }

      // 2. Canal interactivo (input_fields en modo list)
      expect(slide.interaction?.type).toBe('input_fields');
      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.layoutMode).toBe('list');
        expect(slide.interaction.listItems).toHaveLength(2);
        expect(slide.interaction.listItems[0].expectedAnswer).toBe('10:15');
        // Invariante: wordBank no contamina cuando hay referencia estructurada
        expect(slide.interaction.wordBank).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // CASO D: Lectura + Producción Escrita / Pregunta Abierta de Análisis
  // =========================================================================
  describe('Caso D: Pregunta Abierta de Análisis con Referencia Contextual', () => {
    it('debe validar Slide con preguntas de contexto en referenceContent: text e interaction: writing', () => {
      const contextQuestions = `1. Where do you live?
2. What are you studying?
3. Did you go out last night?
4. Have you seen that new film?`;

      const rawSlideJson = JSON.stringify({
        slides: [
          {
            id: 'slide-writing-1',
            title: 'Question Forms Analysis',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-text-1',
              type: 'text',
              title: 'Context Questions',
              content: contextQuestions
            },
            interaction: {
              id: 'int-writing-1',
              type: 'writing',
              instruction: 'Look at questions 1-4. How are the question forms in 1 and 2 different from 3 and 4?',
              prompt: 'How are the question forms in 1 and 2 different from 3 and 4?',
              guidelines: [
                'Identify auxiliary verbs used in 1 and 2',
                'Identify auxiliary verbs used in 3 and 4',
                'Explain the difference in tense structure'
              ],
              minWords: 30,
              maxWords: 150,
              isGraded: false
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideJson);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      // 1. Canal de referencia de texto intacto
      expect(slide.referenceContent?.type).toBe('text');
      if (slide.referenceContent?.type === 'text') {
        expect(slide.referenceContent.content).toContain('1. Where do you live?');
        expect(slide.referenceContent.content).toContain('4. Have you seen that new film?');
      }

      // 2. Interacción tipo writing
      expect(slide.interaction?.type).toBe('writing');
      if (slide.interaction?.type === 'writing') {
        expect(slide.interaction.prompt).toBe('How are the question forms in 1 and 2 different from 3 and 4?');
        expect(slide.interaction.guidelines).toHaveLength(3);
        // Directrices limpias sin guiones artificiales
        slide.interaction.guidelines?.forEach((g) => {
          expect(g).not.toMatch(/_{2,}/);
        });
      }
    });
  });

  // =========================================================================
  // CASO E: Blindaje de Esquema (Rechazo Estricto de Datos Inválidos)
  // =========================================================================
  describe('Caso E: Blindaje de Esquema (Zero Heuristic Guessing)', () => {
    it('debe lanzar SchemaValidationError ante JSON sintácticamente corrupto', () => {
      const corruptJson = '{"slides": [{"title": "Incomplete';
      expect(() => validateAndParseSlides(corruptJson)).toThrow(SchemaValidationError);
    });

    it('debe lanzar SchemaValidationError ante arreglo vacío de diapositivas', () => {
      const emptySlidesJson = JSON.stringify({ slides: [] });
      expect(() => validateAndParseSlides(emptySlidesJson)).toThrow(SchemaValidationError);
    });

    it('debe lanzar SchemaValidationError ante tipos de interacción no soportados', () => {
      const invalidTypeJson = JSON.stringify({
        slides: [
          {
            id: 'slide-bad-1',
            title: 'Unsupported Activity',
            layout: 'single_column',
            interaction: {
              id: 'int-bad',
              type: 'invented_unsupported_type',
              instruction: 'Do something'
            }
          }
        ]
      });
      expect(() => validateAndParseSlides(invalidTypeJson)).toThrow(SchemaValidationError);
    });

    it('debe fallar directamente en SlideSchema.safeParse ante violaciones de contrato', () => {
      const invalidSlide = {
        id: 'bad-slide',
        title: 12345, // Invalid: should be string
        layout: 'invalid_layout_mode'
      };

      const result = SlideSchema.safeParse(invalidSlide);
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // CASO F: Tabla Interactiva con Inputs en Celdas (Cuestionarios Tabulares)
  // =========================================================================
  describe('Caso F: Tabla Interactiva con Inputs en Celdas (layoutMode: table)', () => {
    it('debe validar un cuestionario tabular con celdas interactivas isInput: true sin degradar a writing', () => {
      const rawSlideJson = JSON.stringify({
        slides: [
          {
            id: 'slide-table-interactive-1',
            title: 'Classmate Survey: Habits & Routines',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-table-survey-1',
              type: 'input_fields',
              instruction: 'Ask your partner and complete the table with their answers:',
              layoutMode: 'table',
              tableHeaders: ['Question', 'Your Answer', "Partner's Answer"],
              tableRows: [
                [
                  { text: 'What time do you wake up?', isInput: false },
                  { text: '', isInput: true, expectedAnswer: '7:00 AM', acceptedAnswers: ['7:00', '7:00 AM', 'at 7:00'] },
                  { text: '', isInput: true, expectedAnswer: '6:30 AM', acceptedAnswers: ['6:30', '6:30 AM', 'at 6:30'] }
                ],
                [
                  { text: 'How do you get to school or work?', isInput: false },
                  { text: '', isInput: true, expectedAnswer: 'By bus', acceptedAnswers: ['by bus', 'bus', 'on the bus'] },
                  { text: '', isInput: true, expectedAnswer: 'Walking', acceptedAnswers: ['on foot', 'walking', 'walk'] }
                ],
                [
                  { text: 'Do you play any sports?', isInput: false },
                  { text: '', isInput: true, expectedAnswer: 'Soccer', acceptedAnswers: ['yes, soccer', 'soccer', 'football'] },
                  { text: '', isInput: true, expectedAnswer: 'Tennis', acceptedAnswers: ['tennis', 'yes, tennis'] }
                ]
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideJson);
      expect(slides).toHaveLength(1);

      const slide = slides[0];

      // 1. Invariante: referenceContent DEBE ser null (la tabla es el ejercicio interactivo)
      expect(slide.referenceContent).toBeNull();

      // 2. Invariante: interaction.type DEBE ser estrictamente 'input_fields'
      expect(slide.interaction?.type).toBe('input_fields');

      if (slide.interaction?.type === 'input_fields') {
        // 3. Invariante: layoutMode DEBE ser estrictamente 'table'
        expect(slide.interaction.layoutMode).toBe('table');
        expect(slide.interaction.tableHeaders).toEqual(['Question', 'Your Answer', "Partner's Answer"]);
        expect(slide.interaction.tableRows).toHaveLength(3);

        // 4. Invariante: Celdas impresas/consignas tienen isInput: false
        expect(slide.interaction.tableRows[0][0].text).toBe('What time do you wake up?');
        expect(slide.interaction.tableRows[0][0].isInput).toBe(false);

        // 5. Invariante: Celdas a rellenar tienen isInput: true y respuestas válidas
        expect(slide.interaction.tableRows[0][1].isInput).toBe(true);
        expect(slide.interaction.tableRows[0][1].expectedAnswer).toBe('7:00 AM');
        expect(slide.interaction.tableRows[0][1].acceptedAnswers).toContain('7:00 AM');

        expect(slide.interaction.tableRows[0][2].isInput).toBe(true);
        expect(slide.interaction.tableRows[0][2].expectedAnswer).toBe('6:30 AM');

        // Verificar el resto de las filas
        expect(slide.interaction.tableRows[1][0].isInput).toBe(false);
        expect(slide.interaction.tableRows[1][1].isInput).toBe(true);
        expect(slide.interaction.tableRows[1][2].isInput).toBe(true);

        expect(slide.interaction.tableRows[2][0].isInput).toBe(false);
        expect(slide.interaction.tableRows[2][1].isInput).toBe(true);
        expect(slide.interaction.tableRows[2][2].isInput).toBe(true);
      }
    });
  });

  // =========================================================================
  // CASO G: Ejercicios de Completar Letras / Vocales (Palabras Completas)
  // =========================================================================
  describe('Caso G: Completar Letras / Vocales en Palabras Completas (input_fields)', () => {
    it('debe validar un ejercicio de vocales donde el input espera la palabra completa con colocación', () => {
      const rawSlideJson = JSON.stringify({
        slides: [
          {
            id: 'slide-vowels-1',
            title: 'Sports Vocabulary: Write the Vowels',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-vowels-1',
              type: 'input_fields',
              instruction: 'Write the vowels (a, e, i, o, u) to complete the sports words:',
              layoutMode: 'list',
              listItems: [
                {
                  id: 'item-vow-1',
                  prefix: 'play',
                  prompt: 'v_ll_yb_ll',
                  expectedAnswer: 'volleyball',
                  acceptedAnswers: ['volleyball'],
                  explanation: 'Complete word with vowels: volleyball'
                },
                {
                  id: 'item-vow-2',
                  prefix: 'go',
                  prompt: 'sw_mm_ng',
                  expectedAnswer: 'swimming',
                  acceptedAnswers: ['swimming'],
                  explanation: 'Complete word with vowels: swimming'
                },
                {
                  id: 'item-vow-3',
                  prefix: 'do',
                  prompt: 'g_mn_st_cs',
                  expectedAnswer: 'gymnastics',
                  acceptedAnswers: ['gymnastics'],
                  explanation: 'Complete word with vowels: gymnastics'
                }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideJson);
      expect(slides).toHaveLength(1);

      const slide = slides[0];

      // 1. Invariante: Cero duplicación (ejercicio autosuficiente)
      expect(slide.referenceContent).toBeNull();
      expect(slide.layout).toBe('single_column');

      // 2. Invariante: Tipo input_fields en modo list
      expect(slide.interaction?.type).toBe('input_fields');

      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.layoutMode).toBe('list');
        expect(slide.interaction.listItems).toHaveLength(3);

        // 3. Invariante: Respuestas son palabras completas, no letras microscópicas
        expect(slide.interaction.listItems[0].expectedAnswer).toBe('volleyball');
        expect(slide.interaction.listItems[0].prefix).toBe('play');
        expect(slide.interaction.listItems[0].expectedAnswer?.length).toBeGreaterThan(1);

        expect(slide.interaction.listItems[1].expectedAnswer).toBe('swimming');
        expect(slide.interaction.listItems[1].prefix).toBe('go');

        expect(slide.interaction.listItems[2].expectedAnswer).toBe('gymnastics');
        expect(slide.interaction.listItems[2].prefix).toBe('do');
      }
    });
  });

  // =========================================================================
  // CASO H: Alternativas Cerradas / Elección Discreta ("Circle the correct word")
  // =========================================================================
  describe('Caso H: Alternativas Cerradas (Circle the correct word / opciones delimitadas)', () => {
    it('debe validar ejercicio de alternativas cerradas como selection (quiz mode) con isExample en la opción modelo', () => {
      const rawSlideJson = JSON.stringify({
        slides: [
          {
            id: 'slide-closed-sel-1',
            title: 'Past Simple: was / were',
            subtitle: 'Circle the correct word in each sentence.',
            layout: 'single_column',
            isGraded: true,
            referenceContent: null,
            interaction: {
              id: 'int-closed-sel-1',
              type: 'selection',
              instruction: 'Circle the correct word to complete each sentence.',
              questions: [
                {
                  id: 'q-1',
                  prompt: '1. Yesterday I was / were at home.',
                  mode: 'single_choice',
                  isExample: true,
                  options: [
                    {
                      id: 'opt-1-a',
                      text: 'was',
                      isCorrect: true,
                      isExample: true,
                      feedback: 'Correct past form for I'
                    },
                    {
                      id: 'opt-1-b',
                      text: 'were',
                      isCorrect: false,
                      feedback: 'Incorrect: were is used with you/we/they'
                    }
                  ]
                },
                {
                  id: 'q-2',
                  prompt: '2. They was / were happy to see us.',
                  mode: 'single_choice',
                  options: [
                    {
                      id: 'opt-2-a',
                      text: 'was',
                      isCorrect: false
                    },
                    {
                      id: 'opt-2-b',
                      text: 'were',
                      isCorrect: true
                    }
                  ]
                }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideJson);
      expect(slides).toHaveLength(1);

      const slide = slides[0];

      // 1. Invariante: Cero degradación a input_fields (debe ser selection)
      expect(slide.interaction?.type).toBe('selection');
      expect(slide.interaction?.type).not.toBe('input_fields');

      if (slide.interaction?.type === 'selection') {
        expect(slide.interaction.questions).toHaveLength(2);

        // 2. Pregunta 1: Ejemplo resuelto
        const q1 = slide.interaction.questions[0];
        expect(q1.mode).toBe('single_choice');
        expect(q1.isExample).toBe(true);
        expect(q1.options).toHaveLength(2);
        expect(q1.options[0].text).toBe('was');
        expect(q1.options[0].isCorrect).toBe(true);
        expect(q1.options[0].isExample).toBe(true);

        expect(q1.options[1].text).toBe('were');
        expect(q1.options[1].isCorrect).toBe(false);

        // 3. Pregunta 2: Item activo evaluado
        const q2 = slide.interaction.questions[1];
        expect(q2.mode).toBe('single_choice');
        expect(q2.options).toHaveLength(2);
        expect(q2.options[0].text).toBe('was');
        expect(q2.options[0].isCorrect).toBe(false);
        expect(q2.options[1].text).toBe('were');
        expect(q2.options[1].isCorrect).toBe(true);
      }
    });
  });

});


