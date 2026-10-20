import { describe, it, expect, vi } from 'vitest';
import { SlideSchema, SelectionBlockSchema, type Slide } from '../../../types/schema';
import { evaluateSelection } from '../../evaluators/evaluateSelection';
import {
  validateAndParseSlides,
  slideToExtractedBlock,
  SchemaValidationError,
  extractDisjunctiveAlternatives,
  cleanSelectionPrompt,
  buildExtractionPrompt,
  detectCrossActivityReference,
  formatPreviousSlideContext,
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
    it('debe mapear pista de audio a verificationAudioUrl sin activar split_50_50 cuando hay un ejercicio interactivo', () => {
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
      // Invariante 1: No debe registrarse como referenceContent
      expect(slide.referenceContent).toBeNull();
      // Invariante 2: No debe activar split_50_50
      expect(slide.layout).toBe('single_column');
      // Invariante 3: Mapeo unívoco a los metadatos de la interacción
      expect(slide.interaction?.verificationAudioUrl).toBeDefined();
      expect(slide.interaction?.audioLabel).toBe('R1.8');
    });

    it('preserva referenceContent media y layout single_column ante escucha autónoma sin ejercicio', () => {
      const rawListeningAutonomousJson = JSON.stringify({
        slides: [
          {
            id: 'slide-audio-autonomous',
            title: 'Listening Passage: Track R1.8',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-audio-auto',
              type: 'media',
              mediaType: 'listening',
              title: 'Audio Track R1.8'
            },
            interaction: null
          }
        ]
      });

      const slides = validateAndParseSlides(rawListeningAutonomousJson);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      expect(slide.referenceContent).not.toBeNull();
      expect(slide.referenceContent?.type).toBe('media');
      if (slide.referenceContent?.type === 'media') {
        expect(slide.referenceContent.mediaType).toBe('audio');
        expect(slide.referenceContent.url).toBe('placeholder:audio-track');
      }
      expect(slide.layout).toBe('single_column');
    });

    it('acepta url vacía en media sin provocar rechazo de la diapositiva en escucha autónoma', () => {
      const rawSlideWithEmptyUrl = JSON.stringify({
        slides: [
          {
            id: 'slide-audio-empty-url',
            title: 'Listening Task',
            layout: 'single_column',
            referenceContent: {
              id: 'ref-audio-empty',
              type: 'media',
              mediaType: 'audio',
              url: '',
              title: 'Track 3'
            },
            interaction: null
          }
        ]
      });

      const slides = validateAndParseSlides(rawSlideWithEmptyUrl);
      expect(slides).toHaveLength(1);
      expect(slides[0].referenceContent?.type).toBe('media');
      expect(slides[0].layout).toBe('single_column');
    });

    it('remueve limpiamente referenceContent inválido o vacío en lugar de rechazar la diapositiva', () => {
      const rawSlideWithGarbageRef = JSON.stringify({
        slides: [
          {
            id: 'slide-garbage-ref',
            title: 'Writing Task',
            referenceContent: {
              type: 'unsupported_junk_type',
              data: {}
            },
            interaction: {
              id: 'int-3',
              type: 'writing',
              instruction: 'Write an essay about your journey',
              prompt: 'Describe your hometown in detail',
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

  // =========================================================================
  // CASO Q: Principio de Fidelidad Documental Estricta y Cero Alucinación
  // =========================================================================
  describe('Caso Q: Principio de Fidelidad Documental Estricta y Cero Alucinación en referenceContent', () => {
    it('elimina referenceContent si aloja descripciones sintéticas de la tarea tipo "Practice expressing..." y normaliza layout a single_column', () => {
      const rawSyntheticTaskSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-synthetic-task',
            title: 'Expressing Preferences',
            subtitle: 'Choose the correct response',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-syn-1',
              type: 'text',
              content: 'Practice expressing opinions about daily habits with your partner.',
            },
            interaction: {
              id: 'int-pref-1',
              type: 'selection',
              instruction: 'Choose the correct answer:',
              options: [
                { id: 'opt-1', text: 'I prefer tea to coffee.', isCorrect: true },
                { id: 'opt-2', text: 'I prefer tea than coffee.', isCorrect: false },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawSyntheticTaskSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: Cero alucinación - Descripciones sintéticas no impresas se descartan
      expect(slide.referenceContent).toBeNull();

      // Invariante 2: Sin material de consulta impreso, la diapositiva es autosuficiente en single_column
      expect(slide.layout).toBe('single_column');

      // Invariante 3: La instrucción del ejercicio no se contamina con texto docente artificial
      expect(slide.interaction?.instruction).toBe('Choose the correct answer:');
    });

    it('elimina referenceContent cuando el modelo redacta meta-comentarios docentes ("In this activity, students practice...")', () => {
      const rawTeacherMetaSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-teacher-meta',
            title: 'Past Tense Recognition',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-syn-meta',
              type: 'text',
              content: 'In this activity, students practice identifying regular and irregular past tense verbs in English sentences.',
            },
            interaction: {
              id: 'int-past-meta',
              type: 'input_fields',
              instruction: 'Fill in the blanks with the past simple:',
              listItems: [
                {
                  id: 'item-1',
                  prompt: '1. Yesterday I ___ (visit) my grandmother.',
                  expectedAnswer: 'visited',
                  acceptedAnswers: ['visited'],
                  isExample: false,
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawTeacherMetaSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.referenceContent).toBeNull();
      expect(slide.layout).toBe('single_column');
      expect(slide.interaction?.instruction).toBe('Fill in the blanks with the past simple:');
    });

    it('preserva referenceContent íntegro y layout split_50_50 cuando contiene un diálogo OCR verbatim con hablantes', () => {
      const rawDialogueSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-verbatim-dial',
            title: 'Ordering at a Restaurant',
            subtitle: 'Read the dialogue and answer the question.',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-dial-1',
              type: 'text',
              category: 'dialogue',
              title: 'At the Bistro',
              content: 'Waiter: Good evening. Are you ready to order?\nCustomer: Yes, I would like the pasta, please.\nWaiter: Certainly, and what would you like to drink?',
            },
            interaction: {
              id: 'int-dial-q',
              type: 'selection',
              instruction: 'What did the customer order?',
              options: [
                { id: 'opt-1', text: 'Pasta', isCorrect: true },
                { id: 'opt-2', text: 'Pizza', isCorrect: false },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawDialogueSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante: El diálogo real impreso se mantiene intacto y activa el split_50_50
      expect(slide.referenceContent).not.toBeNull();
      expect(slide.referenceContent?.type).toBe('text');
      expect(slide.layout).toBe('split_50_50');
    });
  });

  // =========================================================================
  describe('Caso R: Asignación Única, Descomposición Canónica de Reactivos con \'/\' y Discriminación Negativa', () => {
    it('elimina referenceContent si duplica los reactivos del ejercicio e impone single_column (Principio de Asignación Única)', () => {
      const rawDuplicateExerciseSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-dup-reactives',
            title: 'Vocabulary: Common Collocations',
            subtitle: 'Cross out the incorrect word in each line.',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-dup-1',
              type: 'text',
              content: '1. work in a school/an office/a receptionist\n2. have a brother/a car/a uniform\n3. live in a flat/with parents/alone',
            },
            interaction: {
              id: 'int-dup-1',
              type: 'selection',
              instruction: 'Cross out the incorrect word in each line:',
              questions: [
                {
                  id: 'q-1',
                  prompt: '1. work in a school/an office/a receptionist',
                  mode: 'single_choice',
                  options: [
                    { id: 'opt-1', text: 'a school', isCorrect: false },
                    { id: 'opt-2', text: 'an office', isCorrect: false },
                    { id: 'opt-3', text: 'a receptionist', isCorrect: true },
                  ],
                },
                {
                  id: 'q-2',
                  prompt: '2. have a brother/a car/a uniform',
                  mode: 'single_choice',
                  options: [
                    { id: 'opt-1', text: 'a brother', isCorrect: false },
                    { id: 'opt-2', text: 'a car', isCorrect: false },
                    { id: 'opt-3', text: 'a uniform', isCorrect: true },
                  ],
                },
                {
                  id: 'q-3',
                  prompt: '3. live in a flat/with parents/alone',
                  mode: 'single_choice',
                  options: [
                    { id: 'opt-1', text: 'a flat', isCorrect: false },
                    { id: 'opt-2', text: 'with parents', isCorrect: false },
                    { id: 'opt-3', text: 'alone', isCorrect: true },
                  ],
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawDuplicateExerciseSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: Ningún fragmento del recorte se duplica entre referenceContent e interaction
      // Si todo el recorte son reactivos, referenceContent DEBE ser estrictamente null
      expect(slide.referenceContent).toBeNull();

      // Invariante 2: Ejercicio autosuficiente de reactivos se normaliza a single_column
      expect(slide.layout).toBe('single_column');
    });

    it('descompone canónicamente reactivos con base léxica y opciones delimitadas por \'/\' en prompt base y options individuales', () => {
      const rawSlashExerciseSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-slash-decomp',
            title: 'Collocations Practice',
            subtitle: 'Choose the correct option',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-slash-1',
              type: 'selection',
              instruction: 'Choose the correct option:',
              questions: [
                {
                  id: 'q-1',
                  prompt: '1. work in a school/an office/a receptionist [ ? ]',
                  mode: 'single_choice',
                  expectedAnswer: 'a school',
                  options: [],
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawSlashExerciseSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.interaction?.type).toBe('selection');
      if (slide.interaction?.type === 'selection' && slide.interaction.questions) {
        const q = slide.interaction.questions[0];

        // Invariante: Base léxica común constituye el prompt limpio
        expect(q.prompt).toBe('work in');

        // Invariante: Opciones mapeadas directamente como ítems individuales dentro de options
        expect(q.options).toHaveLength(3);
        expect(q.options[0].text).toBe('a school');
        expect(q.options[1].text).toBe('an office');
        expect(q.options[2].text).toBe('a receptionist');

        // Invariante: Sin oraciones con huecos ("[ ? ]", "{{blank}}") en prompt u opciones
        expect(q.prompt).not.toContain('[ ? ]');
        expect(q.prompt).not.toContain('{{blank}}');
        q.options.forEach((opt) => {
          expect(opt.text).not.toContain('/');
          expect(opt.text).not.toContain('[ ? ]');
        });
      }
    });

    it('asigna isCorrect: true a la opción que no encaja en tareas de discriminación negativa ("Cross out" / "Odd one out")', () => {
      const rawCrossOutSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-cross-out',
            title: 'Vocabulary: Cross Out',
            subtitle: 'Cross out the incorrect word',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-cross-out-1',
              type: 'selection',
              instruction: 'Cross out the word/phrase that does not go with the verb:',
              questions: [
                {
                  id: 'q-1',
                  prompt: 'work in a school/an office/a receptionist',
                  mode: 'single_choice',
                  expectedAnswer: 'a receptionist',
                  options: [],
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawCrossOutSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      if (slide.interaction?.type === 'selection' && slide.interaction.questions) {
        const q = slide.interaction.questions[0];
        expect(q.prompt).toBe('work in');

        const optSchool = q.options.find((o) => o.text === 'a school');
        const optOffice = q.options.find((o) => o.text === 'an office');
        const optReceptionist = q.options.find((o) => o.text === 'a receptionist');

        // Invariante: En discriminación negativa, el elemento que NO encaja es isCorrect: true
        expect(optReceptionist?.isCorrect).toBe(true);
        expect(optSchool?.isCorrect).toBe(false);
        expect(optOffice?.isCorrect).toBe(false);
      }
    });

    it('invierte polaridad en discriminación negativa si el modelo marcó erróneamente las colocalizaciones correctas como true', () => {
      const rawInvertedPolaritySlide = JSON.stringify({
        slides: [
          {
            id: 'slide-odd-one-out',
            title: 'Odd One Out',
            subtitle: 'Which one doesn\'t fit?',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-odd-1',
              type: 'selection',
              instruction: 'Which word doesn\'t fit?',
              questions: [
                {
                  id: 'q-1',
                  prompt: 'work in a school/an office/a receptionist',
                  mode: 'single_choice',
                  options: [
                    { id: 'opt-1', text: 'a school', isCorrect: true },
                    { id: 'opt-2', text: 'an office', isCorrect: true },
                    { id: 'opt-3', text: 'a receptionist', isCorrect: false },
                  ],
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawInvertedPolaritySlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      if (slide.interaction?.type === 'selection' && slide.interaction.questions) {
        const q = slide.interaction.questions[0];
        const optSchool = q.options.find((o) => o.text === 'a school');
        const optOffice = q.options.find((o) => o.text === 'an office');
        const optReceptionist = q.options.find((o) => o.text === 'a receptionist');

        // Invariante: La polaridad se invierte para que el intruso a tachar/seleccionar sea isCorrect: true
        expect(optReceptionist?.isCorrect).toBe(true);
        expect(optSchool?.isCorrect).toBe(false);
        expect(optOffice?.isCorrect).toBe(false);
      }
    });

    it('normaliza input_fields con reactivos delimitados por \'/\' en un ejercicio de "Cross out" convirtiéndolo canónicamente a selection', () => {
      const rawInputFieldsCrossOut = JSON.stringify({
        slides: [
          {
            id: 'slide-input-cross-out',
            title: 'Verbs Collocation',
            subtitle: 'Cross out the incorrect word',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-input-cross-1',
              type: 'input_fields',
              instruction: 'Cross out the incorrect word/phrase:',
              listItems: [
                {
                  id: 'item-1',
                  prompt: 'work in a school/an office/a receptionist',
                  expectedAnswer: 'a receptionist',
                  acceptedAnswers: ['a receptionist'],
                },
                {
                  id: 'item-2',
                  prompt: 'have a brother/a car/a uniform',
                  expectedAnswer: 'a uniform',
                  acceptedAnswers: ['a uniform'],
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawInputFieldsCrossOut);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante: input_fields degradado con alternativas delimitadas por barras se promueve a selection
      expect(slide.interaction?.type).toBe('selection');
      if (slide.interaction?.type === 'selection' && slide.interaction.questions) {
        expect(slide.interaction.questions).toHaveLength(2);

        const q1 = slide.interaction.questions[0];
        expect(q1.prompt).toBe('work in');
        expect(q1.options).toHaveLength(3);
        expect(q1.options.find((o) => o.text === 'a receptionist')?.isCorrect).toBe(true);
        expect(q1.options.find((o) => o.text === 'a school')?.isCorrect).toBe(false);

        const q2 = slide.interaction.questions[1];
        expect(q2.prompt).toBe('have');
        expect(q2.options).toHaveLength(3);
        expect(q2.options.find((o) => o.text === 'a uniform')?.isCorrect).toBe(true);
        expect(q2.options.find((o) => o.text === 'a brother')?.isCorrect).toBe(false);
      }
    });
  });

  // =========================================================================
  describe('Caso S: Contexto de Sesión, Grounding y Observabilidad Diagnóstica', () => {
    it('inyecta formalmente la sección PREVIOUS_SLIDE_CONTEXT en el prompt cuando se proporciona previousSlideContext', () => {
      const samplePrevSlide = {
        id: 'slide-prev-1',
        title: 'Vocabulary: Morning Activities',
        subtitle: 'Listen and repeat',
        layout: 'single_column' as const,
        interaction: {
          id: 'int-prev-1',
          type: 'input_fields' as const,
          instruction: 'Match verbs with nouns:',
          layoutMode: 'list' as const,
          wordBank: ['get up early', 'have a coffee', 'take the bus'],
          listItems: [
            { id: 'item-1', prompt: 'get up early', expectedAnswer: 'get up early', acceptedAnswers: ['get up early'] },
            { id: 'item-2', prompt: 'have a coffee', expectedAnswer: 'have a coffee', acceptedAnswers: ['have a coffee'] },
          ],
        },
      };

      const promptWithContext = buildExtractionPrompt(1, undefined, samplePrevSlide as any);

      // Invariante: La delimitación formal requerida se inyecta íntegra con declaración de banco pasivo
      expect(promptWithContext).toContain('PREVIOUS_SLIDE_CONTEXT: Contenido y material léxico pasivo de la diapositiva inmediatamente anterior');
      expect(promptWithContext).toContain('[BANCO LÉXICO DE SOLO LECTURA (READ-ONLY)');
      expect(promptWithContext).toContain('Vocabulary: Morning Activities');
      expect(promptWithContext).toContain('get up early');
      expect(promptWithContext).toContain('have a coffee');

      // Invariante: Sin contexto previo, la sección delimitada no se inyecta
      const promptWithoutContext = buildExtractionPrompt(1, undefined, null);
      expect(promptWithoutContext).not.toContain('PREVIOUS_SLIDE_CONTEXT:');
    });

    it('detectCrossActivityReference detecta patrones de referencia legítimos a ejercicios previos', () => {
      expect(detectCrossActivityReference('Complete the sentences with the phrases in 2a.')).toContain('2a');
      expect(detectCrossActivityReference('Use the verbs from 1 to complete the text.')).toContain('1');
      expect(detectCrossActivityReference('Look at the dialogue in 2. Answer the questions.')).toContain('2');
      expect(detectCrossActivityReference('Refer to exercise 3 and check your answers.')).toContain('exercise 3');
      expect(detectCrossActivityReference('Complete the sentences with words from the box above.')).toContain('box above');

      // Frases comunes no referenciales no deben producir falsos positivos
      expect(detectCrossActivityReference('Work in pairs. Ask and answer.')).toBeNull();
      expect(detectCrossActivityReference('Put the words in order.')).toBeNull();
      expect(detectCrossActivityReference('Read the article and answer the questions.')).toBeNull();
      expect(detectCrossActivityReference('Complete the sentences with the words in bold.')).toBeNull();
    });

    it('reutiliza legítimamente ítems de previousSlideContext cuando el ejercicio requiere completar a partir de una actividad previa (Grounding)', () => {
      const samplePrevSlide = {
        id: 'slide-prev-2a',
        title: '2a Daily Routines',
        layout: 'single_column' as const,
        interaction: {
          id: 'int-2a',
          type: 'input_fields' as const,
          instruction: 'Match verbs with pictures:',
          layoutMode: 'list' as const,
          wordBank: ['get up early', 'have a coffee', 'take the bus', 'leave work'],
          listItems: [
            { id: 'it-1', prompt: 'get up early', expectedAnswer: 'get up early', acceptedAnswers: ['get up early'] },
            { id: 'it-2', prompt: 'have a coffee', expectedAnswer: 'have a coffee', acceptedAnswers: ['have a coffee'] },
          ],
        },
      };

      const rawExerciseSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-2b',
            title: '2b Practice',
            subtitle: 'Complete the sentences with the phrases in 2a:',
            layout: 'single_column',
            interaction: {
              id: 'int-2b',
              type: 'input_fields',
              instruction: 'Complete the sentences with the phrases in 2a:',
              layoutMode: 'list',
              wordBank: [],
              listItems: [
                {
                  id: 'item-1',
                  prompt: '1. In the morning, I usually ___ before breakfast.',
                  expectedAnswer: 'get up early',
                  acceptedAnswers: ['get up early'],
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawExerciseSlide, samplePrevSlide as any);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: Grounding legítimo - wordBank poblado a partir de previousSlideContext
      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.wordBank).toBeDefined();
        expect(slide.interaction.wordBank).toContain('get up early');
        expect(slide.interaction.wordBank).toContain('have a coffee');
      }

      // Invariante 2: Diagnóstico formal indica resolución exitosa sin referencias no resueltas
      expect(slide.metadata?.diagnostics?.unresolvedContextReference).toBe(false);
      expect(slide.metadata?.diagnostics?.resolvedFromPreviousContext).toBe(true);
    });

    it('emite aviso diagnóstico formal y console.warn cuando el ejercicio refiere a una actividad previa y previousSlideContext no está disponible', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rawSlideWithoutContext = JSON.stringify({
        slides: [
          {
            id: 'slide-orphan-ref',
            title: 'Exercise 2b',
            subtitle: 'Use the phrases in 2a to complete the sentences.',
            layout: 'single_column',
            interaction: {
              id: 'int-orphan-1',
              type: 'input_fields',
              instruction: 'Use the phrases in 2a to complete the sentences:',
              layoutMode: 'list',
              listItems: [
                {
                  id: 'item-1',
                  prompt: '1. I usually ___ at 8:00 AM.',
                  expectedAnswer: '',
                  acceptedAnswers: [],
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawSlideWithoutContext, null);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: Notificación diagnóstica formal en metadatos
      expect(slide.metadata?.diagnostics?.unresolvedContextReference).toBe(true);
      expect(slide.metadata?.diagnostics?.warning).toContain('Actividad con referencia cruzada detectada sin diapositiva previa suministrada');

      // Invariante 2: Log estructurado console.warn emitido
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[digitizeBook] Actividad con referencia cruzada sin diapositiva previa suministrada')
      );

      warnSpy.mockRestore();
    });

    it('previene alucinación no fundamentada (Zero-Hallucination) purgando bancos sintéticos no corroborados cuando no hay contexto previo', () => {
      const rawSlideWithHallucinatedBank = JSON.stringify({
        slides: [
          {
            id: 'slide-hallucinated',
            title: '3b Word Focus',
            subtitle: 'Complete using the words in 3a.',
            layout: 'single_column',
            interaction: {
              id: 'int-hallucinated-1',
              type: 'input_fields',
              instruction: 'Complete using the words in 3a:',
              layoutMode: 'list',
              // Banco sintético inventado por el modelo sin evidencia en el recorte ni en contexto previo
              wordBank: ['astronomy', 'telescope', 'galaxy', 'planetarium'],
              listItems: [
                {
                  id: 'item-1',
                  prompt: '1. We saw a new ___ last night.',
                  expectedAnswer: 'galaxy',
                  acceptedAnswers: ['galaxy'],
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawSlideWithHallucinatedBank, null);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: Marcado como referencia no resuelta
      expect(slide.metadata?.diagnostics?.unresolvedContextReference).toBe(true);

      // Invariante 2: Banco sintético inventado se purga para evitar alucinación no fundamentada
      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.wordBank).toEqual([]);
      }
    });

    it('resuelve referencias en cadena entre actividades múltiples extraídas en el mismo lote (in-batch context)', () => {
      const rawMultiSlideBatch = JSON.stringify({
        slides: [
          {
            id: 'slide-batch-1',
            title: '1. Vocabulary Focus',
            subtitle: 'Study the verbs',
            layout: 'single_column',
            interaction: {
              id: 'int-batch-1',
              type: 'input_fields',
              instruction: 'Study the verbs:',
              layoutMode: 'list',
              wordBank: ['deliver', 'manage', 'organize', 'supervise'],
              listItems: [
                { id: 'i-1', prompt: 'deliver parcels', expectedAnswer: 'deliver', acceptedAnswers: ['deliver'] },
              ],
            },
          },
          {
            id: 'slide-batch-2',
            title: '2. Sentences Practice',
            subtitle: 'Complete the sentences using the verbs in 1.',
            layout: 'single_column',
            interaction: {
              id: 'int-batch-2',
              type: 'input_fields',
              instruction: 'Complete the sentences using the verbs in 1:',
              layoutMode: 'list',
              wordBank: [],
              listItems: [
                { id: 'i-2', prompt: 'She has to ___ a team of ten people.', expectedAnswer: 'manage', acceptedAnswers: ['manage'] },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawMultiSlideBatch, null);
      expect(slides).toHaveLength(2);

      const slide2 = slides[1];
      // Invariante: Slide 2 resuelve su referencia contra Slide 1 del mismo lote
      expect(slide2.metadata?.diagnostics?.unresolvedContextReference).toBe(false);
      expect(slide2.metadata?.diagnostics?.resolvedFromPreviousContext).toBe(true);
      if (slide2.interaction?.type === 'input_fields') {
        expect(slide2.interaction.wordBank).toContain('manage');
        expect(slide2.interaction.wordBank).toContain('deliver');
      }
    });
  });

  // =========================================================================
  // CASO T: Tratamiento Unívoco de Audio, Dinámicas Orales y Calificación Positiva
  // =========================================================================
  describe('Caso T: Tratamiento Unívoco de Audio, Dinámicas Orales y Calificación Positiva de ReferenceContent', () => {
    it('a) Asignación correcta de audios de verificación sin activar split_50_50', () => {
      const rawVerificationAudioSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-verify-v12',
            title: 'Vocabulary: Jobs & Workplaces',
            subtitle: 'Listen and check your answers',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-audio-v12',
              type: 'media',
              mediaType: 'audio',
              title: 'Audio V1.2',
              url: 'placeholder:audio-track'
            },
            interaction: {
              id: 'int-selection-jobs',
              type: 'selection',
              instruction: 'Listen and check. Choose the correct workplace for each job:',
              questions: [
                {
                  id: 'q-1',
                  mode: 'single_choice',
                  prompt: 'A nurse works in {{blank}}.',
                  options: [
                    { id: 'opt-1', text: 'a hospital', isCorrect: true },
                    { id: 'opt-2', text: 'an office', isCorrect: false }
                  ]
                }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawVerificationAudioSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: Audio de verificación se mapea a interaction.verificationAudioUrl
      expect(slide.interaction?.verificationAudioUrl).toBeDefined();
      expect(slide.interaction?.audioLabel).toBe('V1.2');
      // Invariante 2: referenceContent debe ser estrictamente null
      expect(slide.referenceContent).toBeNull();
      // Invariante 3: El layout debe ser single_column, nunca split_50_50
      expect(slide.layout).toBe('single_column');
    });

    it('b) Clasificación limpia de actividades de speaking sin mutar a writing con textarea ni minWords', () => {
      const rawSpeakingPairworkSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-speaking-2b',
            title: '2b Speaking Practice',
            subtitle: 'Work in pairs. Talk about people you know.',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-fake-writing-pairwork',
              type: 'writing',
              instruction: 'Work in pairs. Use the phrases in 2a to talk about people you know.',
              prompt: 'Do you know anyone who travels a lot for work? Where do they go?',
              guidelines: ['Use phrases from 2a', 'Ask follow-up questions'],
              minWords: 40,
              maxWords: 100,
              isGraded: false
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSpeakingPairworkSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: No debe degradarse a writing ni tener canal interactivo con textarea
      expect(slide.interaction).toBeNull();
      // Invariante 2: No es una actividad evaluable
      expect(slide.isGraded).toBe(false);
      // Invariante 3: Layout single_column con la consigna clara y modelo visible en referenceContent
      expect(slide.layout).toBe('single_column');
      expect(slide.referenceContent).not.toBeNull();
      expect(slide.referenceContent?.type).toBe('text');
      if (slide.referenceContent?.type === 'text') {
        expect(slide.referenceContent.category).toBe('dialogue');
        expect(slide.referenceContent.instruction).toBe('Work in pairs. Use the phrases in 2a to talk about people you know.');
        expect(slide.referenceContent.model).toBe('Do you know anyone who travels a lot for work? Where do they go?');
        expect(slide.referenceContent.content).toContain('Work in pairs');
        expect(slide.referenceContent.content).toContain('Do you know anyone who');
      }
    });

    it('c) Ausencia de referenceContent ante consignas aisladas tipo "Use the phrases..."', () => {
      const rawOrphanDirectiveSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-orphan-directive',
            title: 'Vocabulary Application',
            subtitle: 'Complete the sentences',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-orphan-dir',
              type: 'text',
              category: 'instructions',
              content: 'Use the phrases in 2a to complete the sentences below.'
            },
            interaction: {
              id: 'int-fill-sentences',
              type: 'input_fields',
              instruction: 'Fill in the blanks:',
              layoutMode: 'list',
              listItems: [
                { id: 'it-1', prompt: 'I always ___ coffee in the morning.', expectedAnswer: 'drink', acceptedAnswers: ['drink'] }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawOrphanDirectiveSlide);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: Consigna huérfana aislada no califica como referenceContent
      expect(slide.referenceContent).toBeNull();
      // Invariante 2: Layout normalizado a single_column
      expect(slide.layout).toBe('single_column');
      // Invariante 3: La directiva es absorbida en el encabezado de interacción
      expect(slide.interaction?.instruction).toContain('Use the phrases in 2a to complete the sentences below.');
    });

    it('d) Estructuración ontológica completa de Speaking con cues resueltos desde previousSlideContext', () => {
      const mockSlide2a: Slide = {
        id: 'slide-2a',
        title: '2a Vocabulary: Jobs',
        layout: 'single_column',
        interaction: {
          id: 'int-2a',
          type: 'input_fields',
          instruction: 'Match the jobs with the descriptions',
          layoutMode: 'list',
          wordBank: ['travels a lot for work', 'works outdoors', 'works in a hospital'],
          listItems: [],
          tableHeaders: [],
          tableRows: [],
          paragraphTemplate: '',
          paragraphInputs: {}
        }
      };

      const rawSpeakingWithContext = JSON.stringify({
        slides: [
          {
            id: 'slide-speaking-with-context',
            title: '2b Speaking Practice',
            subtitle: 'Work in pairs',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-oral-task',
              type: 'writing',
              instruction: 'Work in pairs. Use the phrases in 2a to talk about people you know.',
              prompt: 'Do you know anyone who travels a lot for work? Where do they go?',
              isGraded: false
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSpeakingWithContext, mockSlide2a);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.interaction).toBeNull();
      expect(slide.layout).toBe('single_column');
      expect(slide.referenceContent?.type).toBe('text');
      if (slide.referenceContent?.type === 'text') {
        expect(slide.referenceContent.category).toBe('dialogue');
        expect(slide.referenceContent.instruction).toBe('Work in pairs. Use the phrases in 2a to talk about people you know.');
        expect(slide.referenceContent.model).toBe('Do you know anyone who travels a lot for work? Where do they go?');
        // Cues resueltos legítimamente a partir del banco de 2a
        expect(slide.referenceContent.cues).toBeDefined();
        expect(slide.referenceContent.cues).toContain('travels a lot for work');
        expect(slide.referenceContent.cues).toContain('works outdoors');
        expect(slide.referenceContent.cues).toContain('works in a hospital');
      }
      expect(slide.metadata?.diagnostics?.resolvedFromPreviousContext).toBe(true);
    });
  });

  // =========================================================================
  // CASO U: Saneamiento Arquitectónico de Contexto Pasivo y Desacoplamiento Oral
  // =========================================================================
  describe('Caso U: Contexto Léxico Pasivo (Read-Only) y Desacoplamiento de Dinámicas Orales', () => {
    it('a) formatPreviousSlideContext emite exclusivamente léxico/referencia y no serializa estructuras interactivas técnicas', () => {
      const mockInteractiveSlide: Slide = {
        id: 'slide-prev-interactive',
        title: '2a Vocabulary: Daily Routines',
        subtitle: 'Listen and check',
        layout: 'single_column',
        contextBody: 'Read the vocabulary and listen carefully.',
        interaction: {
          id: 'int-2a-interactive',
          type: 'selection',
          instruction: 'Choose the correct option for each person',
          mode: 'single_choice',
          verificationAudioUrl: 'https://example.com/audio-2a.mp3',
          questions: [
            {
              id: 'q-1',
              prompt: 'Person 1 works outdoors',
              options: [
                { id: 'opt-1a', text: 'works outdoors', isCorrect: true },
                { id: 'opt-1b', text: 'works indoors', isCorrect: false },
              ],
            },
            {
              id: 'q-2',
              prompt: 'Person 2 travels a lot',
              options: [
                { id: 'opt-2a', text: 'travels a lot', isCorrect: true },
                { id: 'opt-2b', text: 'stays home', isCorrect: false },
              ],
            },
          ],
        } as any,
      };

      const passiveOutput = formatPreviousSlideContext(mockInteractiveSlide);

      // Invariante 1: Debe incluir el título, subtítulo, contextBody y banco léxico
      expect(passiveOutput).toContain('Title: 2a Vocabulary: Daily Routines');
      expect(passiveOutput).toContain('Subtitle: Listen and check');
      expect(passiveOutput).toContain('Context/Body: Read the vocabulary and listen carefully.');
      expect(passiveOutput).toContain('Vocabulary / Phrases Bank (Read-Only):');
      expect(passiveOutput).toContain('Person 1 works outdoors');
      expect(passiveOutput).toContain('Person 2 travels a lot');
      expect(passiveOutput).toContain('works outdoors');
      expect(passiveOutput).toContain('travels a lot');

      // Invariante 2: NO debe emitir propiedades interactivas técnicas ni audios
      expect(passiveOutput).not.toContain('interaction.type');
      expect(passiveOutput).not.toContain('Interaction Type:');
      expect(passiveOutput).not.toContain('verificationAudioUrl');
      expect(passiveOutput).not.toContain('audio-2a.mp3');
      expect(passiveOutput).not.toContain('"mode": "single_choice"');
      expect(passiveOutput).not.toContain('Questions:');
      expect(passiveOutput).not.toContain('Options:');
      expect(passiveOutput).not.toContain('isCorrect');
    });

    it('b) Una diapositiva comunicativa no clona reactivos interactivos de previousSlideContext aunque el LLM devuelva selection', () => {
      const mockSlide2a: Slide = {
        id: 'slide-2a',
        title: '2a Vocabulary',
        subtitle: 'Listen to four people talking about their jobs',
        layout: 'single_column',
        interaction: {
          id: 'int-2a',
          type: 'selection',
          instruction: 'Listen to four people talking about their jobs. Choose the correct job for each speaker.',
          verificationAudioUrl: 'https://example.com/audio-unit2.mp3',
          mode: 'single_choice',
          questions: [
            {
              id: 'q1',
              prompt: 'Speaker 1',
              options: [
                { id: 'opt-1', text: 'works in an office', isCorrect: true },
                { id: 'opt-2', text: 'works from home', isCorrect: false },
              ],
            },
            {
              id: 'q2',
              prompt: 'Speaker 2',
              options: [
                { id: 'opt-3', text: 'travels for work', isCorrect: true },
                { id: 'opt-4', text: 'works in a shop', isCorrect: false },
              ],
            },
          ],
        } as any,
      };

      // Simulación del error de Gemini: devuelve ejercicio 2b ("Work in pairs") pero
      // clonando la interacción tipo selection, las preguntas de 2a, el audio y concatenando instrucciones
      const rawClonedSelectionJson = JSON.stringify({
        slides: [
          {
            id: 'slide-2b',
            title: '2b Speaking',
            subtitle: 'Work in pairs',
            layout: 'split_50_50', // Erróneamente emitido como split
            interaction: {
              id: 'int-cloned',
              type: 'selection', // Erróneamente clonado de 2a
              instruction: 'b Work in pairs. Use the phrases in 2a to talk about people you know. a Listen to four people talking about their jobs.', // Concatenado indebido
              prompt: 'Do you know anyone who works in an office? What do they do?',
              verificationAudioUrl: 'https://example.com/audio-unit2.mp3', // Audio clonado
              mode: 'single_choice',
              questions: [
                {
                  id: 'q1',
                  prompt: 'Speaker 1',
                  options: [
                    { id: 'opt-1', text: 'works in an office', isCorrect: true },
                    { id: 'opt-2', text: 'works from home', isCorrect: false },
                  ],
                },
              ],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawClonedSelectionJson, mockSlide2a);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante 1: La interacción clonada queda completamente neutralizada (interaction = null)
      expect(slide.interaction).toBeNull();

      // Invariante 2: No es evaluable (isGraded = false)
      expect(slide.isGraded).toBe(false);

      // Invariante 3: Layout forzado a single_column
      expect(slide.layout).toBe('single_column');

      // Invariante 4: El audio clonado de 2a NO se conserva en la diapositiva oral
      expect((slide as any).verificationAudioUrl).toBeUndefined();
      expect((slide.referenceContent as any)?.audioUrl).toBeUndefined();

      // Invariante 5: Consigna previa concatenada queda purgada
      expect(slide.referenceContent?.type).toBe('text');
      if (slide.referenceContent?.type === 'text') {
        expect(slide.referenceContent.category).toBe('dialogue');
        expect(slide.referenceContent.instruction).toContain('Work in pairs. Use the phrases in 2a to talk about people you know.');
        expect(slide.referenceContent.instruction).not.toContain('Listen to four people talking about their jobs');

        // Invariante 6: Model extraído verbatim y cues resueltos desde el banco léxico de 2a
        expect(slide.referenceContent.model).toBe('Do you know anyone who works in an office? What do they do?');
        expect(slide.referenceContent.cues).toBeDefined();
        expect(slide.referenceContent.cues).toContain('works in an office');
        expect(slide.referenceContent.cues).toContain('travels for work');
      }
    });

    it('c) model y cues se estructuran limpiamente con interaction nula en consignas puramente orales sin reactivos', () => {
      const mockSlide2a: Slide = {
        id: 'slide-2a-vocab',
        title: 'Vocabulary: Collocations',
        layout: 'single_column',
        interaction: {
          id: 'int-vocab-bank',
          type: 'input_fields',
          instruction: 'Complete the collocations',
          layoutMode: 'list',
          wordBank: ['take photos', 'make dinner', 'have a shower', 'spend time'],
          listItems: [],
        } as any,
      };

      const rawOralJson = JSON.stringify({
        slides: [
          {
            id: 'slide-speaking-clean',
            title: 'Speaking',
            subtitle: 'Discuss with a partner',
            layout: 'single_column',
            interaction: {
              id: 'int-orphan-oral',
              type: 'writing',
              instruction: 'In pairs, ask and answer questions using the collocations in 2a.',
              prompt: '"How often do you take photos?" "I take photos every weekend."',
              isGraded: false,
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawOralJson, mockSlide2a);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.interaction).toBeNull();
      expect(slide.isGraded).toBe(false);
      expect(slide.layout).toBe('single_column');
      expect(slide.referenceContent?.type).toBe('text');
      if (slide.referenceContent?.type === 'text') {
        expect(slide.referenceContent.instruction).toBe('In pairs, ask and answer questions using the collocations in 2a.');
        expect(slide.referenceContent.model).toBe('"How often do you take photos?" "I take photos every weekend."');
        expect(slide.referenceContent.cues).toEqual(
          expect.arrayContaining(['take photos', 'make dinner', 'have a shower', 'spend time'])
        );
      }
    });
  });

  // =========================================================================
  // CASO V: Soporte Epistémico para Solucionarios / Answer Keys y Normalización de WordBank
  // =========================================================================
  describe('Caso V: Soporte Epistémico para Solucionarios / Answer Keys y Normalización de WordBank', () => {
    it('debe resolver expectedAnswer guiado por un recorte/slide de Solucionario sin generar diapositiva extra ni contaminar referenceContent', () => {
      const rawWithAnswerKey = JSON.stringify({
        slides: [
          {
            id: 'slide-ex-1b',
            title: '1b Vocabulary: Phrasal Verbs',
            subtitle: 'Complete the sentences',
            layout: 'single_column',
            instruction: 'Complete the sentences with the correct phrasal verb.',
            referenceContent: null,
            interaction: {
              id: 'int-1b',
              type: 'input_fields',
              listItems: [
                { id: 'item-1', prompt: '1. Please {{blank}} your room before dinner.', expectedAnswer: '' },
                { id: 'item-2', prompt: '2. She has to {{blank}} her younger brother.', expectedAnswer: '' },
                { id: 'item-3', prompt: '3. Don\'t forget to {{blank}} the trash.', expectedAnswer: '' }
              ]
            }
          },
          // Diapositiva espuria proveniente del recorte del solucionario / Teacher\'s Notes
          {
            id: 'slide-answer-key',
            title: 'Answer Key / Solucionario',
            subtitle: 'Unit 4 Exercise Answers',
            layout: 'single_column',
            referenceContent: {
              type: 'text',
              title: 'Answers',
              body: '1b) 1 tidy up 2 look after 3 take out\n2a) 1 was 2 were'
            },
            interaction: null
          }
        ]
      });

      const slides = validateAndParseSlides(rawWithAnswerKey);

      // 1. Invariante Epistémica: El solucionario NUNCA se convierte en slide independiente
      expect(slides).toHaveLength(1);
      const slide = slides[0];
      expect(slide.id).toBe('slide-ex-1b');

      // 2. Invariante de Confidencialidad y Layout: referenceContent queda null y layout single_column
      expect(slide.referenceContent).toBeNull();
      expect(slide.layout).toBe('single_column');

      // 3. Invariante de Ground Truth: expectedAnswer se resuelve exactamente desde la clave
      expect(slide.interaction?.type).toBe('input_fields');
      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.listItems[0].expectedAnswer).toBe('tidy up');
        expect(slide.interaction.listItems[1].expectedAnswer).toBe('look after');
        expect(slide.interaction.listItems[2].expectedAnswer).toBe('take out');
      }
    });

    it('debe purgar el solucionario si vino inyectado dentro de referenceContent y resolver las respuestas limpiando variables rotas', () => {
      const rawWithContaminatedReference = JSON.stringify({
        slides: [
          {
            id: 'slide-ex-contaminated',
            title: 'Vocabulary Practice',
            layout: 'split_50_50',
            // Solucionario filtrado indebidamente en referenceContent
            referenceContent: {
              type: 'text',
              title: 'Teacher\'s Notes & Answer Key',
              body: '1 tidy up 2 look after 3 take out'
            },
            interaction: {
              id: 'int-contam',
              type: 'input_fields',
              listItems: [
                { id: 'item-1', prompt: '1. Please [blank] your room.', expectedAnswer: '' },
                { id: 'item-2', prompt: '2. She will [?] her brother.', expectedAnswer: '' },
                { id: 'item-3', prompt: '3. You must [blank] the trash.', expectedAnswer: '' }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawWithContaminatedReference);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Purgado absoluto del solucionario como referenceContent
      expect(slide.referenceContent).toBeNull();
      expect(slide.layout).toBe('single_column');

      // Normalización de marcadores rotos [blank] y [?] a {{blank}}
      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.listItems[0].prompt).toBe('1. Please {{blank}} your room.');
        expect(slide.interaction.listItems[1].prompt).toBe('2. She will {{blank}} her brother.');
        expect(slide.interaction.listItems[2].prompt).toBe('3. You must {{blank}} the trash.');

        // Respuestas resueltas fielmente por la clave extraída
        expect(slide.interaction.listItems[0].expectedAnswer).toBe('tidy up');
        expect(slide.interaction.listItems[1].expectedAnswer).toBe('look after');
        expect(slide.interaction.listItems[2].expectedAnswer).toBe('take out');
      }
    });

    it('debe catalogar una caja de palabras como interaction.wordBank en single_column sin activar split_50_50', () => {
      const rawWithWordBox = JSON.stringify({
        slides: [
          {
            id: 'slide-wordbox-ex',
            title: 'Fill in the blanks',
            layout: 'split_50_50',
            // Caja de palabras erróneamente colocada como lectura / referenceContent
            referenceContent: {
              type: 'text',
              title: 'Word Bank',
              body: 'tidy up, look after, take out, turn off, wake up'
            },
            interaction: {
              id: 'int-wb',
              type: 'input_fields',
              instruction: 'Complete the sentences using words from the box.',
              listItems: [
                { id: 'item-1', prompt: '1. Please {{blank}} your room.', expectedAnswer: 'tidy up' },
                { id: 'item-2', prompt: '2. Don\'t forget to {{blank}} the lights.', expectedAnswer: 'turn off' }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawWithWordBox);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante Estructural de Layout y WordBank
      expect(slide.referenceContent).toBeNull();
      expect(slide.layout).toBe('single_column');
      expect(slide.interaction?.type).toBe('input_fields');

      if (slide.interaction?.type === 'input_fields') {
        expect(slide.interaction.wordBank).toBeDefined();
        expect(slide.interaction.wordBank).toEqual(
          expect.arrayContaining(['tidy up', 'look after', 'take out', 'turn off', 'wake up'])
        );
      }
    });

    it('debe resolver isCorrect en selection.questions basándose en la clave del solucionario', () => {
      const rawWithSelectionKey = JSON.stringify({
        slides: [
          {
            id: 'slide-quiz-1',
            title: 'Multiple Choice Quiz',
            layout: 'single_column',
            interaction: {
              id: 'int-mc',
              type: 'selection',
              questions: [
                {
                  id: 'q-1',
                  prompt: '1. What should you do with your messy room?',
                  mode: 'single_choice',
                  options: [
                    { id: 'opt-1a', text: 'turn off', isCorrect: false },
                    { id: 'opt-1b', text: 'tidy up', isCorrect: false }
                  ]
                },
                {
                  id: 'q-2',
                  prompt: '2. Who will take care of the puppy?',
                  mode: 'single_choice',
                  options: [
                    { id: 'opt-2a', text: 'wake up', isCorrect: false },
                    { id: 'opt-2b', text: 'look after', isCorrect: false }
                  ]
                }
              ]
            }
          },
          {
            id: 'slide-ak-quiz',
            title: 'Answers',
            interaction: {
              id: 'int-ak',
              type: 'input_fields',
              instruction: '1 b) tidy up 2 b) look after',
              listItems: []
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawWithSelectionKey);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.interaction?.type).toBe('selection');
      if (slide.interaction?.type === 'selection') {
        const q1 = slide.interaction.questions[0];
        const q2 = slide.interaction.questions[1];

        // Opción 'b' (tidy up) debe quedar como correcta según la clave oficial
        expect(q1.options.find(o => o.id === 'opt-1b')?.isCorrect).toBe(true);
        expect(q1.options.find(o => o.id === 'opt-1a')?.isCorrect).toBe(false);

        // Opción 'b' (look after) debe quedar como correcta
        expect(q2.options.find(o => o.id === 'opt-2b')?.isCorrect).toBe(true);
        expect(q2.options.find(o => o.id === 'opt-2a')?.isCorrect).toBe(false);
      }
    });
  });
});





