import { describe, it, expect } from 'vitest';
import { SlideSchema, SelectionBlockSchema } from '../../../types/schema';
import { evaluateSelection } from '../../evaluators/evaluateSelection';
import {
  validateAndParseSlides,
  slideToExtractedBlock,
  SchemaValidationError,
  extractDisjunctiveAlternatives,
  cleanSelectionPrompt,
} from '../digitizeBook';

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
    it('debe validar ejercicio de alternativas cerradas como selection (quiz mode) con token {{blank}} y segmentación de layout', () => {
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
                  question: '1. Yesterday I {{blank}} at home.',
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
                  prompt: '2. They {{blank}} happy to see us.',
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

      // 1. Invariante de Segmentación de Layout: autosuficiente en single_column
      expect(slide.referenceContent).toBeNull();
      expect(slide.layout).toBe('single_column');

      // 2. Invariante: Cero degradación a input_fields (debe ser selection)
      expect(slide.interaction?.type).toBe('selection');
      expect(slide.interaction?.type).not.toBe('input_fields');

      if (slide.interaction?.type === 'selection') {
        expect(slide.interaction.questions).toHaveLength(2);

        // 3. Pregunta 1: Invariante {{blank}} y soporte question/prompt
        const q1 = slide.interaction.questions[0];
        expect(q1.mode).toBe('single_choice');
        expect(q1.isExample).toBe(true);
        expect(q1.prompt).toBe('1. Yesterday I {{blank}} at home.');
        expect(q1.question).toBe('1. Yesterday I {{blank}} at home.');
        expect(q1.prompt).not.toContain('was / were');
        expect(q1.options).toHaveLength(2);
        expect(q1.options[0].text).toBe('was');
        expect(q1.options[0].isCorrect).toBe(true);
        expect(q1.options[0].isExample).toBe(true);

        expect(q1.options[1].text).toBe('were');
        expect(q1.options[1].isCorrect).toBe(false);

        // 4. Pregunta 2: Invariante {{blank}} emitido desde prompt
        const q2 = slide.interaction.questions[1];
        expect(q2.mode).toBe('single_choice');
        expect(q2.prompt).toBe('2. They {{blank}} happy to see us.');
        expect(q2.question).toBe('2. They {{blank}} happy to see us.');
        expect(q2.prompt).not.toContain('was / were');
        expect(q2.options).toHaveLength(2);
        expect(q2.options[0].text).toBe('was');
        expect(q2.options[0].isCorrect).toBe(false);
        expect(q2.options[1].text).toBe('were');
        expect(q2.options[1].isCorrect).toBe(true);
      }
    });
  });

  // =========================================================================
  // CASO I: Segmentación Multi-Slide y Resolución de Referencias Cruzadas
  // =========================================================================
  describe('Caso I: Segmentación Multi-Slide y Resolución de Referencias Cruzadas', () => {
    it('debe validar dos slides independientes emitidos desde una misma captura con referencias resueltas', () => {
      const rawMultiSlideJson = JSON.stringify({
        slides: [
          // Actividad 1: Presentación / Selección de vocabulario
          {
            id: 'slide-ex-1',
            title: 'Exercise 1: Action Verbs',
            subtitle: 'Choose the correct action verbs from the options.',
            layout: 'single_column',
            isGraded: true,
            referenceContent: null,
            interaction: {
              id: 'int-ex-1',
              type: 'selection',
              instruction: 'Choose the verbs mentioned in the audio:',
              options: [
                { id: 'v-1', text: 'play football', isCorrect: true },
                { id: 'v-2', text: 'go swimming', isCorrect: true },
                { id: 'v-3', text: 'do judo', isCorrect: true },
                { id: 'v-4', text: 'eat pizza', isCorrect: false }
              ],
              allowMultiple: true
            }
          },
          // Actividad 2: Dependiente de 1 ("Put the verbs from 1 into the correct column: play, go, or do")
          {
            id: 'slide-ex-2',
            title: 'Exercise 2: Verb Collocations',
            subtitle: 'Put the verbs from 1 into the correct column.',
            layout: 'single_column',
            isGraded: true,
            referenceContent: null,
            interaction: {
              id: 'int-ex-2',
              type: 'buckets_matching',
              instruction: 'Put the verbs from exercise 1 into the correct bucket (play, go, do):',
              buckets: [
                { id: 'b-play', label: 'play' },
                { id: 'b-go', label: 'go' },
                { id: 'b-do', label: 'do' }
              ],
              tokens: [
                { id: 'tok-1', text: 'football', correctBucketId: 'b-play' },
                { id: 'tok-2', text: 'swimming', correctBucketId: 'b-go' },
                { id: 'tok-3', text: 'judo', correctBucketId: 'b-do' }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawMultiSlideJson);

      // Invariante 1: Segmentación Multi-Slide (2 actividades = 2 slides discretos, no fusionados)
      expect(slides).toHaveLength(2);

      const slide1 = slides[0];
      const slide2 = slides[1];

      expect(slide1.id).toBe('slide-ex-1');
      expect(slide1.interaction?.type).toBe('selection');

      expect(slide2.id).toBe('slide-ex-2');
      expect(slide2.interaction?.type).toBe('buckets_matching');

      // Invariante 2: Resolución de Referencias Cruzadas (slide 2 resuelve exhaustivamente los verbos de 1)
      if (slide2.interaction?.type === 'buckets_matching') {
        expect(slide2.interaction.buckets).toHaveLength(3);
        expect(slide2.interaction.buckets.map((b) => b.label)).toEqual(['play', 'go', 'do']);

        expect(slide2.interaction.tokens).toHaveLength(3);
        expect(slide2.interaction.tokens[0].text).toBe('football');
        expect(slide2.interaction.tokens[0].correctBucketId).toBe('b-play');

        expect(slide2.interaction.tokens[1].text).toBe('swimming');
        expect(slide2.interaction.tokens[1].correctBucketId).toBe('b-go');

        expect(slide2.interaction.tokens[2].text).toBe('judo');
        expect(slide2.interaction.tokens[2].correctBucketId).toBe('b-do');
      }
    });
  });

  describe('Caso J: Tolerancia y Normalización de referenceContent (Audio Track / Listening / Delimitadores)', () => {
    it('debe normalizar pista de escucha R1.8 con mediaType: listening y sin url sin fallar la validación', () => {
      const rawAudioSlideJson = JSON.stringify({
        slides: [
          {
            id: 'slide-audio-1',
            title: 'Listening Practice: Track R1.8',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-audio-1',
              type: 'media',
              mediaType: 'listening',
              title: 'Audio Track R1.8'
            },
            interaction: {
              id: 'int-1',
              type: 'input_fields',
              instruction: 'Listen to R1.8 and fill in the missing words:',
              layoutMode: 'list',
              listItems: [
                { id: 'item-1', prompt: 'She {{blank}} yesterday', expectedAnswer: 'called', acceptedAnswers: ['called'] }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawAudioSlideJson);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      expect(slide.referenceContent).not.toBeNull();
      expect(slide.referenceContent?.type).toBe('media');

      if (slide.referenceContent?.type === 'media') {
        // Invariante 1: mediaType normalizado estrictamente a 'audio'
        expect(slide.referenceContent.mediaType).toBe('audio');
        // Invariante 2: url completada con placeholder canónico al no haber URL remota
        expect(slide.referenceContent.url).toBe('placeholder:audio-track');
        expect(slide.referenceContent.title).toBe('Audio Track R1.8');
      }
    });

    it('acepta url vacía en media sin provocar rechazo de la diapositiva', () => {
      const rawSlideWithEmptyUrl = JSON.stringify({
        slides: [
          {
            id: 'slide-audio-empty-url',
            title: 'Listening Task',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-audio-empty',
              type: 'media',
              mediaType: 'audio',
              url: '',
              title: 'Track 3'
            },
            interaction: {
              id: 'int-2',
              type: 'selection',
              instruction: 'Listen and choose',
              options: [{ id: 'o1', text: 'Option A', isCorrect: true }]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideWithEmptyUrl);
      expect(slides).toHaveLength(1);
      expect(slides[0].referenceContent?.type).toBe('media');
    });

    it('remueve limpiamente referenceContent inválido o vacío en lugar de rechazar la diapositiva', () => {
      const rawSlideWithGarbageRef = JSON.stringify({
        slides: [
          {
            id: 'slide-garbage-ref',
            title: 'Speaking Activity',
            referenceContent: {
              type: 'unsupported_junk_type',
              data: {}
            },
            interaction: {
              id: 'int-3',
              type: 'writing',
              instruction: 'Speak or write',
              prompt: 'Tell about yourself',
              guidelines: []
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideWithGarbageRef);
      expect(slides).toHaveLength(1);
      // Invariante: referenceContent se limpia a null sin romper la diapositiva
      expect(slides[0].referenceContent).toBeNull();
      expect(slides[0].layout).toBe('single_column');
      expect(slides[0].interaction?.type).toBe('writing');
    });

    it('SlideSchema.safeParse valida directamente mediaType listening y url omitida', () => {
      const directSlide = {
        id: 'direct-slide-1',
        title: 'Direct Parse Audio',
        layout: 'split_50_50' as const,
        referenceContent: {
          id: 'ref-direct',
          type: 'media' as const,
          mediaType: 'listening',
          title: 'Track R1.8'
        },
        interaction: null
      };

      const result = SlideSchema.safeParse(directSlide);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.referenceContent?.type).toBe('media');
        if (result.data.referenceContent?.type === 'media') {
          expect(result.data.referenceContent.mediaType).toBe('audio');
          expect(result.data.referenceContent.url).toBe('placeholder:audio-track');
        }
      }
    });
  });

  // =========================================================================
  // CASO K: Clasificación Semántica de Preguntas Disyuntivas (Alternative Questions)
  // =========================================================================
  describe('Caso K: Clasificación Semántica de Preguntas Disyuntivas (Alternative Questions vs Writing)', () => {
    it('extractDisjunctiveAlternatives detecta el patrón "Do/Is/Are ... [A] or [B]?" y extrae las opciones discretas', () => {
      // 1. Ejemplos canónicos
      const r1 = extractDisjunctiveAlternatives('Do the speakers agree or disagree?');
      expect(r1).not.toBeNull();
      expect(r1?.options).toEqual(['agree', 'disagree']);

      const r2 = extractDisjunctiveAlternatives('Is this sentence talking about the past or the present?');
      expect(r2).not.toBeNull();
      expect(r2?.options).toEqual(['past', 'present']);

      const r3 = extractDisjunctiveAlternatives('Are the underlined verbs finished or unfinished?');
      expect(r3).not.toBeNull();
      expect(r3?.options).toEqual(['finished', 'unfinished']);

      const r4 = extractDisjunctiveAlternatives('Does rule A refer to a habit or an action in progress?');
      expect(r4).not.toBeNull();
      expect(r4?.options).toEqual(['habit', 'action in progress']);
    });

    it('extractDisjunctiveAlternatives retorna null ante consignas abiertas de redacción o preguntas abiertas', () => {
      // Consignas abiertas no deben alterarse
      expect(extractDisjunctiveAlternatives('Describe a memorable holiday with your friends or family.')).toBeNull();
      expect(extractDisjunctiveAlternatives('Write a short paragraph about someone you admire.')).toBeNull();
      expect(extractDisjunctiveAlternatives('Why do you think the speaker made that choice?')).toBeNull();
      expect(extractDisjunctiveAlternatives('What are the main advantages of public transport?')).toBeNull();
    });

    it('validateAndParseSlides normaliza una pregunta disyuntiva erróneamente tipada como writing a selection', () => {
      const rawDisjunctiveWritingSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-disj-1',
            title: 'Grammar Concept Check',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-disj-1',
              type: 'writing',
              instruction: 'Listen to the conversation and answer the question:',
              prompt: 'Do the speakers agree or disagree?',
              expectedAnswer: 'disagree'
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawDisjunctiveWritingSlide);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      // Invariante 1: NO debe quedar como 'writing', DEBE modelarse como 'selection'
      expect(slide.interaction?.type).toBe('selection');

      if (slide.interaction?.type === 'selection') {
        expect(slide.interaction.questions).toBeDefined();
        expect(slide.interaction.questions).toHaveLength(1);

        const q = slide.interaction.questions![0];
        expect(q.mode).toBe('single_choice');
        expect(q.prompt).toBe('Do the speakers agree or disagree?');

        // Invariante 2: Opciones discretas extraídas exactamente de la disyunción
        expect(q.options).toHaveLength(2);
        expect(q.options[0].text).toBe('agree');
        expect(q.options[1].text).toBe('disagree');

        // Invariante 3: Inferencia de respuesta correcta basada en expectedAnswer
        expect(q.options[0].isCorrect).toBe(false);
        expect(q.options[1].isCorrect).toBe(true);
      }
    });

    it('extractDisjunctiveAlternatives excluye incondicionalmente dilemas de opinion, justificaciones y preguntas largas', () => {
      // 1. Palabras clave de desarrollo / justificación (why, explain, give reasons, opinion, etc.)
      expect(extractDisjunctiveAlternatives('Do you prefer tea or coffee? Explain why.')).toBeNull();
      expect(extractDisjunctiveAlternatives('Should cities ban cars or promote cycling? Write your opinion.')).toBeNull();
      expect(extractDisjunctiveAlternatives('Do you prefer living in a city or a town? Give reasons.')).toBeNull();
      expect(extractDisjunctiveAlternatives('Would you like to study law or medicine? Discuss your reasons.')).toBeNull();
      expect(extractDisjunctiveAlternatives('Do you think modern art is inspiring or boring? Tell your partner.')).toBeNull();

      // 2. Umbral de longitud descriptiva (> 20 palabras)
      expect(
        extractDisjunctiveAlternatives(
          'Would you rather live in a very cold country with plenty of natural beauty and snow or in a warm tropical island where everyone is always outdoors in the sun?'
        )
      ).toBeNull();
    });

    it('validateAndParseSlides NUNCA muta writing a selection ante dilemas de opinion con justificacion', () => {
      const rawOpinionSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-opinion-1',
            title: 'Opinion Essay: Lifestyle Dilemma',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-opinion-1',
              type: 'writing',
              instruction: 'Personal opinion task:',
              prompt: 'Do you prefer tea or coffee? Explain why.'
            }
          },
          {
            id: 'slide-opinion-2',
            title: 'Civic Debate Essay',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-opinion-2',
              type: 'writing',
              instruction: 'Write your stance:',
              prompt: 'Should cities ban cars or promote cycling? Write your opinion.'
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawOpinionSlide);
      expect(slides).toHaveLength(2);

      // Invariante: Deben permanecer estrictamente como 'writing'
      expect(slides[0].interaction?.type).toBe('writing');
      expect((slides[0].interaction as any).prompt).toBe('Do you prefer tea or coffee? Explain why.');

      expect(slides[1].interaction?.type).toBe('writing');
      expect((slides[1].interaction as any).prompt).toBe('Should cities ban cars or promote cycling? Write your opinion.');
    });

    it('validateAndParseSlides NUNCA muta writing a selection si el bloque cuenta con rubricas o guidelines', () => {
      const rawRubricSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-rubric-ccq',
            title: 'Persuasive Opinion Task',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-rubric-1',
              type: 'writing',
              instruction: 'State your view:',
              prompt: 'Do you agree or disagree?',
              guidelines: ['State your opinion clearly', 'Provide at least one example'],
              minWords: 30
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawRubricSlide);
      expect(slides).toHaveLength(1);

      // Invariante: La presencia de guidelines/minWords blindan el bloque contra cualquier mutacion a selection
      expect(slides[0].interaction?.type).toBe('writing');
      if (slides[0].interaction?.type === 'writing') {
        expect(slides[0].interaction.prompt).toBe('Do you agree or disagree?');
        expect(slides[0].interaction.minWords).toBe(30);
        expect(slides[0].interaction.guidelines).toHaveLength(2);
      }
    });
  });

  // =========================================================================
  // CASO L: Limpieza de Prompts en Selección y Cohesión de CCQs Globales
  // =========================================================================
  describe('Caso L: Limpieza de Prompts en Selección y Cohesión de CCQs Globales', () => {
    it('cleanSelectionPrompt elimina tokens espurios de completacion [ ? ], [blank] y {{blank}} en preguntas directas', () => {
      // 1. Tokens [ ? ] o [?]
      expect(cleanSelectionPrompt('Do these people agree or disagree? [ ? ]')).toBe(
        'Do these people agree or disagree?'
      );
      expect(cleanSelectionPrompt('[ ? ] Which sentence is grammatically correct?')).toBe(
        'Which sentence is grammatically correct?'
      );

      // 2. {{blank}} o ___ en preguntas directas
      expect(cleanSelectionPrompt('Do the speakers agree or disagree? {{blank}}')).toBe(
        'Do the speakers agree or disagree?'
      );
      expect(cleanSelectionPrompt('___ Is the sentence talking about the past or the present?')).toBe(
        'Is the sentence talking about the past or the present?'
      );

      // 3. Preserva {{blank}} en enunciados Cloze de completación contextual legítimos
      expect(cleanSelectionPrompt('Yesterday I {{blank}} at home.')).toBe('Yesterday I {{blank}} at home.');
    });

    it('cleanSelectionPrompt elimina la duplicación del diálogo cuando ya está en referenceContent', () => {
      const dialogueText = 'Speaker A: I love action movies.\nSpeaker B: Really? I find them noisy.';
      const promptWithDuplicate =
        'Speaker A: I love action movies.\nSpeaker B: Really? I find them noisy.\n\nDo these people agree or disagree?';

      expect(cleanSelectionPrompt(promptWithDuplicate, dialogueText)).toBe(
        'Do these people agree or disagree?'
      );
    });

    it('validateAndParseSlides limpia tokens de completacion y deduplica preguntas CCQ globales idénticas', () => {
      const rawMultiCCQSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-ccq-cohesion',
            title: 'Grammar Concept Check: Agreements',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-dialogues',
              type: 'text',
              content: 'Speaker 1: I think tea is great.\nSpeaker 2: Absolutely, I agree completely.',
              category: 'reading_passage'
            },
            interaction: {
              id: 'int-ccq-cohesion',
              type: 'selection',
              instruction: 'Read the dialogue and answer the question:',
              questions: [
                {
                  id: 'q-row-1',
                  prompt: 'Speaker 1: I think tea is great.\nSpeaker 2: Absolutely, I agree completely.\n\nDo these people agree or disagree? [ ? ]',
                  mode: 'single_choice',
                  options: [
                    { id: 'opt-1', text: 'agree', isCorrect: true },
                    { id: 'opt-2', text: 'disagree', isCorrect: false }
                  ]
                },
                {
                  id: 'q-row-2',
                  prompt: 'Do these people agree or disagree? [ ? ]',
                  mode: 'single_choice',
                  options: [
                    { id: 'opt-1', text: 'agree', isCorrect: true },
                    { id: 'opt-2', text: 'disagree', isCorrect: false }
                  ]
                },
                {
                  id: 'q-row-3',
                  prompt: 'Do these people agree or disagree? {{blank}}',
                  mode: 'single_choice',
                  options: [
                    { id: 'opt-1', text: 'agree', isCorrect: true },
                    { id: 'opt-2', text: 'disagree', isCorrect: false }
                  ]
                }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawMultiCCQSlide);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      expect(slide.interaction?.type).toBe('selection');

      if (slide.interaction?.type === 'selection') {
        // Invariante 1: Cohesión de CCQ global colapsa las 3 preguntas redundantes a 1 única pregunta
        expect(slide.interaction.questions).toHaveLength(1);

        const singleQuestion = slide.interaction.questions![0];
        // Invariante 2: Limpieza de tokens espurios [ ? ] y {{blank}}, y de diálogo duplicado
        expect(singleQuestion.prompt).toBe('Do these people agree or disagree?');
        expect(singleQuestion.options).toHaveLength(2);
        expect(singleQuestion.options[0].text).toBe('agree');
        expect(singleQuestion.options[0].isCorrect).toBe(true);
        expect(singleQuestion.options[1].text).toBe('disagree');
        expect(singleQuestion.options[1].isCorrect).toBe(false);
      }
    });
  });

  // =========================================================================
  describe('Caso M: Ejercicios Autosuficientes de Tipo Tabla/Cuadrícula (Directiva referenceContent)', () => {
    it('elimina referenceContent si contenía celdas de ejemplo o filas de la tabla y fuerza single_column', () => {
      const rawTableSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-table-self-sufficient-1',
            title: 'Question Words Chart',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-extracted-example',
              type: 'text',
              content: 'Who | Asking about a person | Who is that?'
            },
            interaction: {
              id: 'int-table-qw',
              type: 'input_fields',
              instruction: 'Complete the table with the correct question words:',
              layoutMode: 'table',
              tableHeaders: ['Question Word', 'Meaning / Use', 'Example'],
              tableRows: [
                [
                  { text: 'Who', isInput: false, isExample: true },
                  { text: 'Asking about a person', isInput: false },
                  { text: 'Who is that?', isInput: false }
                ],
                [
                  { text: '', isInput: true, expectedAnswer: 'Where', acceptedAnswers: ['Where'] },
                  { text: 'Asking about a place', isInput: false },
                  { text: 'Where do you live?', isInput: false }
                ]
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawTableSlide);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      // Invariante 1: Celdas de ejemplo no deben aislarse en referenceContent -> referenceContent DEBE ser null
      expect(slide.referenceContent).toBeNull();
      // Invariante 2: Ejercicio autosuficiente de tabla -> layout DEBE ser single_column
      expect(slide.layout).toBe('single_column');
      // Invariante 3: Las celdas de ejemplo permanecen intactas dentro de tableRows
      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.tableRows[0][0].text).toBe('Who');
        expect(slide.interaction.tableRows[0][0].isInput).toBe(false);
        expect(slide.interaction.tableRows[0][0].isExample).toBe(true);
      }
    });

    it('elimina table_reference espurio si la interacción ya es una tabla interactiva unificada', () => {
      const rawDuplicateTableSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-table-dup',
            title: 'Verbs Grid',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-dup-table',
              type: 'table_reference',
              title: 'Verbs Reference',
              headers: ['Base Form', 'Past Simple'],
              rows: [['go', 'went']]
            },
            interaction: {
              id: 'int-table-verbs',
              type: 'input_fields',
              instruction: 'Fill in the past simple verbs:',
              layoutMode: 'table',
              tableHeaders: ['Base Form', 'Past Simple'],
              tableRows: [
                [
                  { text: 'go', isInput: false, isExample: true },
                  { text: 'went', isInput: false, isExample: true }
                ],
                [
                  { text: 'see', isInput: false },
                  { text: '', isInput: true, expectedAnswer: 'saw', acceptedAnswers: ['saw'] }
                ]
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawDuplicateTableSlide);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      expect(slide.referenceContent).toBeNull();
      expect(slide.layout).toBe('single_column');
    });
  });

  // =========================================================================
  // CASO K: Cajas Teóricas / Reglas Gramaticales / Material Explicativo Puro
  // =========================================================================
  describe('Caso K: Cajas Teóricas / Reglas Gramaticales / Material Explicativo Puro', () => {
    it('convierte cajas teóricas de reglas gramaticales mal clasificadas como writing a referenceContent puro', () => {
      const rawTheorySlide = JSON.stringify({
        slides: [
          {
            id: 'slide-theory-1',
            title: 'Grammar Focus: Present Perfect vs Past Simple',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-theory-fake-writing',
              type: 'writing',
              instruction: 'Summarize the main rules for when to use the present perfect and past simple.',
              prompt: 'We use the present perfect for actions at an unspecified time in the past, and the past simple for specific past moments.',
              guidelines: []
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawTheorySlide);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      // Invariante 1: Prohibido degradar cajas teóricas a tareas de redacción libre
      expect(slide.interaction).toBeNull();
      // Invariante 2: No es una actividad interactiva evaluable
      expect(slide.isGraded).toBe(false);
      // Invariante 3: El contenido se preserva en referenceContent con categoría grammar_note
      expect(slide.referenceContent).not.toBeNull();
      expect(slide.referenceContent?.type).toBe('text');
      if (slide.referenceContent?.type === 'text') {
        expect(slide.referenceContent.category).toBe('grammar_note');
        expect(slide.referenceContent.content).toContain('We use the present perfect');
      }
      // Invariante 4: Disposición de diapositiva expositiva de una columna
      expect(slide.layout).toBe('single_column');
    });

    it('establece isGraded: false e interaction: null en matrices o tablas gramaticales puramente estáticas (100% isInput: false)', () => {
      const rawStaticMatrixSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-matrix-agree-disagree',
            title: 'Real World: Agreeing and Disagreeing',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-matrix-1',
              type: 'input_fields',
              instruction: 'Study how to agree and disagree in conversations:',
              layoutMode: 'table',
              tableHeaders: ['Statement', 'Agree', 'Disagree'],
              tableRows: [
                [
                  { text: 'I love Italian food.', isInput: false },
                  { text: 'So do I.', isInput: false },
                  { text: "I don't.", isInput: false }
                ],
                [
                  { text: "I can't swim well.", isInput: false },
                  { text: "Neither can I.", isInput: false },
                  { text: 'I can.', isInput: false }
                ]
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawStaticMatrixSlide);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      // Invariante: Bloque sin celdas interactivas se emite con isGraded: false e interaction: null
      expect(slide.isGraded).toBe(false);
      expect(slide.interaction).toBeNull();
      expect(slide.layout).toBe('single_column');
      expect(slide.referenceContent).not.toBeNull();
      expect(slide.referenceContent?.type).toBe('table_reference');
      if (slide.referenceContent?.type === 'table_reference') {
        expect(slide.referenceContent.headers).toEqual(['Statement', 'Agree', 'Disagree']);
        expect(slide.referenceContent.rows).toHaveLength(2);
      }
    });

    it('normaliza instrucciones resolutivas ("Complete the table...") a propósito de consulta ("Study the table...") en bloques sin elementos activos', () => {
      const rawStaticSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-static-resolutive',
            title: 'Irregular Verbs Reference',
            subtitle: 'Complete the table with the past forms',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-static-tbl',
              type: 'input_fields',
              instruction: 'Complete the table with the past forms',
              layoutMode: 'table',
              tableHeaders: ['Infinitive', 'Past Simple', 'Past Participle'],
              tableRows: [
                [
                  { text: 'go', isInput: false },
                  { text: 'went', isInput: false },
                  { text: 'gone', isInput: false }
                ]
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawStaticSlide);
      const slide = slides[0];
      expect(slide.isGraded).toBe(false);
      expect(slide.interaction).toBeNull();
      expect(slide.subtitle).toBe('Study the table with the past forms');
      expect(slide.referenceContent?.type).toBe('table_reference');
    });

    it('preserva íntegramente el texto perimetral y notas explicativas dentro de referenceContent.body al combinar elementos estructurados', () => {
      const rawCombinedSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-perimetral-1',
            title: 'Vocabulary & Phrases: In an Office',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-perimetral-note',
              type: 'text',
              category: 'grammar_note',
              title: 'Useful Language & Tip',
              content: 'Notice how "colleague" is used for professional peers. Always use polite intonation.',
              body: 'Notice how "colleague" is used for professional peers. Always use polite intonation.'
            },
            interaction: {
              id: 'int-office-table',
              type: 'input_fields',
              instruction: 'Complete the missing office phrases:',
              layoutMode: 'table',
              tableHeaders: ['Role', 'Phrase'],
              tableRows: [
                [
                  { text: 'Receptionist', isInput: false },
                  { text: '', isInput: true, inputId: 'inp-1', expectedAnswer: 'How can I help you?' }
                ]
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawCombinedSlide);
      const slide = slides[0];
      // El texto perimetral NO debe ser eliminado a pesar de tener una tabla en la interacción
      expect(slide.referenceContent).not.toBeNull();
      expect(slide.referenceContent?.type).toBe('text');
      if (slide.referenceContent?.type === 'text') {
        expect(slide.referenceContent.body).toContain('Notice how "colleague" is used');
        expect(slide.referenceContent.content).toContain('Notice how "colleague" is used');
      }
      expect(slide.interaction).not.toBeNull();
      expect(slide.isGraded).toBe(true);
    });

    it('preserva el texto perimetral body en table_reference convirtiéndolo en nota de referencia textual para evitar pérdida de contexto', () => {
      const rawTableRefSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-table-perimetral-2',
            title: 'Quantifiers: Much / Many / A lot of',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-tbl-with-body',
              type: 'table_reference',
              title: 'Quantifiers Overview',
              headers: ['Countable', 'Uncountable'],
              rows: [['many', 'much']],
              body: 'Important Note: Use "a lot of" in affirmative sentences, and "much/many" in questions and negatives.'
            },
            interaction: {
              id: 'int-quant-1',
              type: 'input_fields',
              instruction: 'Complete the sentences with much or many:',
              layoutMode: 'table',
              tableHeaders: ['Question', 'Answer'],
              tableRows: [
                [
                  { text: 'How ___ milk is left?', isInput: true, inputId: 'inp-milk', expectedAnswer: 'much' },
                  { text: 'Not much.', isInput: false }
                ]
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawTableRefSlide);
      const slide = slides[0];
      expect(slide.referenceContent).not.toBeNull();
      expect(slide.referenceContent?.type).toBe('text');
      if (slide.referenceContent?.type === 'text') {
        expect(slide.referenceContent.body).toContain('Important Note: Use "a lot of"');
      }
    });

    it('normaliza diapositivas informativas puras con categorías no estándar (grammar_reference -> grammar_note)', () => {
      const rawRefSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-theory-ref',
            title: 'Language Summary - Unit 4',
            layout: 'single_column',
            referenceContent: {
              id: 'ref-lang-sum',
              type: 'text',
              category: 'grammar_reference',
              title: 'Language Summary',
              content: 'Rule 1: Always check auxiliary agreement.\nRule 2: Irregular forms require memorization.'
            },
            interaction: null
          }
        ]
      });

      const slides = validateAndParseSlides(rawRefSlide);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      expect(slide.interaction).toBeNull();
      expect(slide.layout).toBe('single_column');
      if (slide.referenceContent?.type === 'text') {
        expect(slide.referenceContent.category).toBe('grammar_note');
        expect(slide.referenceContent.content).toContain('Rule 1: Always check auxiliary agreement.');
      }
    });

    it('preserva contextBody y tabla de forma coexistente en validateAndParseSlides y slideToExtractedBlock', () => {
      const compositeSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-composite-theory',
            title: 'Grammar Focus: Past Simple',
            layout: 'split_50_50',
            contextBody: '• Use did/didn\'t for questions and negatives.\n• TIP: Never use did with was/were.',
            referenceContent: {
              id: 'ref-composite-table',
              type: 'reference_table',
              title: 'Past Simple Forms',
              body: '• Use did/didn\'t for questions and negatives.\n• TIP: Never use did with was/were.',
              columns: [
                { header: 'Positive', items: ['I watched TV.', 'He went out.'] },
                { header: 'Negative', items: ['I didn\'t watch TV.', 'He didn\'t go out.'] }
              ]
            },
            interaction: null
          }
        ]
      });

      const slides = validateAndParseSlides(compositeSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];
      expect(slide.contextBody).toContain('TIP: Never use did with was/were.');
      expect(slide.referenceContent?.type).toBe('reference_table');
      if (slide.referenceContent && 'body' in slide.referenceContent) {
        expect(slide.referenceContent.body).toContain('Use did/didn\'t for questions');
      }

      const extractedBlock = slideToExtractedBlock(slide, 'https://example.com/snippet.png', []);
      expect(extractedBlock.contextBody).toContain('TIP: Never use did with was/were.');
      expect(extractedBlock.rawText).toContain('Positive');
      expect(extractedBlock.rawText).toContain('Negative');
      expect(extractedBlock.rawText).toContain('TIP: Never use did with was/were.');
      expect(extractedBlock.parsedData?.contextBody).toContain('TIP: Never use did with was/were.');
    });
  });

  // =========================================================================
  // CASO N: Principio Universal de Densidad Máxima y Ergonomía (Slide Ergonomics)
  // =========================================================================
  describe('Caso N: Principio Universal de Densidad Máxima y Ergonomía (Slide Ergonomics & Cognitive Load)', () => {
    it('mantiene el texto de lectura 100% íntegro y acota el panel interactivo a un máximo representativo de 8 reactivos ante baterías masivas', () => {
      const massiveReadingActivity = JSON.stringify({
        slides: [
          {
            id: 'slide-reading-density',
            title: 'Reading Comprehension: An Inspiring Journey',
            subtitle: 'Read the article and complete the sentences.',
            layout: 'split_50_50',
            isGraded: true,
            referenceContent: {
              id: 'ref-reading-story',
              type: 'text',
              category: 'reading',
              title: 'An Inspiring Journey',
              content: 'Full story paragraph 1...\n\nFull story paragraph 2...\n\nFull story paragraph 3...',
              body: 'Full story paragraph 1...\n\nFull story paragraph 2...\n\nFull story paragraph 3...',
            },
            interaction: {
              id: 'int-reading-items',
              type: 'input_fields',
              instruction: 'Complete the sentences based on the text:',
              listItems: Array.from({ length: 14 }, (_, i) => ({
                id: `item-${i + 1}`,
                prompt: `Sentence item ${i + 1} with blank: {{blank}}`,
                expectedAnswer: `Answer ${i + 1}`,
                acceptedAnswers: [`Answer ${i + 1}`],
                isExample: i === 0,
              })),
            },
          },
        ],
      });

      const slides = validateAndParseSlides(massiveReadingActivity);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // 1. Integridad total del texto de lectura de apoyo
      expect(slide.referenceContent?.type).toBe('text');
      if (slide.referenceContent && 'content' in slide.referenceContent) {
        expect(slide.referenceContent.content).toBe('Full story paragraph 1...\n\nFull story paragraph 2...\n\nFull story paragraph 3...');
      }

      // 2. Acotamiento ergonómico del panel interactivo (máximo 8 reactivos representativos)
      expect(slide.interaction?.type).toBe('input_fields');
      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.listItems).toHaveLength(8);
        expect(slide.interaction.listItems?.[0].prompt).toBe('Sentence item 1 with blank: {{blank}}');
        expect(slide.interaction.listItems?.[7].prompt).toBe('Sentence item 8 with blank: {{blank}}');
      }
    });

    it('permite que listas independientes autosuficientes sin texto de lectura conserven más de 8 elementos en single_column', () => {
      const standaloneVocabularyDrill = JSON.stringify({
        slides: [
          {
            id: 'slide-drill',
            title: 'Irregular Verbs Drill',
            subtitle: 'Fill in the past simple form.',
            layout: 'single_column',
            isGraded: true,
            referenceContent: null,
            interaction: {
              id: 'int-drill',
              type: 'input_fields',
              instruction: 'Write the past simple form:',
              listItems: Array.from({ length: 10 }, (_, i) => ({
                id: `verb-${i + 1}`,
                prompt: `Verb ${i + 1}`,
                expectedAnswer: `Past ${i + 1}`,
                acceptedAnswers: [`Past ${i + 1}`],
                isExample: false,
              })),
            },
          },
        ],
      });

      const slides = validateAndParseSlides(standaloneVocabularyDrill);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Al no tener referenceContent (single_column), no sufre saturación en dos columnas y no se trunca
      expect(slide.referenceContent).toBeNull();
      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.listItems).toHaveLength(10);
      }
    });
  });

  // =========================================================================
  // CASO O: Soporte Nativo Universal para Selección Múltiple (allowMultiple)
  // =========================================================================
  describe('Caso O: Soporte Nativo Universal para Selección Múltiple (allowMultiple: true)', () => {
    it('SelectionBlockSchema asigna allowMultiple: false por defecto garantizando 100% retrocompatibilidad', () => {
      const parsed = SelectionBlockSchema.parse({
        type: 'selection',
        id: 'sel-test-compat',
        instruction: 'Choose one answer:',
        options: [
          { id: 'opt-1', text: 'Option A', isCorrect: true },
          { id: 'opt-2', text: 'Option B', isCorrect: false },
        ],
      });

      expect(parsed.allowMultiple).toBe(false);
    });

    it('validateAndParseSlides valida y preserva allowMultiple: true en actividades de selección múltiple', () => {
      const multiSelectSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-multi-sel',
            title: 'Reading Check: Identify Key Facts',
            subtitle: 'Select all statements that are true according to the text.',
            layout: 'single_column',
            isGraded: true,
            referenceContent: null,
            interaction: {
              id: 'int-multi-sel',
              type: 'selection',
              instruction: 'Select all that apply:',
              allowMultiple: true,
              options: [
                { id: 'opt-1', text: 'The concert started at 8 PM.', isCorrect: true },
                { id: 'opt-2', text: 'The tickets were free.', isCorrect: false },
                { id: 'opt-3', text: 'It rained during the show.', isCorrect: true },
                { id: 'opt-4', text: 'The band played 10 songs.', isCorrect: false },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(multiSelectSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];
      expect(slide.interaction?.type).toBe('selection');
      if (slide.interaction?.type === 'selection') {
        expect(slide.interaction.allowMultiple).toBe(true);
        expect(slide.interaction.options).toHaveLength(4);
      }
    });

    it('evaluateSelection puntúa con éxito la selección múltiple solo si el conjunto marcado coincide exactamente con isCorrect: true', () => {
      const multiBlock = SelectionBlockSchema.parse({
        type: 'selection',
        id: 'block-multi',
        instruction: 'Select all that apply:',
        allowMultiple: true,
        options: [
          { id: 'opt-1', text: 'Fact 1', isCorrect: true },
          { id: 'opt-2', text: 'Fact 2', isCorrect: false },
          { id: 'opt-3', text: 'Fact 3', isCorrect: true },
        ],
      });

      // 1. Acierto exacto: ambas opciones correctas marcadas y ninguna incorrecta
      const exactResult = evaluateSelection(multiBlock, {
        'block-multi': ['opt-1', 'opt-3'],
      });
      expect(exactResult.score).toBe(1);
      expect(exactResult.maxScore).toBe(1);
      expect(exactResult.details['block-multi']).toBe(true);

      // 2. Respuesta incompleta: solo marcó una de las dos correctas
      const incompleteResult = evaluateSelection(multiBlock, {
        'block-multi': ['opt-1'],
      });
      expect(incompleteResult.score).toBe(0);
      expect(incompleteResult.details['block-multi']).toBe(false);

      // 3. Falso positivo: marcó las correctas pero además marcó un distractor
      const distractorResult = evaluateSelection(multiBlock, {
        'block-multi': ['opt-1', 'opt-2', 'opt-3'],
      });
      expect(distractorResult.score).toBe(0);
      expect(distractorResult.details['block-multi']).toBe(false);
    });

    it('evaluateSelection con allowMultiple: false mantiene el comportamiento de selección única (radio button)', () => {
      const singleBlock = SelectionBlockSchema.parse({
        type: 'selection',
        id: 'block-single',
        instruction: 'Choose the best option:',
        allowMultiple: false,
        options: [
          { id: 'opt-1', text: 'Answer A', isCorrect: true },
          { id: 'opt-2', text: 'Answer B', isCorrect: false },
        ],
      });

      // Acierto
      const correctRes = evaluateSelection(singleBlock, {
        'block-single': ['opt-1'],
      });
      expect(correctRes.score).toBe(1);
      expect(correctRes.details['block-single']).toBe(true);

      // Error
      const incorrectRes = evaluateSelection(singleBlock, {
        'block-single': ['opt-2'],
      });
      expect(incorrectRes.score).toBe(0);
      expect(incorrectRes.details['block-single']).toBe(false);
    });
  });

  // =========================================================================
  // CASO P: Calibración Ontológica de Layout y Modelado de Ejemplos/Instrucciones
  // =========================================================================
  describe('Caso P: Calibración Ontológica de Layout y Modelado de Ejemplos e Instrucciones', () => {
    it('elimina referenceContent si aloja únicamente una consigna o instrucción y normaliza layout a single_column', () => {
      const rawSlideWithSpuriousInstruction = JSON.stringify({
        slides: [
          {
            id: 'slide-spurious-inst',
            title: 'Past Simple Practice',
            subtitle: 'Complete the sentences with the correct form of the verbs in brackets',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-spurious-1',
              type: 'text',
              category: 'instructions',
              content: 'Complete the sentences with the past simple form of the verbs in brackets.',
            },
            interaction: {
              id: 'int-past-simple',
              type: 'input_fields',
              instruction: 'Fill in the blanks:',
              listItems: [
                {
                  id: 'item-1',
                  prompt: '1. She ___ (go) to the supermarket yesterday.',
                  expectedAnswer: 'went',
                  acceptedAnswers: ['went'],
                  isExample: false,
                },
                {
                  id: 'item-2',
                  prompt: '2. We ___ (play) tennis last Sunday.',
                  expectedAnswer: 'played',
                  acceptedAnswers: ['played'],
                  isExample: false,
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawSlideWithSpuriousInstruction);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: Prohibido aislar instrucciones como si fueran un bloque de lectura de apoyo
      expect(slide.referenceContent).toBeNull();

      // Invariante 2: Ejercicio autosuficiente de oraciones adopta layout single_column
      expect(slide.layout).toBe('single_column');

      // Invariante 3: La consigna se preserva en los metadatos de la interacción
      expect(slide.interaction?.instruction).toContain('Complete the sentences with the past simple form');
    });

    it('elimina referenceContent si aloja una oración modelo ("Example:") y la pliega dentro de la cabecera/metadatos', () => {
      const rawSlideWithExample = JSON.stringify({
        slides: [
          {
            id: 'slide-spurious-example',
            title: 'Present Perfect Drill',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-spurious-ex',
              type: 'text',
              content: 'Example: 1. She has already visited London.',
            },
            interaction: {
              id: 'int-pres-perf',
              type: 'input_fields',
              instruction: 'Write sentences with already or yet:',
              listItems: [
                {
                  id: 'item-1',
                  prompt: '1. She has already visited London.',
                  expectedAnswer: 'has already visited',
                  isExample: false,
                },
                {
                  id: 'item-2',
                  prompt: '2. They ___ (not arrive) yet.',
                  expectedAnswer: "haven't arrived",
                  acceptedAnswers: ["haven't arrived"],
                  isExample: false,
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawSlideWithExample);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: Prohibido crear bloque de lectura para una oración modelo
      expect(slide.referenceContent).toBeNull();

      // Invariante 2: Layout normalizado a single_column
      expect(slide.layout).toBe('single_column');

      // Invariante 3: El ejemplo se pliega en la instrucción del encabezado
      expect(slide.interaction?.instruction).toContain('Example: 1. She has already visited London.');

      // Invariante 4: El ítem correspondiente queda identificado como ejemplo
      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.listItems?.[0].isExample).toBe(true);
      }
    });

    it('normaliza a single_column cualquier ejercicio autosuficiente emitido por error como split_50_50 sin texto de consulta', () => {
      const rawSelfSufficientSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-self-suff',
            title: 'Grammar Quiz',
            subtitle: 'Choose the correct option',
            layout: 'split_50_50',
            referenceContent: null,
            interaction: {
              id: 'int-quiz-1',
              type: 'selection',
              instruction: 'Choose the correct option:',
              options: [
                { id: 'opt-1', text: 'I am a teacher.', isCorrect: true },
                { id: 'opt-2', text: 'I is a teacher.', isCorrect: false },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawSelfSufficientSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.referenceContent).toBeNull();
      // Sin material de lectura externo, el layout ontológico DEBE ser single_column
      expect(slide.layout).toBe('single_column');
    });

    it('preserva split_50_50 cuando existe un texto continuo de consulta autónomo (artículo, diálogo o audioscript)', () => {
      const rawAutonomousReadingSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-reading-article',
            title: 'The Great Exploration',
            subtitle: 'Read the article and answer the questions.',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-article-1',
              type: 'text',
              category: 'reading',
              title: 'The Great Exploration',
              content: 'In 1911, two teams raced to reach the South Pole for the very first time.\n\nRoald Amundsen led the Norwegian expedition, reaching the pole in December.',
            },
            interaction: {
              id: 'int-reading-questions',
              type: 'selection',
              instruction: 'Who reached the South Pole first?',
              options: [
                { id: 'opt-1', text: 'Roald Amundsen', isCorrect: true },
                { id: 'opt-2', text: 'Robert Scott', isCorrect: false },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawAutonomousReadingSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante: split_50_50 se mantiene porque existe un artículo autónomo y preguntas interactivas
      expect(slide.referenceContent).not.toBeNull();
      expect(slide.referenceContent?.type).toBe('text');
      expect(slide.layout).toBe('split_50_50');
    });

    it('normaliza a single_column una diapositiva puramente de lectura o teoría sin elementos interactivos', () => {
      const rawPassiveSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-passive-rules',
            title: 'Grammar Note: Conditionals',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-passive-cond',
              type: 'text',
              category: 'grammar_note',
              title: 'Zero Conditional Structure',
              content: 'If + present simple, present simple. Used for universal scientific facts and general truths.',
            },
            interaction: null,
          },
        ],
      });

      const slides = validateAndParseSlides(rawPassiveSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.referenceContent).not.toBeNull();
      expect(slide.interaction).toBeNull();
      // Sin panel interactivo, la diapositiva no se divide en dos columnas; es de una sola columna
      expect(slide.layout).toBe('single_column');
    });
  });

});




