import { describe, it, expect, beforeEach, vi } from 'vitest';
import JSZip from 'jszip';
import { generateScorm12Manifest } from '../scormManifest';
import { 
  initScorm, 
  setScore, 
  setStatus, 
  finishScorm, 
  resetScormDriverState,
  isScormConnected
} from '../scormDriver';
import { exportScormPackage } from '../exportScormPackage';
import type { Lesson } from '../../../types/schema';

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

describe('SCORM 1.2 Integration Suite', () => {
  const sampleLesson: Lesson = {
    id: 'lesson-unit-1',
    title: 'Unit 1: Jobs & Routines <Special & Bold>',
    level: 'B1',
    unit: 'Unit 1',
    slides: [
      {
        id: 's1',
        title: 'Vocabulary: Jobs',
        subtitle: 'Complete the sentences',
        layout: 'split_50_50',
        referenceContent: {
          type: 'text',
          id: 'ref1',
          category: 'reading',
          content: 'Read the text carefully. [ 1 ] An architect designs buildings.',
        },
        interaction: {
          type: 'input_fields',
          id: 'act1',
          instruction: 'Write the job names',
          layoutMode: 'list',
          listItems: [
            { id: 'q1', prompt: '1.', expectedAnswer: 'architect', acceptedAnswers: ['architect'], isExample: true },
            { id: 'q2', prompt: '2. A doctor works in a {{blank}}.', expectedAnswer: 'hospital', acceptedAnswers: ['hospital'] },
          ],
          tableHeaders: [],
          tableRows: [],
          paragraphTemplate: '',
          paragraphInputs: {},
        },
        notes: '',
        isGraded: true,
      },
    ],
  };

  describe('1. scormManifest.ts', () => {
    it('generates a canonical ADL SCORM 1.2 manifest with XML escaping and proper identifiers', () => {
      const manifest = generateScorm12Manifest({
        lessonId: sampleLesson.id,
        lessonTitle: sampleLesson.title,
      });

      expect(manifest).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(manifest).toContain('<schema>ADL SCORM</schema>');
      expect(manifest).toContain('<schemaversion>1.2</schemaversion>');
      expect(manifest).toContain('identifier="MANIFEST_lesson_unit_1"');
      expect(manifest).toContain('identifier="ORG_lesson_unit_1"');
      expect(manifest).toContain('identifier="ITEM_lesson_unit_1"');
      expect(manifest).toContain('identifier="RES_lesson_unit_1"');
      expect(manifest).toContain('<file href="index.html" />');
      expect(manifest).toContain('<file href="lesson.json" />');
      // Escaping check: <Special & Bold> -> &lt;Special &amp; Bold&gt;
      expect(manifest).toContain('&lt;Special &amp; Bold&gt;');
      expect(manifest).not.toContain('<Special & Bold>');
    });

    it('handles custom additional file dependencies if specified', () => {
      const manifest = generateScorm12Manifest({
        lessonId: 'test-custom',
        lessonTitle: 'Custom Test',
        files: ['custom.css', 'audio.mp3'],
      });

      expect(manifest).toContain('<file href="custom.css" />');
      expect(manifest).toContain('<file href="audio.mp3" />');
    });
  });

  describe('2. scormDriver.ts', () => {
    beforeEach(() => {
      resetScormDriverState();
      // Remove any mocked API from global window
      delete (window as any).API;
    });

    it('degrades gracefully in standalone mode without window.API', () => {
      expect(isScormConnected()).toBe(false);
      expect(initScorm()).toBe(false);
      expect(setScore(80, 100)).toBe(false);
      expect(setStatus('passed')).toBe(false);
      expect(finishScorm()).toBe(false);
    });

    it('communicates correctly with LMS when window.API is present', () => {
      const mockApi = {
        LMSInitialize: vi.fn().mockReturnValue('true'),
        LMSFinish: vi.fn().mockReturnValue('true'),
        LMSGetValue: vi.fn().mockReturnValue('not attempted'),
        LMSSetValue: vi.fn().mockReturnValue('true'),
        LMSCommit: vi.fn().mockReturnValue('true'),
        LMSGetLastError: vi.fn().mockReturnValue('0'),
        LMSGetErrorString: vi.fn().mockReturnValue('No error'),
        LMSGetDiagnostic: vi.fn().mockReturnValue(''),
      };

      (window as any).API = mockApi;

      // 1. Init
      const initialized = initScorm();
      expect(initialized).toBe(true);
      expect(mockApi.LMSInitialize).toHaveBeenCalledWith('');
      expect(mockApi.LMSSetValue).toHaveBeenCalledWith('cmi.core.lesson_status', 'incomplete');
      expect(mockApi.LMSCommit).toHaveBeenCalled();

      // 2. Set Score
      const scoreReported = setScore(9.5, 10);
      expect(scoreReported).toBe(true);
      expect(mockApi.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.raw', '9.5');
      expect(mockApi.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.min', '0');
      expect(mockApi.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.max', '10');

      // 3. Set Status
      const statusReported = setStatus('passed');
      expect(statusReported).toBe(true);
      expect(mockApi.LMSSetValue).toHaveBeenCalledWith('cmi.core.lesson_status', 'passed');

      // 4. Finish
      const finished = finishScorm();
      expect(finished).toBe(true);
      expect(mockApi.LMSFinish).toHaveBeenCalledWith('');
      expect(isScormConnected()).toBe(false);
    });
  });

  describe('3. exportScormPackage.ts', () => {
    it('packages lesson into a valid ZIP blob containing imsmanifest.xml, lesson.json, and index.html', async () => {
      const zipBlob = await exportScormPackage(sampleLesson);

      expect(zipBlob).toBeInstanceOf(Blob);
      expect(zipBlob.type).toBe('application/zip');
      expect(zipBlob.size).toBeGreaterThan(1000);

      // Unpack and verify zip contents with JSZip
      const unzipped = await JSZip.loadAsync(zipBlob);
      const manifestFile = unzipped.file('imsmanifest.xml');
      const lessonFile = unzipped.file('lesson.json');
      const htmlFile = unzipped.file('index.html');

      expect(manifestFile).not.toBeNull();
      expect(lessonFile).not.toBeNull();
      expect(htmlFile).not.toBeNull();

      // Verify manifest content
      const manifestText = await manifestFile!.async('string');
      expect(manifestText).toContain('<schema>ADL SCORM</schema>');
      expect(manifestText).toContain('MANIFEST_lesson_unit_1');

      // Verify lesson.json content
      const lessonText = await lessonFile!.async('string');
      const parsedLesson = JSON.parse(lessonText);
      expect(parsedLesson.id).toBe(sampleLesson.id);
      expect(parsedLesson.slides.length).toBe(1);

      // Verify index.html content
      const htmlText = await htmlFile!.async('string');
      expect(htmlText).toContain('<!DOCTYPE html>');
      expect(htmlText).toContain('window.__LESSON_DATA__');
      expect(htmlText).toContain('LMSInitialize');
      expect(htmlText).toContain('cmi.core.score.raw');
      expect(htmlText).toContain('Comprobar Respuestas');
    });

    it('packages lesson containing buckets_matching interaction and renders matching zones, chips and scoring runtime', async () => {
      const matchingLesson: Lesson = {
        id: 'lesson-matching-1',
        title: 'Matching Opposites',
        level: 'A1-A2',
        unit: 'Unit 1',
        slides: [
          {
            id: 'slide-match',
            title: 'Opposites Match',
            subtitle: 'Match the <u>underlined</u> words with their opposites',
            format: 'buckets',
            layout: 'single_column',
            interaction: {
              id: 'int-match-1',
              type: 'buckets_matching',
              instruction: 'Match each adjective to its opposite:',
              buckets: [
                { id: 'slot-1', label: 'Hot' },
                { id: 'slot-2', label: 'Big' },
              ],
              tokens: [
                { id: 'src-1', text: 'Cold', correctBucketId: 'slot-1' },
                { id: 'src-2', text: 'Small', correctBucketId: 'slot-2' },
              ],
              targetSlots: [
                { id: 'slot-1', label: 'Hot' },
                { id: 'slot-2', label: 'Big' },
              ],
              sourceItems: [
                { id: 'src-1', text: 'Cold', correctTargetId: 'slot-1' },
                { id: 'src-2', text: 'Small', correctTargetId: 'slot-2' },
              ],
              correctPairs: {
                'src-1': 'slot-1',
                'src-2': 'slot-2',
              },
            },
            isGraded: true,
          },
        ],
      };

      const zipBlob = await exportScormPackage(matchingLesson);
      const unzipped = await JSZip.loadAsync(zipBlob);
      const htmlFile = unzipped.file('index.html');
      expect(htmlFile).not.toBeNull();

      const html = await htmlFile!.async('string');
      // Verify buckets_matching runtime functions, classes and styles
      expect(html).toContain('renderBucketsMatching');
      expect(html).toContain('matching-pool-container');
      expect(html).toContain('matching-chip');
      expect(html).toContain('bucket-card');
      expect(html).toContain('formatPromptHtml');
      // Serialized lesson JSON safely escapes < and > to prevent script injection
      expect(html).toContain('\\u003cu\\u003eunderlined\\u003c/u\\u003e');

      // Verify formatPromptHtml function syntax and execution without ReferenceError
      const fnMatch = html.match(/function formatPromptHtml\(text\)\s*\{[\s\S]*?\n    \}/);
      expect(fnMatch).not.toBeNull();
      // Execute the extracted runtime function in test environment
      const formatPromptFn = new Function('text', `${fnMatch![0]}; return formatPromptHtml(text);`);
      expect(() => formatPromptFn('test')).not.toThrow();
      expect(formatPromptFn(null)).toBe('');
      expect(formatPromptFn(undefined)).toBe('');
      expect(formatPromptFn('')).toBe('');
      expect(formatPromptFn('The <u>underlined</u> and **bold** text')).toBe('The <u>underlined</u> and <strong>bold</strong> text');
      expect(formatPromptFn('Dangerous <script>alert(1)</script>')).toBe('Dangerous &lt;script&gt;alert(1)&lt;/script&gt;');
    });
  });

  describe('4. useLessonStore.exportLessonAsScorm()', () => {
    it('executes exportLessonAsScorm cleanly, downloads the zip, and sets saveFeedback', async () => {
      const { useLessonStore } = await import('../../../store/useLessonStore');

      // Mock DOM URL methods
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-scorm-url');
      globalThis.URL.revokeObjectURL = vi.fn();

      const clickedLinks: string[] = [];
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(function (this: any) {
          clickedLinks.push(this.download);
        }),
      };

      (globalThis as any).document = {
        createElement: vi.fn((tag: string) => {
          if (tag === 'a') return mockAnchor;
          return {};
        }),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
      };

      useLessonStore.setState({
        lesson: sampleLesson,
        saveFeedback: null,
      });

      const success = await useLessonStore.getState().exportLessonAsScorm();
      expect(success).toBe(true);
      expect(clickedLinks.length).toBe(1);
      expect(clickedLinks[0]).toContain('_SCORM1.2.zip');
      expect(useLessonStore.getState().saveFeedback?.message).toContain('Paquete SCORM 1.2 descargado');
    });
  });
});
