import { useEffect } from 'react';
import { useLessonStore } from '../../store/useLessonStore';

/**
 * Global keyboard shortcuts hook for Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z).
 * Preserves native undo/redo inside active input/textarea elements.
 */
export function useHistoryKeyboard() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Must have Ctrl or Cmd key
      if (!e.ctrlKey && !e.metaKey) return;

      const target = e.target as HTMLElement | null;
      const isTextInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );

      // Redo: Ctrl + Y or Ctrl + Shift + Z
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y' || e.key === 'Y') {
        if (isTextInput) return;
        const { canRedo, redo } = useLessonStore.getState();
        if (canRedo) {
          e.preventDefault();
          redo();
        }
        return;
      }

      // Undo: Ctrl + Z
      if (e.key === 'z' || e.key === 'Z') {
        if (isTextInput) return;
        const { canUndo, undo } = useLessonStore.getState();
        if (canUndo) {
          e.preventDefault();
          undo();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
