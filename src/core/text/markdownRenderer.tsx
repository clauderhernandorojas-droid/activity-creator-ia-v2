import React from 'react';

/**
 * Parses and renders basic inline Markdown (bold, italic, code) into styled React elements.
 * Correctly strips literal asterisks from markers like `**a)**`, `**b)**`, `**Important:**`.
 */
export function renderFormattedMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  // Split by markdown bold (**text** or __text__), inline code (`code`), italic (*text*), or canonical position markers ([ 1 ], [ 2 ], etc.)
  const tokens = text.split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|\[\s*\d{1,2}\s*\])/g);

  return tokens.map((token, idx) => {
    if (!token) return null;

    // Canonical position markers: [ 1 ], [ 2 ], etc.
    const posMatch = token.match(/^\[\s*(\d{1,2})\s*\]$/);
    if (posMatch) {
      return (
        <span
          key={idx}
          className="inline-flex items-center justify-center px-2 py-0.5 mx-1 font-bold text-xs bg-indigo-100 text-indigo-700 rounded-md border border-indigo-200/90 shadow-2xs select-all align-middle"
        >
          [ {posMatch[1]} ]
        </span>
      );
    }

    // Bold (**...** or __...__)
    if (
      (token.startsWith('**') && token.endsWith('**') && token.length >= 4) ||
      (token.startsWith('__') && token.endsWith('__') && token.length >= 4)
    ) {
      const cleanContent = token.slice(2, -2);
      return (
        <strong key={idx} className="font-bold text-slate-900">
          {cleanContent}
        </strong>
      );
    }

    // Inline Code (`...`)
    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      const cleanContent = token.slice(1, -1);
      return (
        <code key={idx} className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-[0.9em] font-mono">
          {cleanContent}
        </code>
      );
    }

    // Italic (*...*)
    if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
      const cleanContent = token.slice(1, -1);
      return (
        <em key={idx} className="italic text-slate-800">
          {cleanContent}
        </em>
      );
    }

    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}
