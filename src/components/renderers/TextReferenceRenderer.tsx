import React, { useState, useRef, useEffect } from 'react';
import type { ReferenceTextBlock } from '../../types/schema';
import { Camera, Image as ImageIcon, Upload, Link as LinkIcon, X } from 'lucide-react';

interface Props {
  block: ReferenceTextBlock;
  isEditMode?: boolean;
  onChange?: (updated: ReferenceTextBlock) => void;
}

export const TextReferenceRenderer: React.FC<Props> = ({
  block,
  isEditMode = false,
  onChange,
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        onChange?.({ ...block, imageUrl: result });
        setIsPickerOpen(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Specific paste handler for the image upload modal to stop bubbling immediately
  const handleModalPaste = (e: React.ClipboardEvent) => {
    e.stopPropagation();
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          processImageFile(file);
          break;
        }
      }
    }
  };

  // Capture-phase native listener when modal is open to isolate event before window/OCR sees it
  useEffect(() => {
    if (!isPickerOpen) return;

    const handleNativeCapturePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (ev) => {
              const result = ev.target?.result as string;
              if (result) {
                onChange?.({ ...block, imageUrl: result });
                setIsPickerOpen(false);
              }
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handleNativeCapturePaste, true);
    return () => {
      window.removeEventListener('paste', handleNativeCapturePaste, true);
    };
  }, [isPickerOpen, block, onChange]);

  const handleContainerPaste = (e: React.ClipboardEvent) => {
    if (!isEditMode) return;
    // Don't hijack normal text pasting inside input or textarea
    const target = e.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
      return;
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.stopPropagation();
          e.preventDefault();
          processImageFile(file);
          break;
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    e.target.value = '';
  };

  const handleApplyUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) {
      setUrlError('Introduce una URL válida que empiece por http:// o https://');
      return;
    }
    setUrlError('');
    onChange?.({ ...block, imageUrl: trimmed });
    setUrlInput('');
    setIsPickerOpen(false);
  };

  const handleRemoveImage = () => {
    const updated = { ...block };
    delete updated.imageUrl;
    onChange?.(updated);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isEditMode) return;
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file);
    }
  };

  return (
    <div
      onPaste={handleContainerPaste}
      onDragOver={(e) => {
        if (!isEditMode) return;
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
      className={`bg-white border rounded-2xl p-5 h-full flex flex-col shadow-xs transition-colors relative ${
        isDraggingOver ? 'border-indigo-500 bg-indigo-50/20 ring-2 ring-indigo-200' : 'border-slate-200/90'
      }`}
    >
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header Bar in Edit Mode */}
      {isEditMode && (
        <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Lectura / Contexto
          </span>
          <div className="flex items-center gap-1.5">
            {block.imageUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200/80 transition cursor-pointer"
                  title="Cambiar imagen de referencia"
                >
                  <Camera className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Cambiar Imagen</span>
                </button>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition cursor-pointer"
                  title="Eliminar imagen"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Quitar</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsPickerOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 rounded-lg border border-indigo-200/80 transition cursor-pointer"
                title="Añadir imagen de portada o apoyo contextual (Ctrl+V soportado)"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Añadir Imagen</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Title */}
      {isEditMode ? (
        <input
          type="text"
          value={block.title || ''}
          placeholder="Título de la lectura o contexto..."
          onChange={(e) => onChange?.({ ...block, title: e.target.value })}
          className="text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 mb-3 outline-none focus:border-indigo-500 focus:bg-white transition"
        />
      ) : (
        block.title && (
          <h3 className="text-base font-bold text-slate-900 mb-3 tracking-tight">
            {block.title}
          </h3>
        )
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pr-1">
        {isEditMode ? (
          /* Edit Mode: Clean structured flow with preview card and textarea */
          <div className="flex flex-col gap-3 h-full">
            {block.imageUrl && (
              <div className="w-fit max-w-full mx-auto sm:mx-0">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-md shadow-slate-200/50 dark:shadow-none relative group transition-all">
                  <img
                    src={block.imageUrl}
                    alt={block.title || 'Context reference illustration'}
                    className="object-contain max-h-60 w-auto mx-auto rounded-xl block"
                    loading="lazy"
                  />
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition z-10">
                    <button
                      type="button"
                      onClick={() => setIsPickerOpen(true)}
                      className="px-2.5 py-1 bg-white/95 hover:bg-white text-slate-700 text-xs font-semibold rounded-lg shadow-sm border border-slate-200 backdrop-blur-xs flex items-center gap-1 cursor-pointer transition"
                      title="Cambiar imagen"
                    >
                      <Camera className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Cambiar</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-1 bg-white/95 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg shadow-sm border border-slate-200 backdrop-blur-xs cursor-pointer transition"
                      title="Quitar imagen"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
            <textarea
              value={block.content}
              onChange={(e) => onChange?.({ ...block, content: e.target.value })}
              placeholder="Escribe el pasaje de lectura, diálogo o explicación..."
              rows={7}
              className="w-full flex-1 min-h-[140px] text-sm leading-relaxed text-slate-700 bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 outline-none focus:border-indigo-500 focus:bg-white resize-none"
            />
          </div>
        ) : (
          /* Student / Preview Mode: Editorial magazine/textbook layout with floating picture frame */
          <div className="text-sm leading-relaxed text-slate-700">
            {block.imageUrl && (
              <div className="sm:float-right sm:ml-4 sm:mb-3 mb-4 w-full sm:w-auto max-w-full sm:max-w-[48%] flex-shrink-0">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-md shadow-slate-200/50 dark:shadow-none relative group transition-all">
                  <img
                    src={block.imageUrl}
                    alt={block.title || 'Context reference illustration'}
                    className="object-contain max-h-60 w-auto mx-auto rounded-xl block"
                    loading="lazy"
                  />
                </div>
              </div>
            )}
            <div className="space-y-3 whitespace-pre-line">
              {block.content}
            </div>
            {/* Clearfix */}
            <div className="clear-both" />
          </div>
        )}
      </div>

      {/* Image Picker Modal / Popover */}
      {isPickerOpen && (
        <div
          data-modal="image-upload"
          onPaste={handleModalPaste}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onPaste={handleModalPaste}
            className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-5 space-y-4 animate-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Imagen de Apoyo / Portada
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Ilustra la lectura o material de contexto
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPickerOpen(false);
                  setUrlError('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Option 1: File Upload / Clipboard drop */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onPaste={handleModalPaste}
              className="border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl p-4 text-center cursor-pointer transition group"
            >
              <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-600 mx-auto mb-2 transition" />
              <p className="text-xs font-semibold text-slate-700 group-hover:text-indigo-700">
                Subir archivo desde el equipo
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                O pega con <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-600 font-mono text-[10px]">Ctrl + V</kbd> directamente
              </p>
            </div>

            {/* Option 2: Direct URL */}
            <form onSubmit={handleApplyUrl} className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-slate-400" />
                <span>O introduce una URL de imagen:</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    if (urlError) setUrlError('');
                  }}
                  placeholder="https://ejemplo.com/imagen.jpg"
                  className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:bg-white transition"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap"
                >
                  Aplicar
                </button>
              </div>
              {urlError && (
                <p className="text-[11px] text-rose-600 font-medium">{urlError}</p>
              )}
            </form>

            {/* Cancel Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsPickerOpen(false);
                  setUrlError('');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
