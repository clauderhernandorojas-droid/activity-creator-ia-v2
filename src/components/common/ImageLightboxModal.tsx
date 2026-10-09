import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2 
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  imageUrl: string;
  title?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<Props> = ({
  isOpen,
  imageUrl,
  title = 'Material Visual de Consulta',
  onClose,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle ESC key
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

  if (!isOpen || !imageUrl) return null;

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 4));
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(prev - 0.25, 0.5);
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(prev + 0.15, 4));
    } else {
      setZoom((prev) => {
        const next = Math.max(prev - 0.15, 0.5);
        if (next <= 1) {
          setPan({ x: 0, y: 0 });
        }
        return next;
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (zoom > 1) {
      handleResetZoom();
    } else {
      setZoom(2);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between p-4 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in duration-150"
    >
      {/* Top Floating Bar */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl flex items-center justify-between gap-4 px-4 py-3 bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-xl text-white backdrop-blur-sm"
      >
        <div className="flex items-center gap-2 truncate">
          <Maximize2 className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold truncate">
            {title}
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
            title="Reducir zoom (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          
          <span className="text-xs font-mono font-bold text-slate-300 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
            title="Aumentar zoom (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleResetZoom}
            className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
            title="Restablecer tamaño normal (100%)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
            title="Cerrar vista ampliada (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Canvas / Image Stage */}
      <div
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        className="flex-1 w-full flex items-center justify-center overflow-hidden my-3 relative"
        style={{
          cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
        }}
      >
        <img
          src={imageUrl}
          alt={title}
          draggable={false}
          className={`max-w-[90vw] max-h-[75vh] object-contain rounded-xl shadow-2xl pointer-events-auto select-none ${
            isDragging ? '' : 'transition-transform duration-100 ease-out'
          }`}
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          }}
        />
      </div>

      {/* Bottom Hint */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="px-4 py-1.5 bg-slate-900/60 border border-slate-800 rounded-full text-[11px] text-slate-400 backdrop-blur-xs flex items-center gap-3"
      >
        <span>💡 Rueda del ratón para zoom</span>
        <span>•</span>
        <span>Doble clic para alternar escala</span>
        <span>•</span>
        <span>Arrastra para moverte</span>
        <span>•</span>
        <span>ESC para salir</span>
      </div>
    </div>
  );
};
