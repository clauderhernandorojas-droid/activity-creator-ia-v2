import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Image as ImageIcon, 
  Upload, 
  Clipboard, 
  Link as LinkIcon, 
  Check, 
  AlertCircle 
} from 'lucide-react';
import { compressImageBase64 } from '../../core/utils/imageCompressor';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAttach: (imageDataUrl: string, title: string) => void;
  currentImageUrl?: string;
  currentTitle?: string;
}

export const ReferenceImageModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onAttach,
  currentImageUrl,
  currentTitle = 'Material Visual de Consulta',
}) => {
  const [selectedImage, setSelectedImage] = useState<string>(currentImageUrl || '');
  const [title, setTitle] = useState<string>(currentTitle || 'Material Visual de Consulta');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecciona un archivo de imagen válido (.png, .jpg, .webp, .svg)');
      return;
    }
    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        try {
          const rawUrl = event.target.result as string;
          const compressed = await compressImageBase64(rawUrl);
          setSelectedImage(compressed);
        } catch (err) {
          console.error('[ReferenceImageModal] Error procesando imagen:', err);
          setErrorMsg('Error al procesar la imagen seleccionada');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle global paste event when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      // Don't intercept paste if typing inside the title or url input
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        if (target.id === 'image-url-input') {
          return;
        }
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault();
          e.stopPropagation();
          const file = items[i].getAsFile();
          if (file) {
            await processFile(file);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleApplyUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) {
      setErrorMsg('Introduce una URL válida que empiece por http:// o https://');
      return;
    }
    setErrorMsg('');
    try {
      if (trimmed.startsWith('data:image/')) {
        const compressed = await compressImageBase64(trimmed);
        setSelectedImage(compressed);
      } else {
        setSelectedImage(trimmed);
      }
      setUrlInput('');
    } catch {
      setErrorMsg('No se pudo cargar la imagen desde la URL');
    }
  };

  const handleConfirm = () => {
    if (!selectedImage) {
      setErrorMsg('Por favor selecciona o pega una imagen primero');
      return;
    }
    onAttach(selectedImage, title.trim() || 'Material Visual de Consulta');
    onClose();
  };

  return (
    <div
      data-modal="image-upload"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div 
        className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                Adjuntar Referencia Visual / Imagen
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Material de consulta que se integrará en layout de doble columna
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Error Message */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Title input */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Título o Etiqueta del Material:
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Diagrama de Gramática, Infografía de Vocabulario..."
              className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 outline-none focus:border-indigo-600 focus:bg-white transition"
            />
          </div>

          {/* If Image Selected -> Preview & Actions */}
          {selectedImage ? (
            <div className="space-y-3">
              <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-900/5 p-2 flex items-center justify-center min-h-[220px] max-h-[340px]">
                <img
                  src={selectedImage}
                  alt="Vista previa de referencia"
                  className="max-h-[320px] max-w-full object-contain rounded-lg shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setSelectedImage('')}
                  className="absolute top-3 right-3 p-1.5 bg-slate-900/70 hover:bg-rose-600 text-white rounded-lg shadow-md transition cursor-pointer"
                  title="Cambiar imagen"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                  <Check className="w-4 h-4" /> Imagen cargada correctamente
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer"
                >
                  Subir otra imagen
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Method Selector Tabs */}
              <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    activeTab === 'upload'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir o Pegar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('url')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    activeTab === 'url'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>Enlace Web (URL)</span>
                </button>
              </div>

              {activeTab === 'upload' ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition ${
                    isDragging
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-slate-300 hover:border-indigo-500 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 shadow-2xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800 mb-1">
                    Haz clic para seleccionar o arrastra una imagen aquí
                  </p>
                  <p className="text-xs text-slate-500 mb-4">
                    Formatos soportados: PNG, JPG, JPEG, WebP o SVG
                  </p>

                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition">
                    <Clipboard className="w-3.5 h-3.5 text-indigo-600" />
                    <span>O presiona Ctrl+V para pegar directamente</span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleApplyUrl} className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">
                      URL directa de la imagen:
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="image-url-input"
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://ejemplo.com/diagrama.jpg"
                        className="flex-1 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-600 focus:bg-white"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                      >
                        Cargar
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selectedImage}
            onClick={handleConfirm}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-xl shadow-xs transition cursor-pointer ${
              selectedImage
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white transform active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>Adjuntar a la Diapositiva</span>
          </button>
        </div>
      </div>
    </div>
  );
};
