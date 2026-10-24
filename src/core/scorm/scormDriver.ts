/**
 * SCORM 1.2 Driver
 * Handles communication with LMS via window.API in compliance with SCORM 1.2 runtime specs.
 * Provides graceful degradation when running standalone outside of an LMS.
 */

export interface Scorm12API {
  LMSInitialize: (param: string) => string | boolean;
  LMSFinish: (param: string) => string | boolean;
  LMSGetValue: (element: string) => string;
  LMSSetValue: (element: string, value: string) => string | boolean;
  LMSCommit: (param: string) => string | boolean;
  LMSGetLastError: () => string | number;
  LMSGetErrorString: (errorCode: string | number) => string;
  LMSGetDiagnostic: (errorCode: string | number) => string;
}

let activeScormApi: Scorm12API | null = null;
let isInitialized = false;
let isFinished = false;

/**
 * Recursively scans window hierarchy for SCORM 1.2 `API` object.
 */
function scanWindowForApi(win: any, maxDepth = 10): Scorm12API | null {
  let current = win;
  let depth = 0;

  while (current && depth < maxDepth) {
    try {
      if (current.API && typeof current.API.LMSInitialize === 'function') {
        return current.API as Scorm12API;
      }
    } catch {
      // Cross-origin restriction hit, abort this branch
      break;
    }

    try {
      if (current.parent && current.parent !== current) {
        current = current.parent;
        depth++;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return null;
}

/**
 * Searches for LMS API in current window, parent windows, and opener windows.
 */
export function findScormApi(): Scorm12API | null {
  if (typeof window === 'undefined') return null;

  // 1. Search current window and parent frames
  let api = scanWindowForApi(window);
  if (api) return api;

  // 2. Search opener window if opened as popup
  try {
    if (window.opener) {
      api = scanWindowForApi(window.opener);
      if (api) return api;
    }
  } catch {
    // Opener cross-origin access blocked
  }

  return null;
}

/**
 * Initializes communication with the SCORM 1.2 LMS.
 * Safe no-op if no LMS is present.
 */
export function initScorm(): boolean {
  if (isInitialized && !isFinished) return true;

  activeScormApi = findScormApi();
  if (!activeScormApi) {
    console.info('[SCORM 1.2 Driver] No LMS API found in window hierarchy. Operating in standalone mode.');
    return false;
  }

  try {
    const rawResult = activeScormApi.LMSInitialize('');
    const success = rawResult === 'true' || rawResult === true;

    if (success) {
      isInitialized = true;
      isFinished = false;
      console.info('[SCORM 1.2 Driver] LMSInitialize succeeded.');

      // Set initial status to incomplete if not attempted
      const currentStatus = activeScormApi.LMSGetValue('cmi.core.lesson_status');
      if (!currentStatus || currentStatus === 'not attempted') {
        activeScormApi.LMSSetValue('cmi.core.lesson_status', 'incomplete');
        activeScormApi.LMSCommit('');
      }
      return true;
    } else {
      const errCode = activeScormApi.LMSGetLastError();
      console.warn(`[SCORM 1.2 Driver] LMSInitialize failed with error code: ${errCode}`);
      return false;
    }
  } catch (err) {
    console.warn('[SCORM 1.2 Driver] Exception during LMSInitialize:', err);
    return false;
  }
}

/**
 * Reports student score to the LMS.
 * Sets cmi.core.score.raw, cmi.core.score.min, cmi.core.score.max.
 */
export function setScore(score: number, maxScore: number): boolean {
  const normalizedScore = Math.max(0, Math.round(score * 100) / 100);
  const normalizedMax = Math.max(0, Math.round(maxScore * 100) / 100);

  if (!activeScormApi || !isInitialized || isFinished) {
    console.info(`[SCORM 1.2 Standalone] setScore: raw=${normalizedScore}, min=0, max=${normalizedMax}`);
    return false;
  }

  try {
    activeScormApi.LMSSetValue('cmi.core.score.raw', String(normalizedScore));
    activeScormApi.LMSSetValue('cmi.core.score.min', '0');
    activeScormApi.LMSSetValue('cmi.core.score.max', String(normalizedMax));
    activeScormApi.LMSCommit('');
    console.info(`[SCORM 1.2 Driver] Score reported: ${normalizedScore} / ${normalizedMax}`);
    return true;
  } catch (err) {
    console.warn('[SCORM 1.2 Driver] Exception during setScore:', err);
    return false;
  }
}

/**
 * Reports lesson status ("passed" | "failed" | "completed") to the LMS.
 */
export function setStatus(status: 'passed' | 'failed' | 'completed'): boolean {
  if (!activeScormApi || !isInitialized || isFinished) {
    console.info(`[SCORM 1.2 Standalone] setStatus: ${status}`);
    return false;
  }

  try {
    activeScormApi.LMSSetValue('cmi.core.lesson_status', status);
    activeScormApi.LMSCommit('');
    console.info(`[SCORM 1.2 Driver] Status reported: ${status}`);
    return true;
  } catch (err) {
    console.warn('[SCORM 1.2 Driver] Exception during setStatus:', err);
    return false;
  }
}

/**
 * Commits pending data and closes session with LMS.
 */
export function finishScorm(): boolean {
  if (!activeScormApi || !isInitialized || isFinished) {
    console.info('[SCORM 1.2 Standalone] finishScorm called.');
    return false;
  }

  try {
    activeScormApi.LMSCommit('');
    const rawResult = activeScormApi.LMSFinish('');
    const success = rawResult === 'true' || rawResult === true;
    isFinished = true;
    isInitialized = false;
    console.info('[SCORM 1.2 Driver] LMSFinish executed successfully.');
    return success;
  } catch (err) {
    console.warn('[SCORM 1.2 Driver] Exception during LMSFinish:', err);
    return false;
  }
}

/**
 * Diagnostic and testing utilities
 */
export function isScormConnected(): boolean {
  return Boolean(activeScormApi && isInitialized && !isFinished);
}

export function resetScormDriverState(): void {
  activeScormApi = null;
  isInitialized = false;
  isFinished = false;
}
