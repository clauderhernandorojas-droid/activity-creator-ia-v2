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

});
