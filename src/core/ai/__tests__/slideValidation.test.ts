import { describe, it, expect, vi } from 'vitest';
import {
  SlideSchema,
  SelectionBlockSchema,
  ClozeMultichoiceBlockSchema,
  ClozeMultichoiceGapSchema,
  ClozeMultichoiceOptionSchema,
  type Slide,
} from '../../../types/schema';
import { evaluateSelection } from '../../evaluators/evaluateSelection';
import {
  validateAndParseSlides,
  slideToExtractedBlock,
  SchemaValidationError,
  extractDisjunctiveAlternatives,
  cleanSelectionPrompt,
  isolateCanonicalInstruction,
  extractCategoryBucketsFromText,
  toSentenceCase,
  buildExtractionPrompt,
  detectCrossActivityReference,
  formatPreviousSlideContext,
  canonicalizeReferencePositionMarkers,
  normalizeBucketsMatchingInteraction,
  extractTwoPartItemsFromSlide,
  assembleTwoPartToken,
  parseBucketsCategoryAnswerKey,
  cleanOptionText,
  isClozeMultichoiceActivity,
  normalizeClozeMultichoiceInteraction,
  extractRealOptionsForOrdinal,
  parseOptionsFromOrdinalBlock,
  areGapOptionsPlaceholderOrEmpty,
  parseClozeOptionsFromText,
  STRUCTURED_SLIDE_SCHEMA,
  getStructuredSlideSchema,
  CANDIDATE_TIMEOUT_MS,
  DEFAULT_GEMINI_CANDIDATE_MODELS,
  DEFAULT_OPENROUTER_CANDIDATE_MODELS,
  normalizeSlide,
  parseMatchingPairsFromText,
  parseSequentialAnswerKeyFromText,
  extractNumberedPremises,
} from '../digitizeBook';
import { evaluateClozeMultichoice } from '../../evaluators/evaluateClozeMultichoice';

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

  // =========================================================================
  // CASO W: Desacoplamiento de Tokens en WordBank y Grounding Estricto de Multimedia
  // =========================================================================
  describe('Caso W: Desacoplamiento de Tokens en WordBank y Grounding Estricto de Multimedia', () => {
    it('a) desacopla limpiamente el término a insertar del complemento visible en el prompt ("{{blank}} ...") ante colocaciones y evita reactivos vacíos de contexto', () => {
      const rawWithCollocation = JSON.stringify({
        slides: [
          {
            id: 'slide-ex-collocation-1',
            title: '1b Vocabulary: Phrasal Verbs',
            layout: 'single_column',
            referenceContent: null,
            interaction: {
              id: 'int-colloc-1',
              type: 'input_fields',
              instruction: 'Complete the sentences using words from the box.',
              wordBank: ['tidy', 'look', 'take', 'turn', 'wake'],
              listItems: [
                // Caso 1: Prompt originalmente desnudo solo con ordinal "1." y clave compuesta "tidy up"
                { id: 'i-1', prompt: '1.', expectedAnswer: 'tidy up' },
                // Caso 2: Prompt con complemento "after" sin blank y clave compuesta "look after"
                { id: 'i-2', prompt: '2. after', expectedAnswer: 'look after' },
                // Caso 3: Prompt con ordinal y blank pero sin complemento visible "3. {{blank}}" y clave "take out"
                { id: 'i-3', prompt: '3. {{blank}}', expectedAnswer: 'take out' }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawWithCollocation);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.interaction?.type).toBe('input_fields');
      if (slide.interaction?.type === 'input_fields') {
        const items = slide.interaction.listItems;
        expect(items).toHaveLength(3);

        // Ítem 1: "tidy up" -> Token "tidy", Complemento "up" en prompt visible
        expect(items[0].expectedAnswer).toBe('tidy');
        expect(items[0].prompt).toBe('1. {{blank}} up');

        // Ítem 2: "look after" -> Token "look", Complemento "after" en prompt visible
        expect(items[1].expectedAnswer).toBe('look');
        expect(items[1].prompt).toBe('2. {{blank}} after');

        // Ítem 3: "take out" -> Token "take", Complemento "out" en prompt visible
        expect(items[2].expectedAnswer).toBe('take');
        expect(items[2].prompt).toBe('3. {{blank}} out');
      }
    });

    it('a2) desacopla correctamente cuando el token en el wordBank es la segunda parte de la colocación (sufijo/partícula)', () => {
      const rawWithSuffixBank = JSON.stringify({
        slides: [
          {
            id: 'slide-suffix-bank',
            title: 'Collocations with Prepositions',
            layout: 'single_column',
            interaction: {
              id: 'int-suff',
              type: 'input_fields',
              instruction: 'Complete the phrases with prepositions from the box.',
              wordBank: ['up', 'after', 'out', 'off'],
              listItems: [
                { id: 'it-1', prompt: '1. tidy', expectedAnswer: 'tidy up' },
                { id: 'it-2', prompt: '2.', expectedAnswer: 'look after' }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawWithSuffixBank);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      if (slide.interaction?.type === 'input_fields') {
        const items = slide.interaction.listItems;
        expect(items[0].expectedAnswer).toBe('up');
        expect(items[0].prompt).toBe('1. tidy {{blank}}');

        expect(items[1].expectedAnswer).toBe('after');
        expect(items[1].prompt).toBe('2. look {{blank}}');
      }
    });

    it('b) la presencia de identificadores documentales alfanuméricos sin directiva explícita de escucha no genera verificationAudioUrl ni añade reproductores', () => {
      const rawWithDocumentaryReference = JSON.stringify({
        slides: [
          {
            id: 'slide-doc-ref',
            title: 'Vocabulary: Phrasal Verbs [VR1.2]',
            subtitle: 'Review the list in VR1.2 on page 145',
            layout: 'split_50_50',
            // Bloque multimedia espurio o sugerido por error a partir de VR1.2
            referenceContent: {
              id: 'ref-fake-audio',
              type: 'media',
              title: 'VR1.2',
              mediaType: 'audio'
            },
            interaction: {
              id: 'int-doc',
              type: 'input_fields',
              instruction: 'Complete the sentences with the correct words.',
              verificationAudioUrl: '/audio/VR1_2.mp3', // Sintético / espurio sin directiva de escucha
              audioLabel: 'VR1.2',
              listItems: [
                { id: 'it-1', prompt: '1. She will {{blank}} after her brother.', expectedAnswer: 'look' }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawWithDocumentaryReference);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariante de Evidencia Física: Al no haber palabras de escucha ("Listen", "Track", etc.),
      // el audio sintético es erradicado por completo.
      expect(slide.interaction?.verificationAudioUrl).toBeUndefined();
      expect(slide.interaction?.audioLabel).toBeUndefined();
      expect(slide.referenceContent).toBeNull();
      expect(slide.layout).toBe('single_column');
    });

    it('b2) un audio de verificación legítimo acompañado de directiva explícita de escucha conserva verificationAudioUrl', () => {
      const rawWithRealAudio = JSON.stringify({
        slides: [
          {
            id: 'slide-real-audio',
            title: 'Grammar Practice',
            layout: 'single_column',
            interaction: {
              id: 'int-real-audio',
              type: 'input_fields',
              instruction: 'Complete the sentences. Then listen and check your answers. [CD1 Track 12]',
              listItems: [
                { id: 'it-1', prompt: '1. I {{blank}} a teacher.', expectedAnswer: 'am' }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawWithRealAudio);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.interaction?.verificationAudioUrl).toBeDefined();
      expect(slide.interaction?.verificationAudioUrl).toContain('Track_12.mp3');
    });
  });

  // =========================================================================
  // CASO X: Desambiguación Ontológica de Delimitadores Slash ('/') y Selección de Arquetipo
  // =========================================================================
  describe("Caso X: Desambiguación Ontológica de Delimitadores Slash ('/') y Selección de Arquetipo", () => {
    it("a) un reactivo con 3 sintagmas y verbo ancla bajo directiva de descarte se emite como 'selection' (disyunción / opciones alternativas)", () => {
      const rawSelectionJson = JSON.stringify({
        slides: [
          {
            id: 'slide-discrim-1',
            title: 'Vocabulary: Jobs & Collocations',
            subtitle: 'Cross out the word or phrase that does not go with the verb.',
            layout: 'single_column',
            isGraded: true,
            interaction: {
              id: 'int-discrim-1',
              type: 'input_fields',
              instruction: 'Cross out the incorrect option:',
              listItems: [
                {
                  id: 'it-1',
                  prompt: '1. work in a school / an office / a receptionist',
                  expectedAnswer: 'a receptionist',
                  acceptedAnswers: ['a receptionist']
                }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawSelectionJson);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Debe mapearse obligatoriamente como selection (quiz mode)
      expect(slide.interaction?.type).toBe('selection');
      const selection = slide.interaction as any;
      expect(selection.questions).toHaveLength(1);

      const q = selection.questions[0];
      // Segmento base ancla como prompt de la pregunta
      expect(q.prompt).toBe('work in');
      expect(q.options).toHaveLength(3);
      expect(q.options.map((o: any) => o.text)).toEqual(['a school', 'an office', 'a receptionist']);

      // La opción intrusa ("a receptionist") es la correcta para tachar
      const intruderOpt = q.options.find((o: any) => o.text === 'a receptionist');
      expect(intruderOpt?.isCorrect).toBe(true);

      const validOpt1 = q.options.find((o: any) => o.text === 'a school');
      expect(validOpt1?.isCorrect).toBe(false);

      const validOpt2 = q.options.find((o: any) => o.text === 'an office');
      expect(validOpt2?.isCorrect).toBe(false);
    });

    it("b) un reactivo con 8 tokens heterogéneos y signo '?' bajo directiva 'Make questions' se emite como 'input_fields' de línea completa resuelto por el Answer Key", () => {
      const rawScrambleJson = JSON.stringify({
        slides: [
          // Solucionario / Answer Key provisto
          {
            id: 'slide-key',
            title: 'Answer Key',
            subtitle: 'Exercise 1 Answers',
            referenceContent: {
              id: 'ref-key',
              type: 'text',
              content: '1 Have you been clubbing in the last month?'
            }
          },
          // Ejercicio interactivo de ordenamiento
          {
            id: 'slide-unscramble-1',
            title: 'Grammar: Question Formation',
            subtitle: 'Make questions using the prompts.',
            layout: 'single_column',
            isGraded: true,
            interaction: {
              id: 'int-unscramble-1',
              type: 'input_fields',
              instruction: 'Make questions using the prompts:',
              listItems: [
                {
                  id: 'it-1',
                  prompt: '1. been / in / the / you / last / clubbing / month / Have ?',
                  expectedAnswer: '',
                  acceptedAnswers: []
                }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawScrambleJson);
      // El solucionario se purga y queda solo el ejercicio interactivo
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Debe mantenerse obligatoriamente como input_fields (layoutMode: list)
      expect(slide.interaction?.type).toBe('input_fields');
      const inputFields = slide.interaction as any;
      expect(inputFields.layoutMode).toBe('list');
      expect(inputFields.listItems).toHaveLength(1);

      const item = inputFields.listItems[0];
      // Prompt mantiene la secuencia desordenada verbatim literal con slashes intactos
      expect(item.prompt).toBe('1. been / in / the / you / last / clubbing / month / Have ?');
      // No debe degradarse a selection ni inyectar {{blank}} rotos que descompongan los tokens
      expect(item.prompt).not.toContain('{{blank}}');
      expect(item.prompt).toContain('/');

      // expectedAnswer resuelto directamente por el Answer Key como la oración completa ordenada
      expect(item.expectedAnswer).toBe('Have you been clubbing in the last month?');
      expect(item.acceptedAnswers).toContain('Have you been clubbing in the last month?');
    });

    it("c) si un ejercicio de reconstrucción de oraciones fue emitido erróneamente como 'selection', se recupera como 'input_fields'", () => {
      const rawErroneousSelectionJson = JSON.stringify({
        slides: [
          {
            id: 'slide-recovered-1',
            title: 'Grammar: Word Order',
            subtitle: 'Put the words in the correct order to make questions.',
            layout: 'single_column',
            isGraded: true,
            interaction: {
              id: 'int-rec-1',
              type: 'selection',
              instruction: 'Put the words in order:',
              questions: [
                {
                  id: 'q-1',
                  prompt: 'you / where / born / were / ?',
                  expectedAnswer: 'Where were you born?',
                  options: [
                    { id: 'opt-1', text: 'you', isCorrect: false },
                    { id: 'opt-2', text: 'where', isCorrect: true }
                  ]
                }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawErroneousSelectionJson);
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.interaction?.type).toBe('input_fields');
      const inputFields = slide.interaction as any;
      expect(inputFields.listItems).toHaveLength(1);
      expect(inputFields.listItems[0].prompt).toBe('you / where / born / were / ?');
      expect(inputFields.listItems[0].expectedAnswer).toBe('Where were you born?');
    });
  });

  // =========================================================================
  // CASO D: Invariante de Aislamiento de la Consigna y Nodos Ancla Verbatim
  // =========================================================================
  describe('Caso D: Invariante de Aislamiento de la Consigna y Nodos Ancla Verbatim (Selection)', () => {
    describe('isolateCanonicalInstruction', () => {
      it('purga reactivos hijos contiguos con delimitadores slash concatenados tras dos puntos', () => {
        const raw = 'Cross out the incorrect option: 1. work in a school / an office / a receptionist';
        expect(isolateCanonicalInstruction(raw)).toBe('Cross out the incorrect option:');
      });

      it('purga reactivos hijos con slash tras oración de directiva canónica', () => {
        const raw = 'Cross out the incorrect option. 1. work in a school / an office / a receptionist';
        expect(isolateCanonicalInstruction(raw)).toBe('Cross out the incorrect option.');
      });

      it('purga listas numeradas concatenadas en la consigna directiva', () => {
        const raw = 'Complete the sentences: 1. She lives in Madrid. 2. He lives in Paris.';
        expect(isolateCanonicalInstruction(raw)).toBe('Complete the sentences:');
      });

      it('elimina strings que son puramente un reactivo hijo filtrado sin directiva rectora', () => {
        const raw = '1. work in a school / an office / a receptionist';
        expect(isolateCanonicalInstruction(raw)).toBe('');
      });

      it('preserva directivas canónicas legítimas sin modificarlas', () => {
        expect(isolateCanonicalInstruction('Put the verbs from 1 into the correct column.')).toBe(
          'Put the verbs from 1 into the correct column.'
        );
        expect(isolateCanonicalInstruction('Choose the correct words to complete the dialogue:')).toBe(
          'Choose the correct words to complete the dialogue:'
        );
        expect(isolateCanonicalInstruction('Which sentence best summarizes the article?')).toBe(
          'Which sentence best summarizes the article?'
        );
      });
    });

    describe('cleanSelectionPrompt', () => {
      it('remueve marcadores sintéticos [ ? ] y [?] de enunciados de selección', () => {
        expect(cleanSelectionPrompt('1. work in [ ? ]')).toBe('1. work in');
        expect(cleanSelectionPrompt('2. What time do you wake up? [?]')).toBe('2. What time do you wake up?');
      });

      it('neutraliza marcadores de hueco al final de nodos ancla o encabezados de opciones', () => {
        expect(cleanSelectionPrompt('1. work in: {{blank}}')).toBe('1. work in:');
        expect(cleanSelectionPrompt('work in {{blank}}')).toBe('work in');
        expect(cleanSelectionPrompt('2. have: [blank]')).toBe('2. have:');
        expect(cleanSelectionPrompt('3. earn _______')).toBe('3. earn');
      });
    });

    describe('validateAndParseSlides - Pipeline Integration', () => {
      it('purga automáticamente residuos de reactivos hijos en subtitle e interaction.instruction', () => {
        const rawJson = JSON.stringify({
          slides: [
            {
              id: 'slide-iso-1',
              title: 'Vocabulary: Jobs & Workplaces',
              subtitle: 'Cross out the incorrect option: 1. work in a school / an office / a receptionist',
              layout: 'single_column',
              interaction: {
                id: 'int-iso-1',
                type: 'selection',
                instruction: 'Cross out the incorrect option: 1. work in a school / an office / a receptionist',
                questions: [
                  {
                    id: 'q-1',
                    prompt: '1. work in: {{blank}}',
                    options: [
                      { id: 'opt-1', text: 'a school', isCorrect: false },
                      { id: 'opt-2', text: 'an office', isCorrect: false },
                      { id: 'opt-3', text: 'a receptionist', isCorrect: true }
                    ]
                  }
                ]
              }
            }
          ]
        });

        const slides = validateAndParseSlides(rawJson);
        expect(slides).toHaveLength(1);
        const slide = slides[0];

        // Directiva canónica aislada en subtitle e instruction
        expect(slide.subtitle).toBe('Cross out the incorrect option:');
        expect(slide.interaction?.instruction).toBe('Cross out the incorrect option:');

        // Nodo ancla limpio sin marcador de hueco
        const sel = slide.interaction as any;
        expect(sel.questions[0].prompt).toBe('1. work in:');
      });
    });
  });

  // =========================================================================
  // CASO E: Integridad Textual, Marcadores de Posición en referenceContent y Ejemplos Resueltos
  // =========================================================================
  describe('Caso E: Integridad Textual, Marcadores de Posición y Ejemplos Resueltos', () => {
    describe('1. Preservación de Marcadores de Posición en referenceContent', () => {
      it('canonicaliza superscripts, números entre corchetes y anclas de inserción a formato visible "[ 1 ]", "[ 2 ]"', () => {
        const inputWithSuperscripts = 'Paragraph 1¹ has info. Paragraph 2² has more. Paragraph 3³ concludes.';
        const result1 = canonicalizeReferencePositionMarkers(inputWithSuperscripts);
        expect(result1).toContain('[ 1 ]');
        expect(result1).toContain('[ 2 ]');
        expect(result1).toContain('[ 3 ]');

        const inputWithBrackets = 'First section [1] and second section [ 2 ] and third [  3  ].';
        const result2 = canonicalizeReferencePositionMarkers(inputWithBrackets);
        expect(result2).toContain('[ 1 ]');
        expect(result2).toContain('[ 2 ]');
        expect(result2).toContain('[ 3 ]');

        const inputWithCircled = 'Step ① is crucial. Step ② follows.';
        const result3 = canonicalizeReferencePositionMarkers(inputWithCircled);
        expect(result3).toContain('[ 1 ]');
        expect(result3).toContain('[ 2 ]');

        const inputParagraphAnchors = '(1) In recent years, researchers discovered...\n\n(2) Furthermore, another aspect...';
        const result4 = canonicalizeReferencePositionMarkers(inputParagraphAnchors);
        expect(result4).toContain('[ 1 ] In recent years');
        expect(result4).toContain('[ 2 ] Furthermore');
      });

      it('prohíbe purgar anclas de inserción en el cuerpo de lectura de referenceContent en validateAndParseSlides', () => {
        const rawJson = JSON.stringify({
          slides: [
            {
              id: 'slide-reading-anchors',
              title: 'Reading: Technology and Daily Life',
              subtitle: 'Read the article and write a question from 2 in the correct places 1–5.',
              layout: 'split_50_50',
              referenceContent: {
                id: 'ref-article-1',
                type: 'text',
                category: 'reading',
                title: 'The Future of AI',
                content: '[ 1 ] Many people wonder about the future of artificial intelligence in education.\n\n[ 2 ] Scientists are now developing conversational tutors that adapt to each student.\n\n[ 3 ] However, ethical considerations remain paramount for educators worldwide.\n\n[ 4 ] Finally, collaborative classrooms are blending digital tools with human guidance.\n\n[ 5 ] What do you think about this revolution?',
                body: '[ 1 ] Many people wonder about the future of artificial intelligence in education.\n\n[ 2 ] Scientists are now developing conversational tutors that adapt to each student.\n\n[ 3 ] However, ethical considerations remain paramount for educators worldwide.\n\n[ 4 ] Finally, collaborative classrooms are blending digital tools with human guidance.\n\n[ 5 ] What do you think about this revolution?'
              },
              interaction: {
                id: 'int-q-match',
                type: 'input_fields',
                instruction: 'Write the matching question in places 1–5:',
                listItems: [
                  { id: 'item-1', prompt: '1.', expectedAnswer: 'How does AI affect students?', isExample: false },
                  { id: 'item-2', prompt: '2.', expectedAnswer: 'Who is developing the tutors?', isExample: false }
                ]
              }
            }
          ]
        });

        const slides = validateAndParseSlides(rawJson);
        expect(slides).toHaveLength(1);
        const ref = slides[0].referenceContent as any;
        expect(ref).not.toBeNull();
        expect(ref.type).toBe('text');
        expect(ref.content).toContain('[ 1 ]');
        expect(ref.content).toContain('[ 2 ]');
        expect(ref.content).toContain('[ 3 ]');
        expect(ref.content).toContain('[ 4 ]');
        expect(ref.content).toContain('[ 5 ]');
      });
    });

    describe('2. Ajuste de isolateCanonicalInstruction para Rangos Numéricos', () => {
      it('preserva la consigna completa ante rangos numéricos con en-dash (1–5) sin truncamientos ni colon espurio', () => {
        const directive = 'Read the article and write a question from 2 in the correct places 1–5.';
        const clean = isolateCanonicalInstruction(directive);
        expect(clean).toBe('Read the article and write a question from 2 in the correct places 1–5.');
      });

      it('preserva la consigna completa ante rangos numéricos con guion corto regular (1-5)', () => {
        const directive = 'Read the article and write a question from 2 in the correct places 1-5.';
        const clean = isolateCanonicalInstruction(directive);
        expect(clean).toBe('Read the article and write a question from 2 in the correct places 1-5.');
      });

      it('preserva rangos con "to" y rangos de letras (1 to 5, A–D)', () => {
        const directive = 'Match the headings 1 to 5 with paragraphs A–D.';
        const clean = isolateCanonicalInstruction(directive);
        expect(clean).toBe('Match the headings 1 to 5 with paragraphs A–D.');
      });

      it('aísla limpiamente la consigna con rango cuando contiene fuga posterior con dos puntos e ítems hijos', () => {
        const directiveWithLeak = 'Complete the sentences 1–5 with words from the box: 1. She is an engineer / doctor / nurse';
        const clean = isolateCanonicalInstruction(directiveWithLeak);
        expect(clean).toBe('Complete the sentences 1–5 with words from the box:');
      });
    });

    describe('3. Normalización de Ejemplos Resueltos en input_fields (isExample: true)', () => {
      it('normaliza prompt a ordinal canónico y expectedAnswer a estructura completa resuelta sin truncar sintagmas', () => {
        const rawJson = JSON.stringify({
          slides: [
            {
              id: 'slide-ex-1',
              title: 'Grammar: Question Formation',
              subtitle: 'Write complete questions for each situation.',
              layout: 'single_column',
              referenceContent: null,
              interaction: {
                id: 'int-questions',
                type: 'input_fields',
                instruction: 'Write the complete questions:',
                listItems: [
                  {
                    id: 'it-1',
                    prompt: '1. Where do you live?',
                    expectedAnswer: 'Where do you live?',
                    isExample: true
                  },
                  {
                    id: 'it-2',
                    prompt: '2. What / your name / ?',
                    expectedAnswer: 'What is your name?',
                    isExample: false
                  }
                ]
              }
            }
          ]
        });

        const slides = validateAndParseSlides(rawJson);
        expect(slides).toHaveLength(1);
        const items = (slides[0].interaction as any).listItems;

        // El reactivo de ejemplo debe tener como prompt únicamente el ordinal canónico ('1.')
        expect(items[0].isExample).toBe(true);
        expect(items[0].prompt).toBe('1.');
        expect(items[0].expectedAnswer).toBe('Where do you live?');

        // El ítem no-ejemplo mantiene su prompt para interactuar
        expect(items[1].isExample).toBe(false);
        expect(items[1].prompt).toBe('2. What / your name / ?');
        expect(items[1].expectedAnswer).toBe('What is your name?');
      });

      it('evita desacoplar tokens del wordBank en reactivos con isExample: true preservando la respuesta modelo intacta', () => {
        const rawJson = JSON.stringify({
          slides: [
            {
              id: 'slide-wb-ex',
              title: 'Phrasal Verbs with Word Bank',
              subtitle: 'Complete the sentences with verbs from the box.',
              layout: 'single_column',
              referenceContent: null,
              interaction: {
                id: 'int-phrasal',
                type: 'input_fields',
                instruction: 'Complete the sentences:',
                wordBank: ['tidy', 'look', 'switch', 'wake'],
                listItems: [
                  {
                    id: 'it-1',
                    prompt: '1.',
                    expectedAnswer: 'tidy up',
                    isExample: true
                  },
                  {
                    id: 'it-2',
                    prompt: '2. Can you please {{blank}} after the cat?',
                    expectedAnswer: 'look after',
                    isExample: false
                  }
                ]
              }
            }
          ]
        });

        const slides = validateAndParseSlides(rawJson);
        const items = (slides[0].interaction as any).listItems;

        // El ejemplo NO fue truncado a solo "tidy"
        expect(items[0].isExample).toBe(true);
        expect(items[0].prompt).toBe('1.');
        expect(items[0].expectedAnswer).toBe('tidy up');

        // El reactivo interactivo sí desacopló el token correspondiente del banco
        expect(items[1].isExample).toBe(false);
        expect(items[1].expectedAnswer).toBe('look');
        expect(items[1].prompt).toContain('after');
      });
    });
  });

  // =========================================================================
  // CASO F: Refactorización Agnóstica para Categorización y Buckets
  // =========================================================================
  describe('Caso F: Refactorización Agnóstica para Categorización y Emparejamiento por Grupos (Buckets)', () => {
    describe('1. Detección y Extracción Estructural de Categorías Receptores (extractCategoryBucketsFromText)', () => {
      it('detecta encabezados secuenciales delimitados por letras y mapea id, label y items vacíos', () => {
        const raw = 'A Talking about a hobby B Talking about work C Talking about family';
        const buckets = extractCategoryBucketsFromText(raw);

        expect(buckets).toHaveLength(3);
        expect(buckets[0]).toEqual({
          id: 'A',
          label: 'A · Talking about a hobby',
          items: [],
          headerStart: expect.any(Number),
        });
        expect(buckets[1]).toEqual({
          id: 'B',
          label: 'B · Talking about work',
          items: [],
          headerStart: expect.any(Number),
        });
        expect(buckets[2]).toEqual({
          id: 'C',
          label: 'C · Talking about family',
          items: [],
          headerStart: expect.any(Number),
        });
      });

      it('detecta encabezados numéricos y viñetas con puntuaciones (. o ) o :)', () => {
        const raw = '1. Things at school 2. Things at home 3. Things outdoors';
        const buckets = extractCategoryBucketsFromText(raw);

        expect(buckets).toHaveLength(3);
        expect(buckets[0].id).toBe('1');
        expect(buckets[0].label).toBe('1 · Things at school');
        expect(buckets[1].id).toBe('2');
        expect(buckets[1].label).toBe('2 · Things at home');
        expect(buckets[2].id).toBe('3');
        expect(buckets[2].label).toBe('3 · Things outdoors');
      });

      it('prohíbe que el texto explicativo de las categorías sea concatenado en instruction o prompt', () => {
        const rawInstruction = 'Match the sentences to categories A–C: A Talking about a hobby B Talking about work C Talking about family';
        const isolated = isolateCanonicalInstruction(rawInstruction);

        expect(isolated).toBe('Match the sentences to categories A–C.');
        expect(isolated).not.toContain('Talking about a hobby');
        expect(isolated).not.toContain('Talking about work');
        expect(isolated).not.toContain('Talking about family');
      });
    });

    describe('2. Poda Canónica de la Consigna en isolateCanonicalInstruction', () => {
      it('poda la declaración de categorías incrustada en la consigna dejando únicamente la directiva principal', () => {
        const directiveWithCategories =
          'Match the sentences to categories A–C. A is talking about a hobby B is talking about work C is talking about family';
        const clean = isolateCanonicalInstruction(directiveWithCategories);

        expect(clean).toBe('Match the sentences to categories A–C.');
      });

      it('mantiene la integridad de rangos alfanuméricos protegidos (A–C, 1–5, A to C)', () => {
        const withRanges =
          'Match sentences 1–5 to categories A–C: A Things you do every day: 1 B Things you do at the weekend C Things you do on holiday';
        const clean = isolateCanonicalInstruction(withRanges);

        expect(clean).toBe('Match sentences 1–5 to categories A–C.');
      });

      it('devuelve cadena vacía si el string contiene únicamente definiciones de categorías sin directiva principal', () => {
        const pureCategories = 'A Talking about a hobby B Talking about work C Talking about family';
        const clean = isolateCanonicalInstruction(pureCategories);

        expect(clean).toBe('');
      });

      it('purga escalas semánticas o leyendas auxiliares con secuencias ordinales (e.g. 1. I love it. 2. I like it...)', () => {
        const withScale =
          'Match the sentences in 1a) to the categories A–C. 1. I love it. 2. I like it. 3. It\'s okay. 4. I don\'t like it. 5. I hate it.';
        const clean = isolateCanonicalInstruction(withScale);

        expect(clean).toBe('Match the sentences in 1a) to the categories A–C.');
      });

      it('purga leyendas con dos puntos o equivalencias antes de la escala ordinal', () => {
        const withColonScale =
          'Match the sentences in 1a) to the categories A–C: 1 = I love it. 2 = I like it. 3 = I hate it.';
        const clean = isolateCanonicalInstruction(withColonScale);

        expect(clean).toBe('Match the sentences in 1a) to the categories A–C.');
      });
    });

    describe('3. Asignación de Ejemplos Pre-resueltos en Contenedores', () => {
      it('identifica ítem del corpus por marcador ordinal y lo inserta en el contenedor meta con isExample: true', () => {
        const categoryText =
          'A Things you do every day: 1 B Things you do at the weekend C Things you do on holiday';
        const corpus = [
          '1. I love playing tennis in my free time.',
          '2. She is an accountant in a bank.',
          '3. We go on vacation every summer.'
        ];

        const buckets = extractCategoryBucketsFromText(categoryText, corpus);

        expect(buckets).toHaveLength(3);
        // Bucket A recibió el ejemplo pre-resuelto
        expect(buckets[0].id).toBe('A');
        expect(buckets[0].items).toHaveLength(1);
        expect(buckets[0].items[0]).toEqual({
          id: '1',
          text: 'I love playing tennis in my free time.',
          correctBucketId: 'A',
          isExample: true,
        });

        // Buckets B y C no tienen ejemplos
        expect(buckets[1].items).toHaveLength(0);
        expect(buckets[2].items).toHaveLength(0);

        // Fichas por ubicar (excluye el ítem 1 resuelto como ejemplo)
        const unassigned = (buckets as any).unassignedItems;
        expect(unassigned).toBeDefined();
        expect(unassigned).toHaveLength(2);
        expect(unassigned.map((it: any) => it.id)).toEqual(['2', '3']);
      });

      it('soporta marcadores de ejemplo alternativos como "(example: 1)" o "example"', () => {
        const categoryText = 'A Things you do (example: 1) B Things you make C Things you buy';
        const corpus = [
          { id: '1', text: 'Clean the kitchen' },
          { id: '2', text: 'A wooden chair' },
          { id: '3', text: 'Groceries' }
        ];

        const buckets = extractCategoryBucketsFromText(categoryText, corpus);
        expect(buckets[0].items).toHaveLength(1);
        expect(buckets[0].items[0].isExample).toBe(true);
        expect(buckets[0].items[0].text).toBe('Clean the kitchen');
      });
    });

    describe('4. Normalización Tipográfica (Preservación de Sentence Case)', () => {
      it('convierte mayúsculas sostenidas a sentence case y preserva títulos ya en sentence case', () => {
        expect(toSentenceCase('TALKING ABOUT WORK')).toBe('Talking about work');
        expect(toSentenceCase('A · TALKING ABOUT A HOBBY')).toBe('A · Talking about a hobby');
        expect(toSentenceCase('Talking about a hobby')).toBe('Talking about a hobby');
        expect(toSentenceCase('A · Talking about a hobby')).toBe('A · Talking about a hobby');
        expect(toSentenceCase('play')).toBe('play');
      });
    });

    describe('5. Integración en Pipeline validateAndParseSlides', () => {
      it('normaliza un slide buckets_matching: poda consigna, asigna ejemplo a contenedor meta y normaliza tipografía', () => {
        const rawJson = JSON.stringify({
          slides: [
            {
              id: 'slide-buckets-agnostic',
              title: 'Activity 3: Categorization',
              subtitle: 'Match the sentences to categories A–C: A TALKING ABOUT WORK: 1 B TALKING ABOUT HOBBIES C TALKING ABOUT FAMILY',
              layout: 'single_column',
              referenceContent: null,
              interaction: {
                id: 'int-buckets-1',
                type: 'buckets_matching',
                instruction: 'Match the sentences to categories A–C: A TALKING ABOUT WORK: 1 B TALKING ABOUT HOBBIES C TALKING ABOUT FAMILY',
                buckets: [
                  { id: 'A', label: 'TALKING ABOUT WORK' },
                  { id: 'B', label: 'TALKING ABOUT HOBBIES' },
                  { id: 'C', label: 'TALKING ABOUT FAMILY' }
                ],
                tokens: [
                  { id: 'tok-1', text: '1. I work in an international office.', correctBucketId: 'A' },
                  { id: 'tok-2', text: '2. I play the guitar on Saturdays.', correctBucketId: 'B' },
                  { id: 'tok-3', text: '3. I live with my parents and sister.', correctBucketId: 'C' }
                ]
              }
            }
          ]
        });

        const slides = validateAndParseSlides(rawJson);
        expect(slides).toHaveLength(1);

        const slide = slides[0];
        // 1. Poda de consigna
        expect(slide.subtitle).toBe('Match the sentences to categories A–C.');
        expect(slide.interaction?.instruction).toBe('Match the sentences to categories A–C.');

        // 2. Normalización de buckets a sentence case sin mayúsculas sostenidas
        const it = slide.interaction as any;
        expect(it.buckets[0].label).toBe('Talking about work');
        expect(it.buckets[1].label).toBe('Talking about hobbies');
        expect(it.buckets[2].label).toBe('Talking about family');

        // 3. Asignación de ejemplo pre-resuelto en contenedor A
        expect(it.buckets[0].items).toHaveLength(1);
        expect(it.buckets[0].items[0].isExample).toBe(true);
        expect(it.buckets[0].items[0].id).toBe('tok-1');

        // 4. Descuento determinístico del ejemplo: el banco interactivo contiene únicamente los ítems no ejemplo
        expect(it.tokens).toHaveLength(2);
        expect(it.tokens.map((t: any) => t.id)).toEqual(['tok-2', 'tok-3']);
        expect(it.tokens[0].isExample).toBeUndefined();
        expect(it.tokens[1].isExample).toBeUndefined();
      });
    });

    describe('5. Hidratación Determinística de Buckets y Ensamblado de Referencias Cruzadas (Zero-LLM Synthesis)', () => {
      it('1. Hidratación Determinística de Targets: reemplaza etiquetas cortas (A, B) por descriptores del texto', () => {
        const rawSlide: any = {
          id: 'slide-target-hydration',
          title: 'Classification Exercise',
          subtitle: 'Put the words into categories: A FOOD AND DRINK B CLOTHES',
          interaction: {
            id: 'int-buckets-hyd',
            type: 'buckets_matching',
            instruction: 'Put the words into categories: A FOOD AND DRINK B CLOTHES',
            targets: [
              { id: 'A', label: 'A', items: [] },
              { id: 'B', label: 'B', items: [] },
            ],
            tokens: [
              { id: 'tok-1', text: 'Apple', correctBucketId: 'A' },
              { id: 'tok-2', text: 'Jacket', correctBucketId: 'B' },
            ],
          },
        };

        normalizeBucketsMatchingInteraction(rawSlide);

        expect(rawSlide.interaction.buckets).toHaveLength(2);
        expect(rawSlide.interaction.buckets[0].id).toBe('bucket-A');
        expect(rawSlide.interaction.buckets[0].label).toBe('A · Food and drink');
        expect(rawSlide.interaction.buckets[1].id).toBe('bucket-B');
        expect(rawSlide.interaction.buckets[1].label).toBe('B · Clothes');
        expect(rawSlide.interaction.targetSlots[0].id).toBe('bucket-A');
        expect(rawSlide.interaction.targetSlots[0].label).toBe('A · Food and drink');
        expect(rawSlide.interaction.targets[0].id).toBe('bucket-A');
        expect(rawSlide.interaction.targets[0].label).toBe('A · Food and drink');
      });

      it('2. Ensamblado Programático de Reactivos por Referencia Cruzada (Zero-LLM Synthesis)', () => {
        const previousSlide: any = {
          id: 'slide-prev-matching',
          title: 'Exercise 2a: Matching halves',
          subtitle: 'Match the sentence halves 1-4 with A-D',
          layout: 'single_column',
          isGraded: true,
          referenceContent: null,
          interaction: {
            id: 'int-prev-input',
            type: 'input_fields',
            instruction: 'Match sentence halves',
            layoutMode: 'list',
            listItems: [
              { id: 'li-1', prompt: '1. I always go to work', expectedAnswer: 'by train every morning.', acceptedAnswers: [] },
              { id: 'li-2', prompt: '2. She enjoys eating', expectedAnswer: 'fresh fruit and yogurt.', acceptedAnswers: [] },
              { id: 'li-3', prompt: '3. They never watch TV', expectedAnswer: 'during weekdays.', acceptedAnswers: [] },
            ],
          },
        };

        const extracted = extractTwoPartItemsFromSlide(previousSlide);
        expect(extracted).toHaveLength(3);
        expect(extracted[0].prompt).toBe('1. I always go to work');
        expect(extracted[0].expectedAnswer).toBe('by train every morning.');

        const rawSlide: any = {
          id: 'slide-meta-categorization',
          title: 'Exercise 2b: Categorization',
          subtitle: 'Look at the phrases in Exercise 2a. Put them into categories A–B: A ROUTINES B DIET',
          interaction: {
            id: 'int-meta-buckets',
            type: 'buckets_matching',
            instruction: 'Use the phrases in 2a. Put them into categories.',
            buckets: [
              { id: 'A', label: 'A', items: [] },
              { id: 'B', label: 'B', items: [] },
            ],
            // The LLM complies with Zero-LLM directive and emits numeric index references
            tokens: [
              { id: '1', text: '1', correctBucketId: 'A' },
              { id: '2', text: '2', correctBucketId: 'B' },
              { id: '3', text: '3', correctBucketId: 'A' },
            ],
          },
        };

        normalizeBucketsMatchingInteraction(rawSlide, undefined, previousSlide);

        // Verify programmatic synthesis: tokenText = `${cleanP} ${cleanA}`.replace(/\s+/g, ' ');
        // P and A segments are sanitized removing leading numbers/letters, ordered strictly P + A
        expect(rawSlide.interaction.tokens[0].text).toBe('I always go to work by train every morning.');
        expect(rawSlide.interaction.tokens[1].text).toBe('She enjoys eating fresh fruit and yogurt.');
        expect(rawSlide.interaction.tokens[2].text).toBe('They never watch TV during weekdays.');

        // Verify target hydration preserving category prefixes
        expect(rawSlide.interaction.buckets[0].id).toBe('bucket-A');
        expect(rawSlide.interaction.buckets[0].label).toBe('A · Routines');
        expect(rawSlide.interaction.buckets[1].id).toBe('bucket-B');
        expect(rawSlide.interaction.buckets[1].label).toBe('B · Diet');
      });

      it('3. Descuento Determinístico de Ejemplos en Buckets', () => {
        const rawSlide: any = {
          id: 'slide-example-discount',
          title: 'Activity 4: Classification',
          subtitle: 'Classify items: A ANIMALS (e.g. 1) B PLANTS',
          interaction: {
            id: 'int-buckets-ex',
            type: 'buckets_matching',
            instruction: 'Classify items',
            buckets: [
              { id: 'A', label: 'A ANIMALS' },
              { id: 'B', label: 'B PLANTS' },
            ],
            tokens: [
              { id: 'tok-1', text: '1. Elephant', correctBucketId: 'A' },
              { id: 'tok-2', text: '2. Oak tree', correctBucketId: 'B' },
              { id: 'tok-3', text: '3. Giraffe', correctBucketId: 'A' },
            ],
          },
        };

        normalizeBucketsMatchingInteraction(rawSlide);

        // The example item (tok-1) is moved to bucket A items with isExample: true
        expect(rawSlide.interaction.buckets[0].items).toHaveLength(1);
        expect(rawSlide.interaction.buckets[0].items[0].id).toBe('tok-1');
        expect(rawSlide.interaction.buckets[0].items[0].isExample).toBe(true);

        // The interactive bank contains exclusively non-example tokens
        expect(rawSlide.interaction.tokens).toHaveLength(2);
        expect(rawSlide.interaction.tokens.map((t: any) => t.id)).toEqual(['tok-2', 'tok-3']);
        expect(rawSlide.interaction.sourceItems.map((s: any) => s.id)).toEqual(['tok-2', 'tok-3']);
      });

      it('4. Contrato Estricto de Layout para buckets_matching (100% viewport, single_column, sin paneles laterales)', () => {
        const rawSlideWithSidePanel: any = {
          id: 'slide-bucket-layout',
          title: 'Exercise 5: Buckets Layout Test',
          subtitle: 'Put the verbs into the correct column: A REGULAR B IRREGULAR',
          contextBody: 'Long explanatory grammatical reference note that would normally trigger split_50_50',
          referenceContent: {
            id: 'ref-aux-1',
            type: 'text',
            category: 'grammar_note',
            title: 'Collateral Reference Note',
            content: 'Regular verbs form past with -ed while irregular verbs change root vowel.',
          },
          layout: 'split_50_50',
          interaction: {
            id: 'int-bucket-col',
            type: 'buckets_matching',
            instruction: 'Classify verbs',
            buckets: [
              { id: 'A', label: 'Regular' },
              { id: 'B', label: 'Irregular' },
            ],
            tokens: [
              { id: 'tok-1', text: 'walked', correctBucketId: 'A' },
              { id: 'tok-2', text: 'ran', correctBucketId: 'B' },
            ],
          },
        };

        // Test in normalizeBucketsMatchingInteraction
        normalizeBucketsMatchingInteraction(rawSlideWithSidePanel);
        expect(rawSlideWithSidePanel.layout).toBe('single_column');
        expect(rawSlideWithSidePanel.referenceContent).toBeNull();
        expect(rawSlideWithSidePanel.contextBody).toBeUndefined();

        // Test through validateAndParseSlides pipeline
        const parsedSlides = validateAndParseSlides(
          JSON.stringify({
            slides: [
              {
                id: 'slide-pipeline-bucket',
                title: 'Exercise 5b: Classification',
                subtitle: 'A FOOD B SPORTS',
                contextBody: 'Autonomous note text from OCR or model',
                layout: 'split_50_50',
                interaction: {
                  type: 'buckets_matching',
                  instruction: 'Drag items',
                  buckets: [
                    { id: 'A', label: 'A FOOD' },
                    { id: 'B', label: 'B SPORTS' },
                  ],
                  tokens: [
                    { id: 'tok-1', text: 'Pizza', correctBucketId: 'A' },
                    { id: 'tok-2', text: 'Tennis', correctBucketId: 'B' },
                  ],
                },
              },
            ],
          })
        );

        expect(parsedSlides).toHaveLength(1);
        expect(parsedSlides[0].layout).toBe('single_column');
        expect(parsedSlides[0].referenceContent).toBeNull();
      });

      it('5. Invariante Universal de Ensamble Sintáctico (Concatenación P + A agnóstica sin inversión)', () => {
        // Test assembleTwoPartToken directly
        expect(assembleTwoPartToken('1. take', 'b. notes')).toBe('take notes');
        expect(assembleTwoPartToken('2) make', 'c) a decision')).toBe('make a decision');
        expect(assembleTwoPartToken('A - do', '1: homework')).toBe('do homework');
        expect(assembleTwoPartToken('clean prompt', 'clean answer')).toBe('clean prompt clean answer');
        expect(assembleTwoPartToken('10: go', 'f) home')).toBe('go home');

        // Algorithmic agnostic polarity detection tests
        // 1. Terminal punctuation on part 1, capital on part 2: detects part 2 is P and part 1 is A
        expect(assembleTwoPartToken('b. notes.', '1. Take')).toBe('Take notes.');
        expect(assembleTwoPartToken('1. Take', 'b. notes.')).toBe('Take notes.');
        // 2. Both parts having punctuation: ensures single final period and strips intermediate punctuation
        expect(assembleTwoPartToken('1. Take.', 'b. notes.')).toBe('Take notes.');
        // 3. Mid-dot / punto medio on terminal segment
        expect(assembleTwoPartToken('at 7:00 ·', 'I usually get up')).toBe('I usually get up at 7:00.');
        expect(assembleTwoPartToken('I usually get up', 'at 7:00 ·')).toBe('I usually get up at 7:00.');
        // 4. Question marks
        expect(assembleTwoPartToken('at 7:00?', 'Do you get up')).toBe('Do you get up at 7:00?');

        // Test with synthesis between matching previous slide and buckets slide
        const prevSlide: any = {
          id: 'prev-collocations',
          title: 'Exercise 1: Match verbs with phrases',
          subtitle: 'Match 1-4 with a-d',
          interaction: {
            type: 'input_fields',
            instruction: 'Match verbs and phrases',
            listItems: [
              { id: '1', prompt: '1. do', expectedAnswer: 'c. your best' },
              { id: '2', prompt: '2. make', expectedAnswer: 'a. friends' },
              { id: '3', prompt: '3. have', expectedAnswer: 'b. a good time' },
              { id: '4', prompt: '4. take', expectedAnswer: 'd. photos' },
            ],
          },
        };

        const currentSlide: any = {
          id: 'curr-buckets',
          title: 'Exercise 2: Categorization',
          subtitle: 'Use the phrases from Exercise 1. Put them in categories A–B: A SOCIAL B EFFORT',
          interaction: {
            type: 'buckets_matching',
            instruction: 'Sort into categories',
            buckets: [
              { id: 'A', label: 'Social' },
              { id: 'B', label: 'Effort' },
            ],
            tokens: [
              { id: '1', text: '1', correctBucketId: 'B' },
              { id: '2', text: '2', correctBucketId: 'A' },
              { id: '3', text: '3', correctBucketId: 'A' },
              { id: '4', text: '4', correctBucketId: 'A' },
            ],
          },
        };

        normalizeBucketsMatchingInteraction(currentSlide, undefined, prevSlide);

        // Strict deterministic P + A assembly
        expect(currentSlide.interaction.tokens[0].text).toBe('do your best');
        expect(currentSlide.interaction.tokens[1].text).toBe('make friends');
        expect(currentSlide.interaction.tokens[2].text).toBe('have a good time');
        expect(currentSlide.interaction.tokens[3].text).toBe('take photos');
      });

      it('6. Asignación Estructural de Muestras con descriptor ordinal k (_exampleMarker)', () => {
        const rawSlide: any = {
          id: 'slide-example-k',
          title: 'Exercise 6: Category assignment with example k=2',
          subtitle: 'Sort the items: A WORK B LEISURE (e.g. 2)',
          interaction: {
            type: 'buckets_matching',
            instruction: 'Sort items into buckets',
            buckets: [
              { id: 'A', label: 'WORK' },
              { id: 'B', label: 'LEISURE', _exampleMarker: '2' },
            ],
            tokens: [
              { id: 'tok-1', text: 'Write report', correctBucketId: 'A' },
              { id: 'tok-2', text: 'Play video games', correctBucketId: 'B' },
              { id: 'tok-3', text: 'Attend meeting', correctBucketId: 'A' },
            ],
          },
        };

        normalizeBucketsMatchingInteraction(rawSlide);

        // The 2nd element ('tok-2' / k=2) must be deterministically moved to bucket B items with isExample: true
        const bucketB = rawSlide.interaction.buckets.find((b: any) => b.id === 'B');
        expect(bucketB.items).toHaveLength(1);
        expect(bucketB.items[0].id).toBe('tok-2');
        expect(bucketB.items[0].text).toBe('Play video games');
        expect(bucketB.items[0].isExample).toBe(true);

        // Excluded from interactive draggable tokens and sourceItems
        expect(rawSlide.interaction.tokens).toHaveLength(2);
        expect(rawSlide.interaction.tokens.map((t: any) => t.id)).toEqual(['tok-1', 'tok-3']);
        expect(rawSlide.interaction.sourceItems.map((s: any) => s.id)).toEqual(['tok-1', 'tok-3']);
      });

      it('7. extractTwoPartItemsFromSlide normaliza la polaridad para que el prompt siempre preceda a la respuesta', () => {
        const slideWithInvertedPolarity: any = {
          id: 'slide-inv',
          interaction: {
            type: 'input_fields',
            listItems: [
              // Notice: prompt ends with period, expectedAnswer starts with uppercase and no punctuation
              { id: 'item-1', prompt: 'in the city center.', expectedAnswer: 'She lives' },
              // Normal item
              { id: 'item-2', prompt: 'They are studying', expectedAnswer: 'for an exam.' },
            ],
          },
        };

        const extracted = extractTwoPartItemsFromSlide(slideWithInvertedPolarity);
        expect(extracted).toHaveLength(2);
        // item-1 was swapped so prompt is the head (P) and expectedAnswer is the tail (A)
        expect(extracted[0].prompt).toBe('She lives');
        expect(extracted[0].expectedAnswer).toBe('in the city center.');
        // item-2 was already in correct polarity
        expect(extracted[1].prompt).toBe('They are studying');
        expect(extracted[1].expectedAnswer).toBe('for an exam.');
      });

      it('8. buildExtractionPrompt instruye la transcripción mandatoria de etiquetas de buckets', () => {
        const prompt = buildExtractionPrompt(1);
        expect(prompt).toContain('TRANSCRIPCIÓN MANDATORIA DE ETIQUETAS DE BUCKETS');
        expect(prompt).toContain("el campo 'label' DEBE transcribir textualmente la descripción de la categoría visible en el recorte");
        expect(prompt).toContain("quedando estrictamente prohibido emitir únicamente la letra o número ('A', 'B', '1')");
      });

      it('9. normalizeBucketsMatchingInteraction hidrata targetSlots y targets con { ...item, isExample: true }', () => {
        const rawSlide: any = {
          id: 'slide-slots-sync',
          interaction: {
            type: 'buckets_matching',
            instruction: 'Sort items into categories',
            buckets: [
              { id: 'slot-1', label: 'Category 1', _exampleMarker: '1' },
              { id: 'slot-2', label: 'Category 2' },
            ],
            targetSlots: [
              { id: 'slot-1', label: 'Category 1' },
              { id: 'slot-2', label: 'Category 2' },
            ],
            tokens: [
              { id: 'tok-1', text: '1. First Example', correctBucketId: 'slot-1', customProp: 'preserve-me' },
              { id: 'tok-2', text: '2. Second Regular', correctBucketId: 'slot-2' },
            ],
          },
        };

        normalizeBucketsMatchingInteraction(rawSlide);

        // Buckets and targetSlots both have the example item with isExample: true and preserved properties
        expect(rawSlide.interaction.buckets[0].items).toHaveLength(1);
        expect(rawSlide.interaction.buckets[0].items[0]).toMatchObject({
          id: 'tok-1',
          text: '1. First Example',
          isExample: true,
          correctBucketId: 'slot-1',
          customProp: 'preserve-me',
        });
        expect(rawSlide.interaction.targetSlots[0].items).toHaveLength(1);
        expect(rawSlide.interaction.targetSlots[0].items[0].isExample).toBe(true);

        // Tokens only retain non-example items
        expect(rawSlide.interaction.tokens).toHaveLength(1);
        expect(rawSlide.interaction.tokens[0].id).toBe('tok-2');
      });

      it('10. garantiza que el reactivo N acceda correctamente a previousItems[N - 1] sin caer en fallback de índice numérico en crudo', () => {
        const prevSlideWith8Items: any = {
          id: 'prev-matching-8',
          interaction: {
            type: 'input_fields',
            listItems: [
              { id: '1', prompt: '1. do', expectedAnswer: 'homework.' },
              { id: '2', prompt: '2. make', expectedAnswer: 'a mistake.' },
              { id: '3', prompt: '3. have', expectedAnswer: 'lunch.' },
              { id: '4', prompt: '4. take', expectedAnswer: 'a bus.' },
              { id: '5', prompt: '5. go', expectedAnswer: 'home.' },
              { id: '6', prompt: '6. play', expectedAnswer: 'tennis.' },
              { id: '7', prompt: '7. read', expectedAnswer: 'a book.' },
              { id: '8', prompt: '8. watch', expectedAnswer: 'a film.' },
            ],
          },
        };

        const bucketsSlide: any = {
          id: 'slide-buckets-8',
          subtitle: 'Use the phrases from exercise 1. Put them in categories A–B',
          interaction: {
            type: 'buckets_matching',
            instruction: 'Categorize phrases',
            buckets: [
              { id: 'A', label: 'Activity' },
              { id: 'B', label: 'Rest' },
            ],
            // Notice: token 8 is the last item (N = 8)
            tokens: [
              { id: 'tok-1', text: '1', correctBucketId: 'A' },
              { id: 'tok-8', text: '8', correctBucketId: 'B' },
            ],
          },
        };

        normalizeBucketsMatchingInteraction(bucketsSlide, undefined, prevSlideWith8Items);

        // Token 1 accesses prevTwoPartItems[0]
        expect(bucketsSlide.interaction.tokens[0].text).toBe('do homework.');
        // Token 8 (N) accesses prevTwoPartItems[7] (N-1) strictly, avoiding fallback of raw '8'
        expect(bucketsSlide.interaction.tokens[1].text).toBe('watch a film.');
      });

      it('11. Directiva de Arquitectura Formal: Escalas de equivalencia precedentes y sucesivas en isolateCanonicalInstruction', () => {
        // Escala antecede a la cláusula imperativa: podar prefijo completo y retener desde el verbo rector
        const rawPrecedingScale =
          '1 = I love it. 2 = I like it. 3 = I hate it. Match the sentences in 1a) to the categories A–C.';
        expect(isolateCanonicalInstruction(rawPrecedingScale)).toBe(
          'Match the sentences in 1a) to the categories A–C.'
        );

        // Escala con metadatos entre paréntesis antecediendo a la cláusula
        const rawParenthesizedScale =
          '(Scale: 1 = I love it. 2 = I like it.) Match the sentences in 1a) to the categories A–C.';
        expect(isolateCanonicalInstruction(rawParenthesizedScale)).toBe(
          'Match the sentences in 1a) to the categories A–C.'
        );

        // Escala sucede a la cláusula con colon: truncar en el límite de la primera oración imperativa
        const rawSucceedingScaleWithColon =
          'Match the sentences in 1a) to the categories A–C: 1 = I love it. 2 = I like it. 3 = I don\'t like it.';
        expect(isolateCanonicalInstruction(rawSucceedingScaleWithColon)).toBe(
          'Match the sentences in 1a) to the categories A–C.'
        );
      });

      it('12. Directiva de Arquitectura Formal: Resolución por Ordinal Absoluto y Banco de N - 1 Fichas con Muestra Preasignada', () => {
        const previousSlideContext: any = {
          id: 'slide-prev-exercise-1a',
          title: 'Exercise 1a',
          subtitle: 'Match the sentence halves',
          interaction: {
            type: 'input_fields',
            listItems: [
              { id: '1', prompt: '1. I always enjoy', expectedAnswer: 'swimming in the ocean.' },
              { id: '2', prompt: '2. She rarely drinks', expectedAnswer: 'coffee after dinner.' },
              { id: '3', prompt: '3. We prefer reading', expectedAnswer: 'historical fiction books.' },
              { id: '4', prompt: '4. He never watches', expectedAnswer: 'horror movies at night.' },
              { id: '5', prompt: '5. They often play', expectedAnswer: 'badminton at the park.' },
              { id: '6', prompt: '6. You should try', expectedAnswer: 'cooking Indian curry.' },
              { id: '7', prompt: '7. I can\'t stand', expectedAnswer: 'waiting in long lines.' },
            ],
          },
        };

        // En Exercise 1b: N = 7 oraciones referenciadas.
        // Contenedor A tiene la muestra preasignada k_e = 1 (A HOBBIES: 1)
        // Tokens suministrados como identificadores numéricos en crudo (1..7)
        const currentBucketsSlide: any = {
          id: 'slide-exercise-1b',
          title: 'Exercise 1b',
          subtitle: 'Use the sentences in 1a). Put them into categories A–C: A HOBBIES: 1 B HABITS C FOOD',
          interaction: {
            type: 'buckets_matching',
            instruction: 'Use the sentences in 1a). Put them into categories.',
            buckets: [
              { id: 'A', label: 'HOBBIES' },
              { id: 'B', label: 'HABITS' },
              { id: 'C', label: 'FOOD' },
            ],
            tokens: [
              { id: 'tok-1', text: '1', correctBucketId: 'A' },
              { id: 'tok-2', text: '2', correctBucketId: 'B' },
              { id: 'tok-3', text: '3', correctBucketId: 'A' },
              { id: 'tok-4', text: '4', correctBucketId: 'B' },
              { id: 'tok-5', text: '5', correctBucketId: 'A' },
              { id: 'tok-6', text: '6', correctBucketId: 'C' },
              { id: 'tok-7', text: '7', correctBucketId: 'B' },
            ],
          },
        };

        normalizeBucketsMatchingInteraction(currentBucketsSlide, undefined, previousSlideContext);

        const it = currentBucketsSlide.interaction;

        // 1. Single Source of Truth: token de ejemplo k_e = 1 reside directamente en block.tokens con isExample: true
        expect(it.tokens).toHaveLength(7); // N = 7: 1 ficha de ejemplo + 6 fichas interactivas
        expect(it.tokens[0].id).toBe('token-example-1');
        expect(it.tokens[0].text).toBe('I always enjoy swimming in the ocean.');
        expect(it.tokens[0].isExample).toBe(true);
        expect(it.tokens[0].correctBucketId).toBe('A');

        // Sin mutación ni dependencia en arrays secundarios como bucket.items
        expect(it.buckets[0].items).toBeUndefined();

        // 2. Banco interactivo consta de exactamente N - 1 = 6 fichas (con isExample: false)
        const interactiveTokens = it.tokens.filter((t: any) => !t.isExample);
        expect(interactiveTokens).toHaveLength(6);
        expect(it.sourceItems).toHaveLength(7);

        // 3. Cada ficha interactiva corresponde estrictamente al índice ordinal absoluto k_i sin desalineamiento posicional relativo
        // y ninguna ficha contiene valores numéricos en crudo
        expect(interactiveTokens[0].text).toBe('She rarely drinks coffee after dinner.'); // k = 2 -> previousTwoPartItems[1]
        expect(interactiveTokens[0].correctBucketId).toBe('B');

        expect(interactiveTokens[1].text).toBe('We prefer reading historical fiction books.'); // k = 3 -> previousTwoPartItems[2]
        expect(interactiveTokens[1].correctBucketId).toBe('A');

        expect(interactiveTokens[2].text).toBe('He never watches horror movies at night.'); // k = 4 -> previousTwoPartItems[3]
        expect(interactiveTokens[2].correctBucketId).toBe('B');

        expect(interactiveTokens[3].text).toBe('They often play badminton at the park.'); // k = 5 -> previousTwoPartItems[4]
        expect(interactiveTokens[3].correctBucketId).toBe('A');

        expect(interactiveTokens[4].text).toBe('You should try cooking Indian curry.'); // k = 6 -> previousTwoPartItems[5]
        expect(interactiveTokens[4].correctBucketId).toBe('C');

        // El reactivo N = 7 accede estrictamente a previousTwoPartItems[6] sin caer en fallback '7'
        expect(interactiveTokens[5].text).toBe('I can\'t stand waiting in long lines.'); // k = 7 -> previousTwoPartItems[6]
        expect(interactiveTokens[5].correctBucketId).toBe('B');
      });

      it('13. Resolución de Muestra Universal en Bucket A e Integración Íntegra de Fichas desde Clave de Respuestas (e.g. A2; 6; 9 B3 C4; 5; 7; 8)', () => {
        // Validación directa del parser de clave de respuestas
        const parsedKey = parseBucketsCategoryAnswerKey('A2; 6; 9 B3 C4; 5; 7; 8');
        expect(parsedKey).not.toBeNull();
        expect(parsedKey?.size).toBe(8);
        expect(parsedKey?.get(2)).toBe('A');
        expect(parsedKey?.get(6)).toBe('A');
        expect(parsedKey?.get(9)).toBe('A');
        expect(parsedKey?.get(3)).toBe('B');
        expect(parsedKey?.get(4)).toBe('C');
        expect(parsedKey?.get(5)).toBe('C');
        expect(parsedKey?.get(7)).toBe('C');
        expect(parsedKey?.get(8)).toBe('C');

        // Diapositiva previa con N = 9 oraciones (listItems emparejados en dos partes)
        const previousSlideContext: any = {
          id: 'slide-prev-matching-9',
          title: 'Exercise 2a: Matching Sentences',
          subtitle: 'Match 1-9 with a-i',
          interaction: {
            type: 'input_fields',
            listItems: [
              { id: '1', prompt: '1. I always enjoy', expectedAnswer: 'a. swimming in the pool.' },
              { id: '2', prompt: '2. She rarely drinks', expectedAnswer: 'b. green tea in the morning.' },
              { id: '3', prompt: '3. We prefer reading', expectedAnswer: 'c. mystery novels.' },
              { id: '4', prompt: '4. He never watches', expectedAnswer: 'd. science fiction films.' },
              { id: '5', prompt: '5. They often play', expectedAnswer: 'e. basketball after school.' },
              { id: '6', prompt: '6. You should try', expectedAnswer: 'f. Italian pasta.' },
              { id: '7', prompt: '7. I can\'t stand', expectedAnswer: 'g. waiting for the bus.' },
              { id: '8', prompt: '8. My brother likes', expectedAnswer: 'h. eating spicy noodles.' },
              { id: '9', prompt: '9. She loves', expectedAnswer: 'i. listening to rock music.' },
            ],
          },
        };

        // Diapositiva actual de categorización (buckets)
        // Subtítulo / texto indica ejemplo '1' preubicado en contenedor A (A HOBBIES: 1)
        // Clave de respuestas: A2; 6; 9 B3 C4; 5; 7; 8
        const bucketsSlide: any = {
          id: 'slide-curr-buckets-9',
          title: 'Exercise 2b: Categorization',
          subtitle: 'Put the sentences from 2a into categories A–C: A HOBBIES: 1 B HABITS C FOOD. Key: A2; 6; 9 B3 C4; 5; 7; 8',
          interaction: {
            type: 'buckets_matching',
            instruction: 'Put the sentences from 2a into categories.',
            buckets: [
              { id: 'A', label: 'Hobbies' },
              { id: 'B', label: 'Habits' },
              { id: 'C', label: 'Food' },
            ],
            tokens: [],
          },
        };

        normalizeBucketsMatchingInteraction(bucketsSlide, undefined, previousSlideContext);

        const it = bucketsSlide.interaction;

        // 1. Single Source of Truth: tokenExample reside directamente en block.tokens con isExample: true
        // y sin mutación de bucket.items
        expect(it.tokens).toHaveLength(9); // N = 9 (1 ficha ejemplo + 8 fichas interactivas)
        expect(it.tokens[0].id).toBe('token-example-1');
        expect(it.tokens[0].text).toBe('I always enjoy swimming in the pool.');
        expect(it.tokens[0].isExample).toBe(true);
        expect(it.tokens[0].correctBucketId).toBe('A');
        expect(it.buckets[0].items).toBeUndefined();

        // 2. Integración Íntegra de Fichas desde la Clave de Respuestas:
        // Todos los identificadores explícitos presentes en la clave (2, 3, 4, 5, 6, 7, 8, 9)
        // corresponden a ítems interactivos con isExample: false.
        const interactiveTokens = it.tokens.filter((t: any) => !t.isExample);
        expect(interactiveTokens).toHaveLength(8);
        expect(it.sourceItems).toHaveLength(9);

        // Fichas en bucket A (2, 6, 9)
        const tok2 = it.tokens.find((t: any) => t.id === 'tok-2');
        expect(tok2).toBeDefined();
        expect(tok2.text).toBe('She rarely drinks green tea in the morning.');
        expect(tok2.correctBucketId).toBe('A');

        const tok6 = it.tokens.find((t: any) => t.id === 'tok-6');
        expect(tok6).toBeDefined();
        expect(tok6.text).toBe('You should try Italian pasta.');
        expect(tok6.correctBucketId).toBe('A');

        const tok9 = it.tokens.find((t: any) => t.id === 'tok-9');
        expect(tok9).toBeDefined();
        expect(tok9.text).toBe('She loves listening to rock music.');
        expect(tok9.correctBucketId).toBe('A');

        // Ficha en bucket B (3)
        const tok3 = it.tokens.find((t: any) => t.id === 'tok-3');
        expect(tok3).toBeDefined();
        expect(tok3.text).toBe('We prefer reading mystery novels.');
        expect(tok3.correctBucketId).toBe('B');

        // Fichas en bucket C (4, 5, 7, 8)
        const tok4 = it.tokens.find((t: any) => t.id === 'tok-4');
        expect(tok4).toBeDefined();
        expect(tok4.text).toBe('He never watches science fiction films.');
        expect(tok4.correctBucketId).toBe('C');

        const tok5 = it.tokens.find((t: any) => t.id === 'tok-5');
        expect(tok5).toBeDefined();
        expect(tok5.text).toBe('They often play basketball after school.');
        expect(tok5.correctBucketId).toBe('C');

        const tok7 = it.tokens.find((t: any) => t.id === 'tok-7');
        expect(tok7).toBeDefined();
        expect(tok7.text).toBe('I can\'t stand waiting for the bus.');
        expect(tok7.correctBucketId).toBe('C');

        const tok8 = it.tokens.find((t: any) => t.id === 'tok-8');
        expect(tok8).toBeDefined();
        expect(tok8.text).toBe('My brother likes eating spicy noodles.');
        expect(tok8.correctBucketId).toBe('C');
      });

      it('14. Preservación de Prefijos de Categoría (A, B, C) y Reconciliación de bucket.id (bucket-A, bucket-B)', () => {
        const rawSlideWithPrefixes: any = {
          id: 'slide-prefixes-test',
          title: 'Exercise 6: Likes and Dislikes',
          subtitle: 'Put the phrases in the correct category',
          interaction: {
            id: 'int-prefixes',
            type: 'buckets_matching',
            instruction: 'Classify the phrases',
            buckets: [
              { id: 'bucket-1', label: 'A phrases to say you like something:' },
              { id: 'bucket-2', label: 'B phrases to say you do not like something:' },
            ],
            tokens: [
              { id: 'tok-1', text: 'I really like it', correctBucketId: 'A' },
              { id: 'tok-2', text: 'I cannot stand it', correctBucketId: 'B' },
            ],
          },
        };

        normalizeBucketsMatchingInteraction(rawSlideWithPrefixes);

        const buckets = rawSlideWithPrefixes.interaction.buckets;
        expect(buckets).toHaveLength(2);

        // 1. Prohibición de eliminar la letra identificadora inicial ('A', 'B') en bucket.label
        expect(buckets[0].label).toBe('A Phrases to say you like something:');
        expect(buckets[1].label).toBe('B Phrases to say you do not like something:');

        // 2. bucket.id debe reflejar la categoría ('bucket-A', 'bucket-B')
        expect(buckets[0].id).toBe('bucket-A');
        expect(buckets[1].id).toBe('bucket-B');
      });

      it('15. Alineamiento Agnóstico de Ordinales e Inyección de Muestra en interaction.tokens', () => {
        const previousSlideContext: any = {
          id: 'slide-prev-pairs',
          title: 'Exercise 3a: Sentences',
          interaction: {
            type: 'input_fields',
            layoutMode: 'list',
            listItems: [
              { id: 'li-1', prompt: '1. I always enjoy', expectedAnswer: 'going camping in the summer.' },
              { id: 'li-2', prompt: '2. She rarely drinks', expectedAnswer: 'black coffee with breakfast.' },
              { id: 'li-3', prompt: '3. We never play', expectedAnswer: 'tennis on rainy afternoons.' },
              { id: 'li-4', prompt: '4. He usually reads', expectedAnswer: 'historical articles online.' },
            ],
          },
        };

        const currentBucketsSlide: any = {
          id: 'slide-buckets-categorize',
          title: 'Exercise 3b: Categorize sentences',
          subtitle: 'Use the sentences in Exercise 3a. Put them into categories (e.g. 1): A FREQUENT ACTIONS B INFREQUENT ACTIONS',
          _rawExtraction: {
            answersText: 'A4 B2; 3', // k=1 omitido (es ejemplo), k=2 (B), k=3 (B), k=4 (A)
          },
          interaction: {
            id: 'int-buckets-cat',
            type: 'buckets_matching',
            instruction: 'Put sentences from 3a into categories',
            buckets: [
              { id: 'bucket-A', label: 'A Frequent actions' },
              { id: 'bucket-B', label: 'B Infrequent actions' },
            ],
            tokens: [],
          },
        };

        normalizeBucketsMatchingInteraction(currentBucketsSlide, undefined, previousSlideContext);

        const it = currentBucketsSlide.interaction;

        // 1. Inyección Dinámica del Token de Muestra:
        // Cardinalidad total exactamente N = 4 (1 muestra + 3 interactivos)
        expect(it.tokens).toHaveLength(4);

        const sampleToken = it.tokens[0];
        expect(sampleToken.id).toBe('token-example-1');
        expect(sampleToken.isExample).toBe(true);
        expect(sampleToken.correctBucketId).toBe('bucket-A');
        expect(sampleToken.text).toBe('I always enjoy going camping in the summer.');

        // 2. Mapeo Canónico por Ordinal Absoluto (k vs índice):
        // k=2: 'She rarely drinks black coffee with breakfast.' -> bucket-B
        const tok2 = it.tokens.find((t: any) => t.id === 'tok-2');
        expect(tok2).toBeDefined();
        expect(tok2.isExample).toBe(false);
        expect(tok2.correctBucketId).toBe('bucket-B');
        expect(tok2.text).toBe('She rarely drinks black coffee with breakfast.');

        // k=3: 'We never play tennis on rainy afternoons.' -> bucket-B
        const tok3 = it.tokens.find((t: any) => t.id === 'tok-3');
        expect(tok3).toBeDefined();
        expect(tok3.isExample).toBe(false);
        expect(tok3.correctBucketId).toBe('bucket-B');
        expect(tok3.text).toBe('We never play tennis on rainy afternoons.');

        // k=4: 'He usually reads historical articles online.' -> bucket-A
        const tok4 = it.tokens.find((t: any) => t.id === 'tok-4');
        expect(tok4).toBeDefined();
        expect(tok4.isExample).toBe(false);
        expect(tok4.correctBucketId).toBe('bucket-A');
        expect(tok4.text).toBe('He usually reads historical articles online.');
      });

      it('16. Extractor Universal de Oraciones en buckets_matching y Generación Garantizada de sampleToken', () => {
        // Diapositiva previa de tipo buckets_matching (actividad de matching / mitades de oración)
        // Bucket 1 (k=1) tiene reactivo de ejemplo preasignado en b.items[0]
        // Buckets 2 y 3 tienen b.items vacío y tokens interactivos correspondientes
        const previousMatchingSlide: any = {
          id: 'slide-matching-prev',
          interaction: {
            id: 'int-matching-prev',
            type: 'buckets_matching',
            buckets: [
              {
                id: 'bucket-2',
                label: '2 She usually drinks',
                items: [], // reactivo interactivo
              },
              {
                id: 'bucket-1',
                label: '1 I always wake up',
                items: [
                  { id: 'item-ex-1', text: 'e) at six in the morning.', isExample: true },
                ], // reactivo de ejemplo preasignado
              },
              {
                id: 'bucket-3',
                label: '3 They never travel',
                items: [], // reactivo interactivo
              },
            ],
            tokens: [
              { id: 'tok-ans-3', text: 'b) during winter months.', correctBucketId: 'bucket-3' },
              { id: 'tok-ans-2', text: 'a) hot tea with lemon.', correctBucketId: 'bucket-2' },
            ],
          },
        };

        // 1. Validar Extractor Universal de Oraciones:
        const extracted = extractTwoPartItemsFromSlide(previousMatchingSlide);
        expect(extracted).toHaveLength(3);

        // Debe ordenar por ordinal natural k: 1, 2, 3 independientemente del orden de buckets
        expect(extracted[0].prompt).toBe('I always wake up at six in the morning.');
        expect(extracted[0].expectedAnswer).toBe('at six in the morning.');

        expect(extracted[1].prompt).toBe('She usually drinks hot tea with lemon.');
        expect(extracted[1].expectedAnswer).toBe('hot tea with lemon.');

        expect(extracted[2].prompt).toBe('They never travel during winter months.');
        expect(extracted[2].expectedAnswer).toBe('during winter months.');

        // 2. Validar Generación Garantizada de sampleToken en la diapositiva subsiguiente
        const categorizationSlide: any = {
          id: 'slide-cat-next',
          title: 'Exercise 2b: Categorization',
          subtitle: 'Look at the sentences in 2a. Put them into categories A or B: A HABITS B PLANS',
          interaction: {
            id: 'int-cat-next',
            type: 'buckets_matching',
            instruction: 'Use the sentences in 2a. Put them into categories.',
            buckets: [
              { id: 'bucket-A', label: 'A · HABITS', items: [] },
              { id: 'bucket-B', label: 'B · PLANS', items: [] },
            ],
            tokens: [
              { id: 'raw-2', text: '2', correctBucketId: 'bucket-A' },
              { id: 'raw-3', text: '3', correctBucketId: 'bucket-B' },
            ],
          },
        };

        // Spy on console.log to verify [BucketsDistribution] does not log sampleToken: null
        const consoleSpy = vi.spyOn(console, 'log');

        normalizeBucketsMatchingInteraction(categorizationSlide, undefined, previousMatchingSlide);

        // Verificar el log de [BucketsDistribution]
        const distributionLogCall = consoleSpy.mock.calls.find((call) =>
          typeof call[0] === 'string' && call[0].includes('[BucketsDistribution]')
        );
        expect(distributionLogCall).toBeDefined();
        expect(distributionLogCall![1].sampleToken).not.toBeNull();
        expect(distributionLogCall![1].sampleToken.id).toBe('token-example-1');

        consoleSpy.mockRestore();

        // 3. Consolidar interaction.tokens = [sampleToken, ...interactiveTokens]
        const tokens = categorizationSlide.interaction.tokens;
        expect(tokens).toHaveLength(3); // 1 muestra + 2 interactivos

        const sampleToken = tokens[0];
        expect(sampleToken.id).toBe('token-example-1');
        expect(sampleToken.isExample).toBe(true);
        expect(sampleToken.text).toBe('I always wake up at six in the morning.');

        const interactiveToks = tokens.filter((t: any) => !t.isExample);
        expect(interactiveToks).toHaveLength(2);
        expect(interactiveToks[0].text).toBe('She usually drinks hot tea with lemon.');
        expect(interactiveToks[1].text).toBe('They never travel during winter months.');
      });
    });
  });

  // =========================================================================
  // CASO W: Soporte Universal Agnóstico para Actividades 'cloze_multichoice'
  // =========================================================================
  describe('Caso W: Soporte Universal Agnóstico para Actividades cloze_multichoice (Texto con Gaps y Banco de Opciones Inferior)', () => {
    it('cleanOptionText limpia prefijos de letras (a), b., c- y etiquetas de ejemplo preservando palabras', () => {
      expect(cleanOptionText('a) travel')).toBe('travel');
      expect(cleanOptionText('(b) traveled (example)')).toBe('traveled');
      expect(cleanOptionText('c. travelling *')).toBe('travelling');
      expect(cleanOptionText('d - stayed [sample]')).toBe('stayed');
      expect(cleanOptionText('a car')).toBe('a car');
      expect(cleanOptionText('a) a big car')).toBe('a big car');
    });

    it('detecta y transforma obligatoriamente una lectura pasiva con gaps y banco inferior a cloze_multichoice', () => {
      // Simulación de OCR donde el pasaje y las opciones inferiores fueron erróneamente clasificados como lectura pasiva
      const rawSlideObj = {
        id: 'slide-cloze-1',
        title: 'Marco Polo: The Silk Road',
        subtitle: 'Read the article and choose the correct options.',
        layout: 'single_column',
        isGraded: false,
        referenceContent: {
          id: 'ref-text-1',
          type: 'text',
          category: 'reading',
          title: 'Marco Polo',
          content: `Marco Polo was born in Venice in 1254. When he was 17, he 1 _____ to China with his father. They 2 _____ for three years. In China, he 3 _____ for the Emperor Kublai Khan. He 4 _____ in China for 17 years before returning home.

1 a) travel b) *traveled* (example) c) travelling
2 a) journeyed b) went c) visited
3 a) worked b) works c) working
4 a) stayed b) stay c) staying`
        },
        interaction: null
      };

      // Verificación directa de funciones de detección y normalización
      expect(isClozeMultichoiceActivity(rawSlideObj)).toBe(true);
      const cloned = JSON.parse(JSON.stringify(rawSlideObj));
      normalizeClozeMultichoiceInteraction(cloned);
      expect(cloned.interaction?.type).toBe('cloze_multichoice');

      const rawPassiveClozeSlide = JSON.stringify({
        slides: [rawSlideObj]
      });

      const slides = validateAndParseSlides(rawPassiveClozeSlide);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      // Queda estrictamente prohibido clasificarlo como 'Lectura' (referenceContent debe ser null)
      expect(slide.referenceContent).toBeNull();
      expect(slide.layout).toBe('single_column');
      expect(slide.isGraded).toBe(true);

      // Interacción debe ser 'cloze_multichoice'
      expect(slide.interaction).toBeDefined();
      expect(slide.interaction?.type).toBe('cloze_multichoice');

      const interaction = slide.interaction as any;
      // passageText debe tener los marcadores canónicos {{gap-k}}
      expect(interaction.passageText).toContain('{{gap-1}}');
      expect(interaction.passageText).toContain('{{gap-2}}');
      expect(interaction.passageText).toContain('{{gap-3}}');
      expect(interaction.passageText).toContain('{{gap-4}}');
      expect(interaction.passageText).not.toContain('1 a) travel');

      // Gaps deben tener 4 reactivos
      expect(interaction.gaps).toHaveLength(4);

      // Reactivo 1 (Ejemplo resuelto)
      const gap1 = interaction.gaps[0];
      expect(gap1.id).toBe('gap-1');
      expect(gap1.ordinal).toBe(1);
      expect(gap1.isExample).toBe(true);
      expect(gap1.correctOptionId).toBe('b');
      expect(gap1.options).toEqual([
        { id: 'a', text: 'travel' },
        { id: 'b', text: 'traveled' },
        { id: 'c', text: 'travelling' }
      ]);

      // Reactivo 2
      const gap2 = interaction.gaps[1];
      expect(gap2.id).toBe('gap-2');
      expect(gap2.ordinal).toBe(2);
      expect(gap2.options).toEqual([
        { id: 'a', text: 'journeyed' },
        { id: 'b', text: 'went' },
        { id: 'c', text: 'visited' }
      ]);
      expect(gap2.isExample).toBeUndefined();
    });

    it('convierte un arquetipo selection degradado con preguntas ordinales a cloze_multichoice', () => {
      const rawDegradedSelectionSlide = JSON.stringify({
        slides: [
          {
            id: 'slide-degraded-selection',
            title: 'Past Simple Cloze',
            subtitle: 'Choose the correct form of the verbs.',
            layout: 'split_50_50',
            referenceContent: {
              id: 'ref-text-2',
              type: 'text',
              category: 'reading',
              content: 'Yesterday, Sarah [ 1 ] up at 7:00. She [ 2 ] breakfast and [ 3 ] to work.'
            },
            interaction: {
              id: 'int-selection-degraded',
              type: 'selection',
              instruction: 'Choose the correct option:',
              questions: [
                {
                  id: 'q-1',
                  prompt: '1',
                  mode: 'single_choice',
                  isExample: true,
                  options: [
                    { id: 'a', text: 'woke', isCorrect: true, isExample: true },
                    { id: 'b', text: 'wake', isCorrect: false },
                    { id: 'c', text: 'waking', isCorrect: false }
                  ]
                },
                {
                  id: 'q-2',
                  prompt: '2',
                  mode: 'single_choice',
                  options: [
                    { id: 'a', text: 'eat', isCorrect: false },
                    { id: 'b', text: 'ate', isCorrect: true },
                    { id: 'c', text: 'eaten', isCorrect: false }
                  ]
                },
                {
                  id: 'q-3',
                  prompt: '3',
                  mode: 'single_choice',
                  options: [
                    { id: 'a', text: 'went', isCorrect: true },
                    { id: 'b', text: 'go', isCorrect: false },
                    { id: 'c', text: 'gone', isCorrect: false }
                  ]
                }
              ]
            }
          }
        ]
      });

      const slides = validateAndParseSlides(rawDegradedSelectionSlide);
      expect(slides).toHaveLength(1);

      const slide = slides[0];
      expect(slide.referenceContent).toBeNull();
      expect(slide.layout).toBe('single_column');
      expect(slide.interaction?.type).toBe('cloze_multichoice');

      const interaction = slide.interaction as any;
      expect(interaction.passageText).toBe('Yesterday, Sarah {{gap-1}} up at 7:00. She {{gap-2}} breakfast and {{gap-3}} to work.');
      expect(interaction.gaps).toHaveLength(3);
      expect(interaction.gaps[0].isExample).toBe(true);
      expect(interaction.gaps[0].correctOptionId).toBe('a');
      expect(interaction.gaps[1].correctOptionId).toBe('b');
      expect(interaction.gaps[2].correctOptionId).toBe('a');
    });

    it('aplica solucionario cosechado (harvestedAnswerKeys) para calibrar correctOptionId en cloze_multichoice', () => {
      const rawWithKey = JSON.stringify({
        slides: [
          {
            id: 'slide-cloze-with-key',
            title: 'Unit 4 Exercise 2a',
            subtitle: 'Read and complete',
            referenceContent: {
              id: 'ref-text-3',
              type: 'text',
              content: `Ancient Rome was a bustling metropolis. The Colosseum [ 1 ] built in 70 AD.
Romans [ 2 ] chariot races and theatrical performances.

1 a) was b) were c) is
2 a) liked b) enjoyed c) hated`
            },
            interaction: null
          },
          // Solucionario / Answer key
          {
            id: 'slide-key',
            title: 'Answer Key',
            subtitle: 'Exercise 2a Answers: 1 a 2 b',
            referenceContent: null,
            interaction: null
          }
        ]
      });

      const slides = validateAndParseSlides(rawWithKey);
      expect(slides).toHaveLength(1);
      const slide = slides[0];
      expect(slide.interaction?.type).toBe('cloze_multichoice');
      const interaction = slide.interaction as any;
      expect(interaction.gaps[0].correctOptionId).toBe('a');
      expect(interaction.gaps[1].correctOptionId).toBe('b');
    });

    it('evaluateClozeMultichoice califica correctamente omitiendo reactivos de ejemplo', () => {
      const mockBlock = {
        id: 'block-1',
        type: 'cloze_multichoice',
        instruction: 'Choose options',
        passageText: 'Text {{gap-1}} and {{gap-2}} and {{gap-3}}',
        gaps: [
          {
            id: 'gap-1',
            ordinal: 1,
            isExample: true,
            options: [{ id: 'a', text: 'optA' }, { id: 'b', text: 'optB' }],
            correctOptionId: 'a',
          },
          {
            id: 'gap-2',
            ordinal: 2,
            options: [{ id: 'a', text: 'optA' }, { id: 'b', text: 'optB' }],
            correctOptionId: 'b',
          },
          {
            id: 'gap-3',
            ordinal: 3,
            options: [{ id: 'a', text: 'optA' }, { id: 'b', text: 'optB' }],
            correctOptionId: 'a',
          },
        ]
      } as any;

      // Student answers: gap-2 is correct ('b'), gap-3 is incorrect ('b')
      const result = evaluateClozeMultichoice(mockBlock, {
        'gap-1': 'a',
        'gap-2': 'b',
        'gap-3': 'b',
      });

      expect(result.maxScore).toBe(2); // gap-1 omitted because isExample: true
      expect(result.score).toBe(1); // only gap-2 correct
      expect(result.isCorrect).toBe(false);
      expect(result.details['gap-1']).toBe(true);
      expect(result.details['gap-2']).toBe(true);
      expect(result.details['gap-3']).toBe(false);

      // Student answers all non-examples correctly:
      const perfectResult = evaluateClozeMultichoice(mockBlock, {
        'gap-2': 'b',
        'gap-3': 'a',
      });
      expect(perfectResult.score).toBe(2);
      expect(perfectResult.maxScore).toBe(2);
      expect(perfectResult.isCorrect).toBe(true);
    });

    it('aplica invariantes canónicas: layout single_column, referenceContent null, contextBody eliminado, format y id interaction-${slide.id}', () => {
      const rawSlideObj = {
        id: 'slide-invariants-test',
        title: 'The Great Expedition',
        subtitle: 'Read and select',
        layout: 'split_50_50',
        contextBody: 'This should be removed from static body',
        referenceContent: {
          type: 'text',
          content: 'The explorers {{gap-1}} early and {{gap-2}} the river.\n1 a) left (example) b) leave\n2 a) cross b) crossed',
        },
        interaction: null,
      };

      const slides = validateAndParseSlides(JSON.stringify({ slides: [rawSlideObj] }));
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      // Invariantes estrictas
      expect(slide.layout).toBe('single_column');
      expect(slide.referenceContent).toBeNull();
      expect((slide as any).contextBody).toBeUndefined();
      expect(slide.format).toBe('cloze_multichoice');
      expect(slide.interaction).toBeDefined();
      expect(slide.interaction?.type).toBe('cloze_multichoice');
      expect(slide.interaction?.id).toBe(`interaction-${slide.id}`);
      expect(slide.interaction?.instruction).toBe('Read and select');
    });

    it('parser abstracto extrae dinámicamente banco inferior con marcas visuales (asterisco, círculo, resaltado, example) y harvestedAnswerKeys', () => {
      const rawSlideWithMixedMarkers = {
        id: 'slide-abstract-parser-test',
        title: 'Ancient Wonders',
        subtitle: 'Choose the best options for each gap.',
        layout: 'split_50_50',
        interaction: {
          id: 'int-existing',
          type: 'cloze_multichoice',
          passageText: `In ancient times, builders 1 _____ pyramids. They 2 _____ enormous stone blocks. Workers 3 _____ along the Nile. Architects 4 _____ plans carefully. Many monuments 5 _____ today.
1 a) constructed (example) b) construct c) constructing
2 a) moved b) *transported* c) carry
3 a) [circled] travelled b) walk c) run
4 a) drew b) drawn c) ==designed==
5 a) remain b) remains c) remaining`,
          gaps: [], // Array vacío: fuerza extracción abstracta dinámica
        },
      };

      const slides = validateAndParseSlides(
        JSON.stringify({
          slides: [
            rawSlideWithMixedMarkers,
            {
              id: 'slide-key',
              title: 'Answer Key',
              subtitle: 'Ancient Answers: 5 a',
              referenceContent: null,
              interaction: null,
            },
          ],
        })
      );
      expect(slides).toHaveLength(1);
      const slide = slides[0];
      const interaction = slide.interaction as any;

      expect(slide.layout).toBe('single_column');
      expect(slide.referenceContent).toBeNull();
      expect(slide.format).toBe('cloze_multichoice');

      // passageText debe tener los marcadores canónicos y NO contener el banco de opciones inferior
      expect(interaction.passageText).toContain('{{gap-1}}');
      expect(interaction.passageText).toContain('{{gap-2}}');
      expect(interaction.passageText).toContain('{{gap-3}}');
      expect(interaction.passageText).toContain('{{gap-4}}');
      expect(interaction.passageText).toContain('{{gap-5}}');
      expect(interaction.passageText).not.toContain('1 a) constructed');
      expect(interaction.passageText).not.toContain('5 a) remain');

      expect(interaction.gaps).toHaveLength(5);

      // Reactivo 1: Sufijo (example) -> isExample: true, correctOptionId: 'a'
      expect(interaction.gaps[0].id).toBe('gap-1');
      expect(interaction.gaps[0].isExample).toBe(true);
      expect(interaction.gaps[0].correctOptionId).toBe('a');
      expect(interaction.gaps[0].options[0].text).toBe('constructed');

      // Reactivo 2: Asterisco *transported* -> correctOptionId: 'b'
      expect(interaction.gaps[1].id).toBe('gap-2');
      expect(interaction.gaps[1].correctOptionId).toBe('b');
      expect(interaction.gaps[1].options[1].text).toBe('transported');

      // Reactivo 3: Círculo [circled] -> correctOptionId: 'a'
      expect(interaction.gaps[2].id).toBe('gap-3');
      expect(interaction.gaps[2].correctOptionId).toBe('a');
      expect(interaction.gaps[2].options[0].text).toBe('travelled');

      // Reactivo 4: Resaltado ==designed== -> correctOptionId: 'c'
      expect(interaction.gaps[3].id).toBe('gap-4');
      expect(interaction.gaps[3].correctOptionId).toBe('c');
      expect(interaction.gaps[3].options[2].text).toBe('designed');

      // Reactivo 5: Resuelto contra harvestedAnswerKeys -> correctOptionId: 'a'
      expect(interaction.gaps[4].id).toBe('gap-5');
      expect(interaction.gaps[4].correctOptionId).toBe('a');
      expect(interaction.gaps[4].options[0].text).toBe('remain');
    });

    it('prohibe estrictamente interaction: null cuando el cuerpo contiene marcadores {{gap-', () => {
      const rawSlideWithGapsOnly = {
        id: 'slide-gaps-no-interaction',
        title: 'Story of Invention',
        subtitle: 'Fill the blanks',
        referenceContent: {
          type: 'text',
          content: 'Thomas Edison {{gap-1}} the phonograph in 1877. He {{gap-2}} many other devices.',
        },
        interaction: null, // Prohibido que permanezca null
      };

      const slides = validateAndParseSlides(JSON.stringify({ slides: [rawSlideWithGapsOnly] }));
      expect(slides).toHaveLength(1);
      const slide = slides[0];

      expect(slide.interaction).not.toBeNull();
      expect(slide.interaction?.type).toBe('cloze_multichoice');
      expect(slide.layout).toBe('single_column');
      expect(slide.referenceContent).toBeNull();
      expect((slide as any).contextBody).toBeUndefined();
      expect(slide.format).toBe('cloze_multichoice');

      const interaction = slide.interaction as any;
      expect(interaction.passageText).toBe('Thomas Edison {{gap-1}} the phonograph in 1877. He {{gap-2}} many other devices.');
      expect(interaction.gaps).toHaveLength(2);
      expect(interaction.gaps[0].id).toBe('gap-1');
      expect(interaction.gaps[1].id).toBe('gap-2');
    });

    it('extrae opciones reales de 3 alternativas cuando las opciones parsed coinciden con Option A/B o vienen vacías', () => {
      const rawOcrText = `Read the text and choose the correct option for each gap.
Many people think Marco Polo was the first European to travel to China. However, other merchants had {{gap-1}} there before him. During his journeys, he {{gap-2}} many astonishing customs.

1 a) arrived b) gone c) reached
2 a) witnessed b) was c) saw`;

      // Simular diapositiva donde el modelo devolvió placeholders por defecto
      const slideWithPlaceholders: any = {
        id: 'slide-cloze-placeholder-test',
        title: 'Marco Polo Expedition',
        subtitle: 'Read and choose',
        interaction: {
          id: 'int-placeholder',
          type: 'cloze_multichoice',
          passageText: 'Many people think Marco Polo was the first European to travel to China. However, other merchants had {{gap-1}} there before him. During his journeys, he {{gap-2}} many astonishing customs.',
          gaps: [
            {
              id: 'gap-1',
              ordinal: 1,
              options: [
                { id: 'a', text: 'Option A' },
                { id: 'b', text: 'Option B' },
              ],
              correctOptionId: 'a',
            },
            {
              id: 'gap-2',
              ordinal: 2,
              options: [], // Vienen vacías
              correctOptionId: 'a',
            },
          ],
        },
        _rawExtraction: {
          ocrText: rawOcrText,
        },
      };

      const normalized = normalizeClozeMultichoiceInteraction(slideWithPlaceholders);
      expect(normalized).toBe(true);

      const gaps = slideWithPlaceholders.interaction.gaps;
      expect(gaps).toHaveLength(2);

      // Gap 1: Reemplazó 'Option A' / 'Option B' por las 3 alternativas reales
      expect(gaps[0].options).toHaveLength(3);
      expect(gaps[0].options[0]).toEqual({ id: 'a', text: 'arrived' });
      expect(gaps[0].options[1]).toEqual({ id: 'b', text: 'gone' });
      expect(gaps[0].options[2]).toEqual({ id: 'c', text: 'reached' });

      // Gap 2: Reemplazó el array vacío por las 3 alternativas reales
      expect(gaps[1].options).toHaveLength(3);
      expect(gaps[1].options[0]).toEqual({ id: 'a', text: 'witnessed' });
      expect(gaps[1].options[1]).toEqual({ id: 'b', text: 'was' });
      expect(gaps[1].options[2]).toEqual({ id: 'c', text: 'saw' });
    });

    it('extractRealOptionsForOrdinal parsea líneas con ordinal k e incisos a, b, c multilínea o en una sola línea', () => {
      // 1. Una sola línea
      const singleLine = `1 a) travel b) went c) gone\n2 a) was b) were c) be`;
      const opts1 = extractRealOptionsForOrdinal(singleLine, 1);
      expect(opts1).toEqual([
        { id: 'a', text: 'travel' },
        { id: 'b', text: 'went' },
        { id: 'c', text: 'gone' },
      ]);

      // 2. Multilínea con saltos
      const multiLine = `1\n a) first\n b) second\n c) third\n2\n a) stop`;
      const optsMulti = extractRealOptionsForOrdinal(multiLine, 1);
      expect(optsMulti).toEqual([
        { id: 'a', text: 'first' },
        { id: 'b', text: 'second' },
        { id: 'c', text: 'third' },
      ]);

      // 3. Incisos con mayúsculas y puntos: 1. A. big B. bigger C. biggest
      const dotFormat = `1. A. big B. bigger C. biggest`;
      const optsDot = extractRealOptionsForOrdinal(dotFormat, 1);
      expect(optsDot).toEqual([
        { id: 'a', text: 'big' },
        { id: 'b', text: 'bigger' },
        { id: 'c', text: 'biggest' },
      ]);

      // 4. Test parseOptionsFromOrdinalBlock y areGapOptionsPlaceholderOrEmpty
      const parsedBlock = parseOptionsFromOrdinalBlock('a) travel b) went c) gone');
      expect(parsedBlock).toHaveLength(3);
      expect(areGapOptionsPlaceholderOrEmpty([{ id: 'a', text: 'Option A' }, { id: 'b', text: 'Option B' }])).toBe(true);
      expect(areGapOptionsPlaceholderOrEmpty([{ id: 'a', text: 'travel' }, { id: 'b', text: 'went' }])).toBe(false);

      // 5. Test parseClozeOptionsFromText
      const { gaps: parsedGaps } = parseClozeOptionsFromText('1 a) travel b) went c) gone');
      expect(parsedGaps).toHaveLength(1);
      expect(parsedGaps[0].options).toHaveLength(3);
    });

    it('buildExtractionPrompt contiene la directiva crítica prohibiendo split_50_50 y exigiendo cloze_multichoice cuando forcedTargetType es cloze_multichoice o currentSlide es cloze', () => {
      const prompt = buildExtractionPrompt(1, 'cloze_multichoice');
      expect(prompt).toContain('CRITICAL DIRECTIVE FOR "cloze_multichoice"');
      expect(prompt).toContain("IT IS STRICTLY FORBIDDEN to format or regenerate this slide as a split reading layout ('split_50_50', 'split_60_40', 'split_40_60') or lecture template ('lecture')");
      expect(prompt).toContain('"referenceContent" MUST BE STRICTLY NULL and "layout" MUST BE "single_column"');
      expect(prompt).toContain('interaction.type MUST BE "cloze_multichoice"');

      // Test con currentSlide
      const mockCurrentSlide: any = {
        format: 'cloze_multichoice',
        interaction: {
          type: 'cloze_multichoice',
          passageText: 'The discovery {{gap-1}} new evidence.',
        },
      };
      const promptWithSlide = buildExtractionPrompt(1, undefined, null, mockCurrentSlide);
      expect(promptWithSlide).toContain('CRITICAL DIRECTIVE FOR "cloze_multichoice"');
      expect(promptWithSlide).toContain('The discovery {{gap-1}} new evidence.');
    });

    it('validateAndParseSlides prohibe degradación a split_50_50 / lecture y extrae opciones reales (3 alternativas a, b, c)', () => {
      const rawAiResponse = JSON.stringify({
        slides: [
          {
            id: 'slide-test-regen',
            title: 'Ancient Egypt',
            layout: 'split_50_50',
            format: 'lecture',
            referenceContent: {
              id: 'ref-1',
              type: 'text',
              content: 'The Egyptians {{gap-1}} pyramids.\n1 a) built b) build c) building',
            },
            interaction: {
              type: 'cloze_multichoice',
              passageText: 'The Egyptians {{gap-1}} pyramids.',
              gaps: [
                {
                  id: 'gap-1',
                  ordinal: 1,
                  options: [
                    { id: 'a', text: 'Option A' },
                    { id: 'b', text: 'Option B' },
                  ],
                },
              ],
            },
          },
        ],
      });

      const parsed = validateAndParseSlides(rawAiResponse, null, {
        forcedTargetType: 'cloze_multichoice',
      });

      expect(parsed).toHaveLength(1);
      const slide = parsed[0];
      expect(slide.layout).toBe('single_column');
      expect(slide.referenceContent).toBeNull();
      expect(slide.format).toBe('cloze_multichoice');
      expect(slide.interaction?.type).toBe('cloze_multichoice');

      const gaps = (slide.interaction as any).gaps;
      expect(gaps).toHaveLength(1);
      expect(gaps[0].options).toHaveLength(3);
      expect(gaps[0].options[0]).toEqual({ id: 'a', text: 'built' });
      expect(gaps[0].options[1]).toEqual({ id: 'b', text: 'build' });
      expect(gaps[0].options[2]).toEqual({ id: 'c', text: 'building' });
    });

    it('STRUCTURED_SLIDE_SCHEMA y getStructuredSlideSchema definen gaps requerido con schema exacto', () => {
      const interactionProps = (STRUCTURED_SLIDE_SCHEMA.properties.slides.items as any).properties.interaction.properties;
      expect(interactionProps.gaps.type).toBe('array');
      expect(interactionProps.gaps.description).toBe('List of multiple choice options for each gap number present in the passage text');
      expect(interactionProps.gaps.items.properties.ordinal.type).toBe('number');
      expect(interactionProps.gaps.items.properties.options.items.properties.id.description).toBe('Letter of option: a, b, c...');
      expect(interactionProps.gaps.items.properties.options.items.properties.text.description).toBe('Literal text of the option without letter prefix');
      expect(interactionProps.gaps.items.required).toEqual(['id', 'ordinal', 'options']);

      const forcedSchema = getStructuredSlideSchema('cloze_multichoice');
      const forcedInteraction = forcedSchema.properties.slides.items.properties.interaction;
      expect(forcedInteraction.required).toContain('gaps');
      expect(forcedInteraction.required).toContain('passageText');
      expect(forcedInteraction.properties.type.enum).toEqual(['cloze_multichoice']);
    });

    it('Zod schema rechaza cloze_multichoice sin gaps y valida ordinal numérico', () => {
      const validOption = ClozeMultichoiceOptionSchema.safeParse({ id: 'a', text: 'choice' });
      expect(validOption.success).toBe(true);

      const blockParse = ClozeMultichoiceBlockSchema.safeParse({
        type: 'cloze_multichoice',
        id: 'block-1',
        instruction: 'Choose',
        passageText: 'Passage {{gap-1}}',
        gaps: [
          {
            id: 'gap-1',
            ordinal: 1,
            options: [{ id: 'a', text: 'option' }],
          },
        ],
      });
      expect(blockParse.success).toBe(true);

      const validGap = ClozeMultichoiceGapSchema.safeParse({
        id: 'gap-1',
        ordinal: 1,
        options: [{ id: 'a', text: 'option' }],
      });
      expect(validGap.success).toBe(true);

      const invalidGapWithoutOrdinal = ClozeMultichoiceGapSchema.safeParse({
        id: 'gap-1',
        options: [{ id: 'a', text: 'option' }],
      });
      expect(invalidGapWithoutOrdinal.success).toBe(false);

      const invalidSlideWithoutGaps = SlideSchema.safeParse({
        id: 'slide-1',
        title: 'Title',
        layout: 'single_column',
        format: 'cloze_multichoice',
        interaction: {
          id: 'int-1',
          type: 'cloze_multichoice',
          instruction: 'Choose',
          passageText: 'Passage {{gap-1}}',
        },
      });
      expect(invalidSlideWithoutGaps.success).toBe(false);
    });

    it('System prompt de extracción incluye la regla crítica de extracción obligatoria de gaps y opciones literales', () => {
      const prompt = buildExtractionPrompt(1);
      expect(prompt).toContain("When a text has gaps (1..N) and there is a table or rows of options below (e.g., '1 a) ... b) ... c) ...'):");
      expect(prompt).toContain('* You MUST extract EVERY option letter and literal phrase from that lower block for each gap.');
      expect(prompt).toContain("* Under NO circumstance should you omit the 'gaps' array or return empty/placeholder options.");
      expect(prompt).toContain("* If a secondary crop contains an answer key (e.g., '2a) says 3c) have used...'), assign those letters to 'correctOptionId'.");
    });

    it('normalizeClozeMultichoiceInteraction NO genera fallback dummy Option A / Option B cuando no hay opciones reales y emite advertencia', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const slideWithoutOptions: any = {
        id: 'slide-no-options',
        title: 'No Options Exercise',
        interaction: {
          id: 'int-no-opts',
          type: 'cloze_multichoice',
          passageText: 'Yesterday I {{gap-1}} to the park. She {{gap-2}} a book.',
          gaps: [],
        },
      };

      const result = normalizeClozeMultichoiceInteraction(slideWithoutOptions);
      expect(result).toBe(true);
      expect(slideWithoutOptions.interaction.gaps).toHaveLength(2);
      expect(slideWithoutOptions.interaction.gaps[0].options).toEqual([]);
      expect(slideWithoutOptions.interaction.gaps[1].options).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('Estabilización: candidateModels prioriza gemini-2.5-flash, elimina gemini-3.8-flash y limita timeout a 15s', () => {
      expect(DEFAULT_GEMINI_CANDIDATE_MODELS[0]).toBe('gemini-2.5-flash');
      expect(DEFAULT_GEMINI_CANDIDATE_MODELS).not.toContain('gemini-3.8-flash');
      expect(DEFAULT_OPENROUTER_CANDIDATE_MODELS[0]).toBe('google/gemini-2.5-flash');
      expect(DEFAULT_OPENROUTER_CANDIDATE_MODELS).not.toContain('google/gemini-3.8-flash');
      expect(CANDIDATE_TIMEOUT_MS).toBe(15000);
    });

    it('Prevención de truncamiento masivo: buildExtractionPrompt prohibe re-emitir datos base64 o texto repetitivo', () => {
      const prompt = buildExtractionPrompt(1);
      expect(prompt).toContain('Do NOT echo image data, base64 strings, or repetitive tokens. Output ONLY the compact JSON slide.');
    });
  });

  // =========================================================================
  // Caso X: Extracción Agnóstica del Arquetipo 'buckets_matching' (1-to-1 Matching)
  // =========================================================================
  describe('Caso X: Extracción Agnóstica del Arquetipo buckets_matching (1-to-1 Matching)', () => {
    it('1. STRUCTURED_SLIDE_SCHEMA y getStructuredSlideSchema admiten formalmente buckets_matching con correctPairs, targetSlots y sourceItems', () => {
      const interactionProps = (STRUCTURED_SLIDE_SCHEMA as any).properties.slides.items.properties.interaction.properties;
      expect(interactionProps.correctPairs).toBeDefined();
      expect(interactionProps.targetSlots).toBeDefined();
      expect(interactionProps.sourceItems).toBeDefined();
      expect(interactionProps.buckets).toBeDefined();
      expect(interactionProps.tokens).toBeDefined();

      const forcedSchema = getStructuredSlideSchema('buckets_matching');
      const forcedInteraction = (forcedSchema as any).properties.slides.items.properties.interaction;
      expect(forcedInteraction.properties.type.enum).toEqual(['buckets_matching']);
      expect(forcedInteraction.required).toContain('targetSlots');
      expect(forcedInteraction.required).toContain('sourceItems');
    });

    it('2. buildExtractionPrompt incluye la directiva crítica abstracta para ejercicios de correspondencia / matching', () => {
      const prompt = buildExtractionPrompt(1);
      expect(prompt).toContain('CRITICAL FOR MATCHING / PAIRING EXERCISES (e.g., Match A with B, opposites, halves, definitions):');
      expect(prompt).toContain("- NEVER dump items, lists, or solutions into 'subtitle', 'referenceContent', or flat text.");
      expect(prompt).toContain("- You MUST return an 'interaction' of type 'buckets_matching'.");
      expect(prompt).toContain("- Extract all primary/left-column items or numbered prompts (1..N) into 'targetSlots' [{ id: 'slot-k', label: '...' }].");
      expect(prompt).toContain("- Extract all secondary/right-column items, options, or answer-key elements into 'sourceItems' [{ id: 'src-k', text: '...' }].");
      expect(prompt).toContain("- Build 'correctPairs' mapping the correct 'sourceId' to each 'targetId' according to the visual connection or answer-key crop.");
      expect(prompt).toContain('- If an item is already solved in the book as an example, designate it as the model item.');
    });

    it('3. normalizeSlide preserva type buckets_matching, asigna format buckets, layout single_column y genera correctPairs', () => {
      const rawSlide: any = {
        id: 'slide-match-1',
        title: 'Vocabulary: Opposites',
        layout: 'split_50_50',
        referenceContent: 'Some text',
        contextBody: 'Old body',
        interaction: {
          type: 'buckets_matching',
          instruction: 'Match words with their opposites',
          targetSlots: [
            { id: 'slot-1', label: 'hot' },
            { id: 'slot-2', label: 'big' },
          ],
          sourceItems: [
            { id: 'src-a', text: 'cold', correctTargetId: 'slot-1' },
            { id: 'src-b', text: 'small', correctTargetId: 'slot-2' },
          ],
        },
      };

      const normalized = normalizeSlide(rawSlide);
      expect(normalized.format).toBe('buckets');
      expect(normalized.layout).toBe('single_column');
      expect(normalized.referenceContent).toBeNull();
      expect(normalized.contextBody).toBeUndefined();

      const interaction = normalized.interaction as any;
      expect(interaction.type).toBe('buckets_matching');
      expect(interaction.targetSlots).toHaveLength(2);
      expect(interaction.sourceItems).toHaveLength(2);
      expect(interaction.correctPairs).toEqual({
        'src-a': 'slot-1',
        'src-b': 'slot-2',
      });
      // Sincronización con buckets & tokens para compatibilidad total con renderers
      expect(interaction.buckets).toHaveLength(2);
      expect(interaction.tokens).toHaveLength(2);
    });

    it('4. Mecanismo de contingencia agnóstico: parsea pares concatenados (1 A - B) desde subtitle a targetSlots, sourceItems y correctPairs', () => {
      const rawText = '1 A - arrive / B - depart\n2 A - huge / B - tiny\n3 A - buy / B - sell';
      const parsed = parseMatchingPairsFromText(rawText);
      expect(parsed).not.toBeNull();
      expect(parsed?.targetSlots).toHaveLength(3);
      expect(parsed?.sourceItems).toHaveLength(3);
      expect(parsed?.targetSlots[0].label).toBe('arrive');
      expect(parsed?.sourceItems[0].text).toBe('depart');
      expect(parsed?.correctPairs['src-1']).toBe('slot-1');
      expect(parsed?.correctPairs['src-2']).toBe('slot-2');
      expect(parsed?.correctPairs['src-3']).toBe('slot-3');
    });

    it('5. Mecanismo de contingencia agnóstico: parsea pares delimitados con dos puntos (k item : match)', () => {
      const rawText = 'Match the verbs to the nouns:\n1. take : photos\n2. book : tickets\n3. check : in';
      const parsed = parseMatchingPairsFromText(rawText);
      expect(parsed).not.toBeNull();
      expect(parsed?.targetSlots).toHaveLength(3);
      expect(parsed?.sourceItems).toHaveLength(3);
      expect(parsed?.targetSlots[0].label).toBe('take');
      expect(parsed?.sourceItems[0].text).toBe('photos');
      expect(parsed?.targetSlots[1].label).toBe('book');
      expect(parsed?.sourceItems[1].text).toBe('tickets');
      expect(parsed?.correctPairs['src-1']).toBe('slot-1');
      expect(parsed?.correctPairs['src-2']).toBe('slot-2');
    });

    it('6. validateAndParseSlides recupera slide degradado con pares en subtitle mediante contingencia', () => {
      const rawPayload = JSON.stringify({
        slides: [
          {
            id: 'slide-contingency-match',
            title: 'Unit 3: Collocations',
            subtitle: '1 take - a photo\n2 make - a mistake\n3 do - homework\n4 have - lunch',
            layout: 'single_column',
            isGraded: true,
            interaction: null,
          },
        ],
      });

      const slides = validateAndParseSlides(rawPayload);
      expect(slides).toHaveLength(1);
      const slide = slides[0];
      expect(slide.format).toBe('buckets');
      expect(slide.layout).toBe('single_column');
      expect(slide.interaction).not.toBeNull();
      expect(slide.interaction?.type).toBe('buckets_matching');

      const interaction = slide.interaction as any;
      expect(interaction.targetSlots).toHaveLength(4);
      expect(interaction.sourceItems).toHaveLength(4);
      expect(interaction.targetSlots[0].label).toBe('take');
      expect(interaction.sourceItems[0].text).toBe('a photo');
      expect(interaction.correctPairs['src-1']).toBe('slot-1');
      expect(interaction.correctPairs['src-2']).toBe('slot-2');
      expect(interaction.correctPairs['src-3']).toBe('slot-3');
      expect(interaction.correctPairs['src-4']).toBe('slot-4');
    });
  });

  // =========================================================================
  // CASO Y: Exigencia Estricta de 'interaction' y Recuperación de Solucionario
  // =========================================================================
  describe('Caso Y: Exigencia Estricta de interaction y Recuperación Agnóstica de Solucionario', () => {
    it('1. STRUCTURED_SLIDE_SCHEMA exige formalmente interaction en slide items', () => {
      const slideItemRequired = (STRUCTURED_SLIDE_SCHEMA as any).properties.slides.items.required;
      expect(slideItemRequired).toContain('id');
      expect(slideItemRequired).toContain('title');
      expect(slideItemRequired).toContain('layout');
      expect(slideItemRequired).toContain('interaction');
    });

    it('2. getStructuredSlideSchema garantiza interaction obligatoria en arquetipos evaluables y la excluye en reference_table/reference_text', () => {
      const interactiveArchetypes = [
        'buckets_matching',
        'fill_blanks',
        'multiple_choice',
        'selection',
        'cloze_multichoice',
        'sequence',
      ] as const;

      for (const archetype of interactiveArchetypes) {
        const schema = getStructuredSlideSchema(archetype as any);
        const slideItemRequired = (schema as any).properties.slides.items.required;
        expect(
          slideItemRequired,
          `Arquetipo ${archetype} debe exigir 'interaction' en required`,
        ).toContain('interaction');

        // Y la interacción misma debe tener required mínimo
        const interactionSchema = (schema as any).properties.slides.items.properties.interaction;
        expect(interactionSchema.required).toContain('type');
      }

      // Referencias pasivas no deben forzar interaction
      const refTableSchema = getStructuredSlideSchema('reference_table');
      expect((refTableSchema as any).properties.slides.items.required).not.toContain('interaction');

      const refTextSchema = getStructuredSlideSchema('reference_text');
      expect((refTextSchema as any).properties.slides.items.required).not.toContain('interaction');
    });

    it('3. buildExtractionPrompt incluye la directiva CRITICAL ENFORCEMENT FOR INTERACTIVE EXERCISES', () => {
      const prompt = buildExtractionPrompt(1, 'fill_blanks');
      expect(prompt).toContain('CRITICAL ENFORCEMENT FOR INTERACTIVE EXERCISES:');
      expect(prompt).toContain("'interaction' is MANDATORY on every graded/practice slide.");
      expect(prompt).toContain("'referenceContent' is STRICTLY for reading passages or context that the student must read BEFORE solving the exercise.");
      expect(prompt).toContain("NEVER put answer keys, solutions, or matching pairs inside 'referenceContent'.");
      expect(prompt).toContain("When an answer key or solution snippet is provided (e.g. '2 item, 3 item...'), you MUST map its values directly into the corresponding interaction items");
    });

    it('4. parseSequentialAnswerKeyFromText extrae soluciones secuenciales y descarta textos narrativos', () => {
      // Secuencia limpia compacta
      const compact = parseSequentialAnswerKeyFromText('2 tidy up 3 look after 4 go out 5 take off');
      expect(compact).not.toBeNull();
      expect(compact?.['2']).toBe('tidy up');
      expect(compact?.['3']).toBe('look after');
      expect(compact?.['4']).toBe('go out');
      expect(compact?.['5']).toBe('take off');

      // Secuencia con puntuación y prefijo
      const withDots = parseSequentialAnswerKeyFromText('Answers: 1. clean 2. bright 3. huge');
      expect(withDots).not.toBeNull();
      expect(withDots?.['1']).toBe('clean');
      expect(withDots?.['2']).toBe('bright');
      expect(withDots?.['3']).toBe('huge');

      // Texto narrativo largo / lectura normal (debe devolver null para no falsos positivos)
      const narrative = 'In the year 1999, John had 2 dogs. Then in 2005 he bought 3 cats and traveled around the world.';
      expect(parseSequentialAnswerKeyFromText(narrative)).toBeNull();

      // Menos de 2 claves
      const single = 'Exercise 2 is very difficult.';
      expect(parseSequentialAnswerKeyFromText(single)).toBeNull();
    });

    it('5. normalizeSlide recupera solucionario secuencial de referenceContent y genera fill_blanks', () => {
      const rawSlide: any = {
        id: 'slide-rec-1',
        title: 'Phrasal Verbs Exercise',
        subtitle: 'Complete the sentences with the correct phrasal verb',
        layout: 'single_column',
        referenceContent: {
          title: 'Notes',
          content: '2 tidy up 3 look after 4 go out 5 take off',
        },
        interaction: null,
      };

      const normalized = normalizeSlide(rawSlide);
      expect(normalized.referenceContent).toBeNull();
      expect(normalized.format).toBe('fill_blanks');
      expect(normalized.interaction).not.toBeNull();
      expect(normalized.interaction?.type).toBe('input_fields');

      const interaction = normalized.interaction as any;
      const items = interaction.items || interaction.listItems;
      expect(items).toBeDefined();
      expect(items.length).toBeGreaterThanOrEqual(4);
      expect(items[0].acceptedAnswers).toContain('tidy up');
      expect(interaction.wordBank).toContain('tidy up');
      expect(interaction.wordBank).toContain('look after');
    });

    it('6. normalizeSlide recupera solucionario de pares de referenceContent y genera buckets_matching', () => {
      const rawSlide: any = {
        id: 'slide-rec-2',
        title: 'Opposites Matching',
        subtitle: 'Match the opposites',
        layout: 'single_column',
        referenceContent: {
          title: 'Answer Key',
          content: '1 A - arrive 2 B - huge 3 C - buy',
        },
        interaction: null,
      };

      const normalized = normalizeSlide(rawSlide);
      expect(normalized.referenceContent).toBeNull();
      expect(normalized.format).toBe('buckets');
      expect(normalized.interaction).not.toBeNull();
      expect(normalized.interaction?.type).toBe('buckets_matching');

      const interaction = normalized.interaction as any;
      expect(interaction.targetSlots).toBeDefined();
      expect(interaction.sourceItems).toBeDefined();
      expect(interaction.correctPairs).toBeDefined();
    });

    it('7. validateAndParseSlides valida completamente un payload con solucionario recuperado', () => {
      const rawPayload = JSON.stringify({
        slides: [
          {
            id: 'slide-e2e-rescue',
            title: 'Vocabulary Practice',
            subtitle: 'Fill in each blank with the right word',
            layout: 'single_column',
            referenceContent: {
              title: 'Answers',
              content: '2 take off 3 put on 4 look up',
            },
            interaction: null,
          },
        ],
      });

      const slides = validateAndParseSlides(rawPayload);
      expect(slides).toHaveLength(1);
      const slide = slides[0];
      expect(slide.referenceContent).toBeNull();
      expect(slide.format).toBe('fill_blanks');
      expect(slide.interaction?.type).toBe('input_fields');
      const interaction = slide.interaction as any;
      const items = interaction.items || interaction.listItems;
      expect(items).toBeDefined();
      expect(items[0].acceptedAnswers).toContain('take off');
    });
  });

  // =========================================================================
  // CASO Z: Normalización de 'input_fields' incompletos y Mapeo a 'buckets_matching'
  // =========================================================================
  describe('Caso Z: Normalización de input_fields incompletos y Mapeo a buckets_matching', () => {
    it('1. getStructuredSlideSchema exige listItems en arquetipos input_fields y fill_blanks', () => {
      const inputSchema = getStructuredSlideSchema('input_fields');
      const interactionInput = (inputSchema as any).properties.slides.items.properties.interaction;
      expect(interactionInput.required).toContain('listItems');

      const fillSchema = getStructuredSlideSchema('fill_blanks');
      const interactionFill = (fillSchema as any).properties.slides.items.properties.interaction;
      expect(interactionFill.required).toContain('listItems');
    });

    it('2. extractNumberedPremises extrae premisas multilínea e inline', () => {
      // Multilínea
      const multiline = '1 take\n2 make\n3 do\n4 have';
      const parsedMulti = extractNumberedPremises(multiline);
      expect(parsedMulti).toHaveLength(4);
      expect(parsedMulti[0].text).toBe('take');
      expect(parsedMulti[1].text).toBe('make');
      expect(parsedMulti[2].text).toBe('do');
      expect(parsedMulti[3].text).toBe('have');

      // Inline
      const inline = '1 take 2 make 3 do 4 have';
      const parsedInline = extractNumberedPremises(inline);
      expect(parsedInline).toHaveLength(4);
      expect(parsedInline[0].text).toBe('take');
      expect(parsedInline[3].text).toBe('have');

      // Oraciones con blanks
      const sentences = '1 She _____ to school 2 They _____ soccer';
      const parsedSentences = extractNumberedPremises(sentences);
      expect(parsedSentences).toHaveLength(2);
      expect(parsedSentences[0].text).toBe('She _____ to school');
      expect(parsedSentences[1].text).toBe('They _____ soccer');
    });

    it('3. normalizeSlide rescata input_fields sin listItems con instrucción de matching y lo transforma a buckets_matching', () => {
      const rawSlide: any = {
        id: 'slide-matching-rescue',
        title: 'Collocations Matching',
        subtitle: '1 take\n2 make\n3 do\n4 have',
        interaction: {
          id: 'int-match-1',
          type: 'input_fields',
          instruction: 'Match the verbs with the words to make common collocations:',
          wordBank: ['a photo', 'a mistake', 'homework', 'lunch'],
        },
      };

      const normalized = normalizeSlide(rawSlide);
      expect(normalized.format).toBe('buckets');
      expect(normalized.layout).toBe('single_column');
      expect(normalized.interaction).not.toBeNull();
      expect(normalized.interaction.type).toBe('buckets_matching');

      const it = normalized.interaction;
      expect(it.targetSlots).toHaveLength(4);
      expect(it.sourceItems).toHaveLength(4);
      expect(it.targetSlots[0].label).toBe('take');
      expect(it.sourceItems[0].text).toBe('a photo');
      expect(it.targetSlots[1].label).toBe('make');
      expect(it.sourceItems[1].text).toBe('a mistake');
      expect(it.correctPairs['src-1']).toBe('slot-1');
      expect(it.correctPairs['src-2']).toBe('slot-2');
    });

    it('4. normalizeSlide rescata input_fields sin listItems en fill_blanks sintetizando listItems desde premisas', () => {
      const rawSlide: any = {
        id: 'slide-fill-rescue',
        title: 'Past Simple Practice',
        subtitle: '1 She _____ to school yesterday.\n2 They _____ soccer last weekend.',
        interaction: {
          id: 'int-fill-1',
          type: 'input_fields',
          instruction: 'Complete the sentences with the correct form of the verbs:',
          wordBank: ['walked', 'played'],
        },
      };

      const normalized = normalizeSlide(rawSlide);
      expect(normalized.format).toBe('fill_blanks');
      expect(normalized.interaction).not.toBeNull();
      expect(normalized.interaction.type).toBe('input_fields');

      const it = normalized.interaction;
      const items = it.listItems || it.items;
      expect(items).toHaveLength(2);
      expect(items[0].prompt).toContain('She');
      expect(items[0].acceptedAnswers).toContain('walked');
      expect(items[1].prompt).toContain('They');
      expect(items[1].acceptedAnswers).toContain('played');
    });

    it('5. normalizeSlide sintetiza listItems desde wordBank cuando no hay premisas numeradas en el subtítulo', () => {
      const rawSlide: any = {
        id: 'slide-wb-only-rescue',
        title: 'Travel Vocabulary',
        subtitle: 'Complete the gaps',
        interaction: {
          id: 'int-fill-wb',
          type: 'input_fields',
          instruction: 'Fill in the blanks with the correct words from the box:',
          wordBank: ['departure', 'arrival', 'boarding'],
        },
      };

      const normalized = normalizeSlide(rawSlide);
      expect(normalized.format).toBe('fill_blanks');
      expect(normalized.interaction.type).toBe('input_fields');

      const it = normalized.interaction;
      const items = it.listItems || it.items;
      expect(items).toHaveLength(3);
      expect(items[0].acceptedAnswers).toContain('departure');
      expect(items[1].acceptedAnswers).toContain('arrival');
      expect(items[2].acceptedAnswers).toContain('boarding');
    });

    it('6. validateAndParseSlides valida completamente y preserva la interacción rescatada a buckets_matching', () => {
      const rawPayload = JSON.stringify({
        slides: [
          {
            id: 'slide-e2e-matching-fix',
            title: 'Verbs & Nouns',
            subtitle: '1 take\n2 book\n3 check',
            interaction: {
              id: 'int-e2e-1',
              type: 'input_fields',
              instruction: 'Match the verbs to the nouns:',
              wordBank: ['photos', 'tickets', 'in'],
            },
          },
        ],
      });

      const slides = validateAndParseSlides(rawPayload);
      expect(slides).toHaveLength(1);
      const slide = slides[0];
      expect(slide.format).toBe('buckets');
      expect(slide.layout).toBe('single_column');
      expect(slide.interaction).not.toBeNull();
      expect(slide.interaction?.type).toBe('buckets_matching');

      const it = slide.interaction as any;
      expect(it.targetSlots).toHaveLength(3);
      expect(it.sourceItems).toHaveLength(3);
      expect(it.targetSlots[0].label).toBe('take');
      expect(it.sourceItems[0].text).toBe('photos');
    });
  });
});






