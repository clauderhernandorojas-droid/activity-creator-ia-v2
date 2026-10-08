import React, { useState, useRef, useEffect } from 'react';
import type { ReferenceTextBlock } from '../../types/schema';
import { Camera, Image as ImageIcon, Upload, Link as LinkIcon, X, Plus } from 'lucide-react';
import { compressImageBase64 } from '../../core/utils/imageCompressor';
import { useLessonStore } from '../../store/useLessonStore';

const MAX_IMAGES = 4;

interface Props {
  block: ReferenceTextBlock;
  isEditMode?: boolean;
  slideTitle?: string;
  onChange?: (updated: ReferenceTextBlock) => void;
}

export const TextReferenceRenderer: React.FC<Props> = ({
  block,
  isEditMode = false,
  slideTitle,
  onChange,
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unified normalization
  const activeImages = React.useMemo(() => {
    return block.images && block.images.length > 0
      ? block.images
      : (block.imageUrl ? [block.imageUrl] : []);
  }, [block.images, block.imageUrl]);

  // Check if content represents substantial transcribed reading text (>= 30 words)
  const isSubstantialReadingText = React.useMemo(() => {
    const words = (block.content || '').trim().split(/\s+/).filter(Boolean).length;
    return words >= 30;
  }, [block.content]);

  // Determine if an image is identical to the clipping from which the reading text originated
  const isOriginReadingClipping = React.useMemo(() => {
    if (!isSubstantialReadingText || activeImages.length === 0) return false;
    const targetImg = activeImages[0];
    if (!targetImg) return false;

    // 1. Check against extractedBlocks source clippings
    const extractedBlocks = useLessonStore.getState().extractedBlocks;
    for (const b of extractedBlocks) {
      if (b.sourceImageSnippetUrl && b.sourceImageSnippetUrl === targetImg) return true;
      if (Array.isArray(b.sourceImages) && b.sourceImages.includes(targetImg)) return true;
      if (b.parsedData?.imageUrl && b.parsedData.imageUrl === targetImg) return true;
      if (Array.isArray(b.parsedData?.images) && b.parsedData.images.includes(targetImg)) return true;
    }

    // 2. If it is a raw captured data URL and text is substantial reading, it is a clipping of the page
    if (targetImg.startsWith('data:image/') && targetImg.length > 500) {
      return true;
    }

    return false;
  }, [isSubstantialReadingText, activeImages]);

  const paragraphs = React.useMemo(() => {
    if (!block.content) return [];
    const normalized = block.content.replace(/\r\n/g, '\n');
    // Split by 2 or more consecutive newlines into distinct paragraphs / sections
    const blocks = normalized
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (blocks.length > 0) {
      return blocks;
    }
    return [normalized.trim()];
  }, [block.content]);

  const addImages = (newImagesList: string[]) => {
    if (newImagesList.length === 0) return;
    const combined = [...activeImages, ...newImagesList].slice(0, MAX_IMAGES);
    onChange?.({
      ...block,
      images: combined,
      imageUrl: combined[0] ?? undefined,
    });
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const nextImages = activeImages.filter((_, idx) => idx !== indexToRemove);
    const updated: ReferenceTextBlock = {
      ...block,
      images: nextImages.length > 0 ? nextImages : undefined,
      imageUrl: nextImages.length > 0 ? nextImages[0] : undefined,
    };
    if (nextImages.length === 0) {
      delete updated.imageUrl;
      delete updated.images;
    }
    onChange?.(updated);
  };

  const handleClearAllImages = () => {
    const updated: ReferenceTextBlock = { ...block };
    delete updated.imageUrl;
    delete updated.images;
    onChange?.(updated);
  };

  const processImageFiles = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    const remainingSlots = MAX_IMAGES - activeImages.length;
    if (remainingSlots <= 0) return;

    const filesToRead = validFiles.slice(0, remainingSlots);
    const promises = filesToRead.map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const res = e.target?.result as string;
          if (res) resolve(res);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(promises).then(async (results) => {
      const valid = results.filter(Boolean);
      if (valid.length > 0) {
        const compressed = await Promise.all(valid.map((img) => compressImageBase64(img)));
        addImages(compressed);
      }
    });
  };

  // Specific paste handler for the image upload modal to stop bubbling immediately
  const handleModalPaste = (e: React.ClipboardEvent) => {
    e.stopPropagation();
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      processImageFiles(files);
    }
  };

  const processImageFilesRef = useRef(processImageFiles);
  useEffect(() => {
    processImageFilesRef.current = processImageFiles;
  });

  // Capture-phase native listener when modal is open to isolate event before window/OCR sees it
  useEffect(() => {
    if (!isPickerOpen) return;

    const handleNativeCapturePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        processImageFilesRef.current(files);
      }
    };

    window.addEventListener('paste', handleNativeCapturePaste, true);
    return () => {
      window.removeEventListener('paste', handleNativeCapturePaste, true);
    };
  }, [isPickerOpen]);

  const handleContainerPaste = (e: React.ClipboardEvent) => {
    if (!isEditMode) return;
    // Don't hijack normal text pasting inside input or textarea
    const target = e.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
      return;
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.stopPropagation();
      e.preventDefault();
      processImageFiles(files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processImageFiles(e.target.files);
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
    if (activeImages.length >= MAX_IMAGES) {
      setUrlError(`Límite de ${MAX_IMAGES} imágenes alcanzado`);
      return;
    }
    setUrlError('');
    addImages([trimmed]);
    setUrlInput('');
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isEditMode) return;
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFiles(e.dataTransfer.files);
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
      className={`bg-white border border-slate-200/90 text-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col shadow-xs transition-colors relative ${
        isDraggingOver ? 'border-indigo-500 bg-indigo-50/20 ring-2 ring-indigo-200' : ''
      }`}
    >
      {/* Hidden File Input supporting multiple files */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        multiple
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
            {activeImages.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200/80 transition cursor-pointer"
                  title="Gestionar o añadir más imágenes de referencia"
                >
                  <Camera className="w-3.5 h-3.5 text-indigo-500" />
                  <span>
                    {activeImages.length < MAX_IMAGES
                      ? `Añadir Imagen (${activeImages.length}/${MAX_IMAGES})`
                      : `Imágenes (${activeImages.length}/${MAX_IMAGES})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleClearAllImages}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition cursor-pointer"
                  title="Eliminar todas las imágenes"
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
          placeholder="Título de la lectura o contexto (opcional)..."
          onChange={(e) => onChange?.({ ...block, title: e.target.value })}
          className="text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 mb-3 outline-none focus:border-indigo-500 focus:bg-white transition shrink-0"
        />
      ) : (
        block.title && (!slideTitle || block.title.trim().toLowerCase() !== slideTitle.trim().toLowerCase()) && (
          <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-3 tracking-tight shrink-0">
            {block.title}
          </h3>
        )
      )}

      {/* Content Area */}
      <div className="space-y-4">
        {isEditMode ? (
          /* Edit Mode: Clean structured flow with preview card(s) and textarea */
          <div className="flex flex-col gap-3">
            {activeImages.length === 1 && (
              <div className="w-fit max-w-full mx-auto sm:mx-0">
                <div className="bg-slate-50 p-2 border border-slate-200 rounded-2xl shadow-md shadow-slate-200/50 relative group transition-all">
                  <img
                    src={activeImages[0]}
                    alt={block.title || 'Context reference illustration'}
                    className="object-contain max-h-56 w-auto mx-auto rounded-xl block"
                    loading="lazy"
                  />
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition z-10">
                    <button
                      type="button"
                      onClick={() => setIsPickerOpen(true)}
                      className="px-2.5 py-1 bg-white/95 hover:bg-white text-slate-700 text-xs font-semibold rounded-lg shadow-sm border border-slate-200 backdrop-blur-xs flex items-center gap-1 cursor-pointer transition"
                      title="Gestionar imágenes"
                    >
                      <Camera className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Gestionar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(0)}
                      className="p-1 bg-white/95 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg shadow-sm border border-slate-200 backdrop-blur-xs cursor-pointer transition"
                      title="Quitar imagen"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeImages.length > 1 && (
              <div className="w-full">
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {activeImages.map((src, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50/80 p-2 border border-slate-200/90 rounded-2xl shadow-xs relative group transition-all flex items-center justify-center h-32 w-full overflow-hidden"
                    >
                      <img
                        src={src}
                        alt={`Imagen ${idx + 1}`}
                        className="w-full h-full object-contain rounded-xl block select-none"
                        loading="lazy"
                      />
                      <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-slate-900/60 text-white text-[10px] font-semibold rounded-md backdrop-blur-xs">
                        #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute top-2 right-2 p-1 bg-white/95 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg shadow-sm border border-slate-200 opacity-90 group-hover:opacity-100 backdrop-blur-xs cursor-pointer transition"
                        title="Quitar esta imagen"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {activeImages.length < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={() => setIsPickerOpen(true)}
                      className="border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-2xl p-4 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 transition cursor-pointer min-h-[120px]"
                      title="Añadir otra imagen"
                    >
                      <Plus className="w-5 h-5 mb-1" />
                      <span className="text-xs font-medium">Añadir otra</span>
                      <span className="text-[10px] text-slate-400">({activeImages.length}/{MAX_IMAGES})</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <textarea
              value={block.content}
              onChange={(e) => onChange?.({ ...block, content: e.target.value })}
              placeholder="Escribe el pasaje de lectura, diálogo o explicación..."
              rows={7}
              className="w-full flex-1 min-h-[140px] text-sm leading-relaxed text-slate-700 bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 outline-none focus:border-indigo-500 focus:bg-white resize-y whitespace-pre-line font-sans"
            />
          </div>
        ) : (
          /* Student / Preview Mode: Responsive Adaptive Gallery or Editorial layout */
          <div className="text-sm sm:text-base leading-relaxed text-slate-700">
            {/* Visual Stimuli / Gallery when multiple images OR when text content is short */}
            {!isOriginReadingClipping && (activeImages.length > 1 || (activeImages.length === 1 && (paragraphs.length <= 2 && (block.content || '').length < 300))) ? (
              <div className="w-full mb-5">
                {activeImages.length === 1 ? (
                  <div className="bg-slate-50/80 p-2 sm:p-3 border border-slate-200/90 rounded-2xl shadow-xs max-w-2xl mx-auto h-64 sm:h-72 md:h-80 w-full flex items-center justify-center overflow-hidden">
                    <img
                      src={activeImages[0]}
                      alt={block.title || 'Estímulo visual'}
                      className="w-full h-full object-contain rounded-xl block select-none"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className={`grid gap-3 sm:gap-4 ${
                    activeImages.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3'
                  }`}>
                    {activeImages.map((src, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-50/80 p-2 sm:p-2.5 border border-slate-200/90 rounded-2xl shadow-xs h-60 sm:h-64 md:h-72 w-full flex items-center justify-center group hover:shadow-md transition-all relative overflow-hidden"
                      >
                        <img
                          src={src}
                          alt={`${block.title || 'Estímulo visual'} (${idx + 1})`}
                          className="w-full h-full object-contain rounded-xl block select-none"
                          loading="lazy"
                        />
                        <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 bg-slate-900/70 text-white text-[11px] font-semibold rounded-lg backdrop-blur-md shadow-xs pointer-events-none">
                          Foto #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (!isOriginReadingClipping && activeImages.length === 1) ? (
              /* Single image with long editorial reading text: sleek right float (only for genuine independent illustrations) */
              <div className="sm:float-right sm:ml-5 sm:mb-3 mb-4 w-full sm:w-auto max-w-full sm:max-w-[46%] flex-shrink-0">
                <div className="bg-slate-50/80 p-2 border border-slate-200/90 rounded-2xl shadow-md shadow-slate-200/50 h-56 sm:h-64 flex items-center justify-center overflow-hidden relative group transition-all">
                  <img
                    src={activeImages[0]}
                    alt={block.title || 'Estímulo visual'}
                    className="w-full h-full object-contain rounded-xl block select-none"
                    loading="lazy"
                  />
                </div>
              </div>
            ) : null}

            {block.content && (
              <div className="space-y-4 font-normal text-slate-800 leading-relaxed text-sm sm:text-[15px] whitespace-pre-line break-words">
                {paragraphs.length > 0 ? (
                  paragraphs.map((paragraph, idx) => (
                    <p key={idx} className="whitespace-pre-line break-words leading-relaxed">
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p className="whitespace-pre-line break-words leading-relaxed">{block.content}</p>
                )}
              </div>
            )}
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
            className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-5 space-y-4 animate-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Imágenes de Apoyo / Portada
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {activeImages.length > 0
                      ? `${activeImages.length} de ${MAX_IMAGES} cargadas • Sube, pega con Ctrl+V o añade URL`
                      : `Hasta ${MAX_IMAGES} imágenes • Sube, pega con Ctrl+V o añade URL`}
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

            {/* Gallery of loaded images */}
            {activeImages.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Imágenes actuales ({activeImages.length}/{MAX_IMAGES}):
                  </span>
                  {activeImages.length > 1 && (
                    <button
                      type="button"
                      onClick={handleClearAllImages}
                      className="text-[11px] text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                    >
                      Quitar todas
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1.5 border border-slate-100 rounded-xl bg-slate-50/60">
                  {activeImages.map((src, idx) => (
                    <div
                      key={idx}
                      className="relative group rounded-xl overflow-hidden border border-slate-200 bg-white shadow-xs aspect-video flex items-center justify-center"
                    >
                      <img
                        src={src}
                        alt={`Imagen ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-slate-900/75 text-white text-[10px] font-medium rounded-md backdrop-blur-xs">
                        #{idx + 1} {idx === 0 ? '(Principal)' : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute top-1.5 right-1.5 p-1 bg-white/95 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg shadow-sm border border-slate-200 transition cursor-pointer"
                        title="Eliminar esta imagen"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add New Image Controls (if under max) */}
            {activeImages.length < MAX_IMAGES ? (
              <>
                {/* Option 1: File Upload / Clipboard drop */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onPaste={handleModalPaste}
                  className="border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl p-3.5 text-center cursor-pointer transition group"
                >
                  <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 mx-auto mb-1.5 transition" />
                  <p className="text-xs font-semibold text-slate-700 group-hover:text-indigo-700">
                    Subir archivo(s) desde el equipo
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    O pega con <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-600 font-mono text-[10px]">Ctrl + V</kbd> directamente
                  </p>
                </div>

                {/* Option 2: Direct URL */}
                <form onSubmit={handleApplyUrl} className="space-y-1.5">
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
                      Añadir
                    </button>
                  </div>
                  {urlError && (
                    <p className="text-[11px] text-rose-600 font-medium">{urlError}</p>
                  )}
                </form>
              </>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-xs font-medium text-amber-800">
                  Límite de {MAX_IMAGES} imágenes alcanzado para esta lectura.
                </p>
                <p className="text-[11px] text-amber-600 mt-0.5">
                  Elimina una imagen de la galería superior para poder añadir otra.
                </p>
              </div>
            )}

            {/* Done / Close Button */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsPickerOpen(false);
                  setUrlError('');
                }}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition cursor-pointer shadow-xs"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
