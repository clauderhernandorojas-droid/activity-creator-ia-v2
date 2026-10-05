import React, { useState } from 'react';
import type { ReferenceMediaBlock } from '../../types/schema';
import { Volume2, Play, Pause, FileText } from 'lucide-react';

interface Props {
  block: ReferenceMediaBlock;
  isEditMode?: boolean;
  onChange?: (updated: ReferenceMediaBlock) => void;
}

export const MediaReferenceRenderer: React.FC<Props> = ({
  block,
  isEditMode = false,
  onChange,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 h-full flex flex-col shadow-xs">
      {/* Title */}
      {isEditMode ? (
        <input
          type="text"
          value={block.title || ''}
          placeholder="Título del audio o imagen..."
          onChange={(e) => onChange?.({ ...block, title: e.target.value })}
          className="text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 mb-3 outline-none focus:border-indigo-500 focus:bg-white"
        />
      ) : (
        block.title && (
          <h3 className="text-base font-bold text-slate-900 mb-2.5">
            {block.title}
          </h3>
        )
      )}

      {/* URL in edit mode */}
      {isEditMode && (
        <input
          type="text"
          value={block.url}
          placeholder="URL del recurso multimedia..."
          onChange={(e) => onChange?.({ ...block, url: e.target.value })}
          className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mb-3 outline-none focus:border-indigo-500"
        />
      )}

      {/* Media Player UI */}
      <div className="flex-1 flex flex-col justify-center items-center p-5 bg-slate-50 rounded-2xl border border-slate-200/80">
        {block.mediaType === 'audio' ? (
          <div className="w-full max-w-sm space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Volume2 className="w-7 h-7" />
            </div>

            <div className="space-y-0.5">
              <p className="text-sm font-bold text-slate-800">
                {block.title || 'Audio de Comprensión (Listening)'}
              </p>
              <p className="text-xs text-slate-500 font-medium">
                {isPlaying ? 'Reproduciendo audio...' : 'Listo para reproducir'}
              </p>
            </div>

            {/* Play Button */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={togglePlay}
                className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-xs transition transform active:scale-95"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
            </div>

            {/* Simulated Progress */}
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div
                className={`bg-indigo-600 h-full transition-all duration-300 ${
                  isPlaying ? 'w-2/3 animate-pulse' : 'w-1/4'
                }`}
              />
            </div>

            {/* Transcript Toggle */}
            {block.transcript && (
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="text-xs flex items-center justify-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-semibold mx-auto transition"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{showTranscript ? 'Ocultar Transcripción' : 'Ver Transcripción'}</span>
              </button>
            )}
          </div>
        ) : (
          <img
            src={block.url || 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600&auto=format&fit=crop&q=60'}
            alt="Support visual"
            className="max-h-52 rounded-xl object-contain border border-slate-200 shadow-xs"
          />
        )}
      </div>

      {/* Transcript Text */}
      {showTranscript && block.transcript && (
        <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 whitespace-pre-line max-h-32 overflow-y-auto">
          <p className="font-bold text-slate-500 uppercase tracking-wider mb-1 text-[10px]">
            Transcripción del Audio:
          </p>
          {block.transcript}
        </div>
      )}

      {isEditMode && (
        <textarea
          value={block.transcript || ''}
          placeholder="Transcripción del audio (opcional)..."
          rows={2}
          onChange={(e) => onChange?.({ ...block, transcript: e.target.value })}
          className="mt-3 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 resize-none"
        />
      )}
    </div>
  );
};
