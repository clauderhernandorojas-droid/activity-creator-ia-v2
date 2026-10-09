import React, { useState, useRef } from 'react';
import type { ReferenceMediaBlock } from '../../types/schema';
import { 
  Volume2, 
  Play, 
  Pause, 
  FileText, 
  Maximize2, 
  Upload, 
  Trash2, 
  Image as ImageIcon,
  ZoomIn
} from 'lucide-react';
import { ImageLightboxModal } from '../common/ImageLightboxModal';
import { compressImageBase64 } from '../../core/utils/imageCompressor';

interface Props {
  block: ReferenceMediaBlock;
  isEditMode?: boolean;
  slideTitle?: string;
  onChange?: (updated: ReferenceMediaBlock | null) => void;
  onRemove?: () => void;
}

export const MediaReferenceRenderer: React.FC<Props> = ({
  block,
  isEditMode = false,
  onChange,
  onRemove,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove();
    } else {
      onChange?.(null);
    }
  };

  const handleProcessImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        const rawUrl = event.target.result as string;
        const compressed = await compressImageBase64(rawUrl);
        onChange?.({
          ...block,
          url: compressed,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessImageFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isEditMode || block.mediaType !== 'image') return;
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessImageFile(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (!isEditMode || block.mediaType !== 'image') return;
    const target = e.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          e.stopPropagation();
          handleProcessImageFile(file);
          return;
        }
      }
    }
  };

  // ----------------------------------------------------
  // A. RENDERER FOR IMAGE MEDIA TYPE
  // ----------------------------------------------------
  if (block.mediaType === 'image') {
    return (
      <div 
        onPaste={handlePaste}
        onDragOver={(e) => {
          if (!isEditMode) return;
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className={`bg-white border rounded-2xl p-4 sm:p-5 flex flex-col shadow-xs transition relative ${
          isDraggingOver 
            ? 'border-indigo-500 bg-indigo-50/20 ring-2 ring-indigo-200' 
            : 'border-slate-200/90'
        }`}
      >
        {/* Hidden File Input for Image Replacement */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Header Bar */}
        <div className="flex items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-100">
          <div className="flex-1">
            {isEditMode ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Referencia Visual</span>
                </div>
                <input
                  type="text"
                  value={block.title || ''}
                  placeholder="Título o pie de la imagen..."
                  onChange={(e) => onChange?.({ ...block, title: e.target.value })}
                  className="w-full text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 focus:border-indigo-600 focus:bg-white outline-none transition"
                />
              </div>
            ) : (
              <div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md mb-1">
                  <ImageIcon className="w-3 h-3 text-indigo-600" />
                  <span>Material Visual</span>
                </span>
                {block.title && (
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    {block.title}
                  </h3>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Expand / Zoom Button for All Users */}
            <button
              type="button"
              onClick={() => setIsLightboxOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
              title="Ampliar imagen con controles de zoom (pantalla completa)"
            >
              <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Ampliar</span>
            </button>

            {isEditMode && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200 transition cursor-pointer"
                  title="Reemplazar esta imagen por otro archivo"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="hidden sm:inline">Reemplazar</span>
                </button>

                <button
                  type="button"
                  onClick={handleRemove}
                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition cursor-pointer"
                  title="Eliminar imagen de referencia (restaura ancho completo)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Main Image Display */}
        <div 
          onClick={() => setIsLightboxOpen(true)}
          className="relative group rounded-xl overflow-hidden bg-slate-900/5 border border-slate-200/80 p-1.5 flex items-center justify-center cursor-zoom-in transition hover:shadow-xs min-h-[200px] max-h-[520px]"
        >
          <img
            src={block.url || 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600&auto=format&fit=crop&q=60'}
            alt={block.title || 'Imagen de consulta'}
            className="w-full max-h-[500px] object-contain rounded-lg transition-transform duration-200 group-hover:scale-[1.01]"
            loading="lazy"
          />

          {/* Hover Zoom Badge Overlay */}
          <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none rounded-xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 text-white text-xs font-semibold rounded-full shadow-lg backdrop-blur-xs">
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Haz clic para ampliar con zoom</span>
            </span>
          </div>
        </div>

        {/* Optional Caption / Explanatory Note */}
        {isEditMode ? (
          <div className="mt-3 space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Nota explicativa o pie de foto (opcional):
            </label>
            <textarea
              value={block.transcript || ''}
              placeholder="Instrucciones sobre la imagen o contexto..."
              rows={2}
              onChange={(e) => onChange?.({ ...block, transcript: e.target.value })}
              className="w-full text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2 outline-none focus:border-indigo-600 focus:bg-white resize-none"
            />
          </div>
        ) : (
          block.transcript && (
            <div className="mt-2.5 p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 leading-relaxed">
              {block.transcript}
            </div>
          )
        )}

        {/* Fullscreen Lightbox Modal */}
        <ImageLightboxModal
          isOpen={isLightboxOpen}
          imageUrl={block.url}
          title={block.title || 'Material Visual de Consulta'}
          onClose={() => setIsLightboxOpen(false)}
        />
      </div>
    );
  }

  // ----------------------------------------------------
  // B. RENDERER FOR AUDIO MEDIA TYPE (Listening)
  // ----------------------------------------------------
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 h-full flex flex-col shadow-xs">
      {/* Title */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {isEditMode ? (
          <input
            type="text"
            value={block.title || ''}
            placeholder="Título del audio de comprensión..."
            onChange={(e) => onChange?.({ ...block, title: e.target.value })}
            className="flex-1 text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500 focus:bg-white"
          />
        ) : (
          block.title && (
            <h3 className="text-base font-bold text-slate-900">
              {block.title}
            </h3>
          )
        )}

        {isEditMode && (
          <button
            type="button"
            onClick={handleRemove}
            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition cursor-pointer"
            title="Quitar audio de referencia"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* URL in edit mode */}
      {isEditMode && (
        <input
          type="text"
          value={block.url}
          placeholder="URL del recurso de audio..."
          onChange={(e) => onChange?.({ ...block, url: e.target.value })}
          className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mb-3 outline-none focus:border-indigo-500"
        />
      )}

      {/* Media Player UI */}
      <div className="flex-1 flex flex-col justify-center items-center p-5 bg-slate-50 rounded-2xl border border-slate-200/80">
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
              className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-xs transition transform active:scale-95 cursor-pointer"
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
              className="text-xs flex items-center justify-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-semibold mx-auto transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{showTranscript ? 'Ocultar Transcripción' : 'Ver Transcripción'}</span>
            </button>
          )}
        </div>
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
