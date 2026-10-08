import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Play, Pause, Headphones, RotateCcw, Trash2, Edit3, Check } from 'lucide-react';
import { useSessionStore } from '../../store/useSessionStore';

interface VerificationAudioPlayerProps {
  audioUrl?: string;
  audioLabel?: string;
  isVerificationActive?: boolean;
  isEvaluated?: boolean;
  isEditMode?: boolean;
  onAudioChange?: (url: string, label?: string) => void;
  onRemoveAudio?: () => void;
  onActivateVerification?: () => void;
}

export const VerificationAudioPlayer: React.FC<VerificationAudioPlayerProps> = ({
  audioUrl,
  audioLabel,
  isVerificationActive = false,
  isEvaluated = false,
  isEditMode = false,
  onAudioChange,
  onRemoveAudio,
  onActivateVerification,
}) => {
  const verificationAudioTrigger = useSessionStore((s) => s.verificationAudioTrigger);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Edit mode local states
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editLabel, setEditLabel] = useState(audioLabel || '');
  const [editUrl, setEditUrl] = useState(audioUrl || '');

  const handlePlay = useCallback(() => {
    if (!audioUrl) return;
    onActivateVerification?.();

    if (hasError || !audioRef.current?.src || audioRef.current.src.includes('undefined')) {
      // Use graceful simulated playback
      setIsSimulating(true);
      if (!duration) setDuration(45);
      setIsPlaying(true);
      return;
    }

    if (audioRef.current) {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsSimulating(false);
        })
        .catch((err) => {
          console.warn('[VerificationAudioPlayer] Audio play failed or blocked, falling back to simulated playback:', err);
          setIsSimulating(true);
          if (!duration) setDuration(45);
          setIsPlaying(true);
        });
    }
  }, [audioUrl, duration, hasError, onActivateVerification]);

  const handlePause = useCallback(() => {
    if (audioRef.current && !isSimulating) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, [isSimulating]);

  // When verificationAudioTrigger changes in useSessionStore, start playback
  useEffect(() => {
    if (verificationAudioTrigger > 0) {
      const timer = setTimeout(() => {
        handlePlay();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [verificationAudioTrigger, handlePlay]);

  // Simulation interval for mock/placeholder URLs that don't load a real MP3 file
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isSimulating && isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 1;
          const maxSimTime = duration || 45;
          if (next >= maxSimTime) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSimulating, isPlaying, duration]);

  const togglePlay = () => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && !isSimulating) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.duration && !isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && !isNaN(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
      setHasError(false);
    }
  };

  const handleAudioError = () => {
    setHasError(true);
    // If duration not set, simulate 45s track
    if (!duration) setDuration(45);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (audioRef.current && !isSimulating) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const handleRestart = () => {
    setCurrentTime(0);
    if (audioRef.current && !isSimulating) {
      audioRef.current.currentTime = 0;
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = Math.floor(secs % 60);
    return `${mins}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  const openSettings = () => {
    setEditLabel(audioLabel || '');
    setEditUrl(audioUrl || '');
    setIsEditingSettings(!isEditingSettings);
  };

  const saveSettings = () => {
    onAudioChange?.(editUrl.trim(), editLabel.trim());
    setIsEditingSettings(false);
  };

  return (
    <div
      className={`w-full mb-6 rounded-2xl border transition-all duration-300 shadow-xs ${
        isVerificationActive && !isEvaluated
          ? 'bg-gradient-to-r from-indigo-50/90 via-sky-50/80 to-indigo-50/90 border-indigo-300 ring-2 ring-indigo-200/50'
          : isEvaluated
          ? 'bg-slate-50/90 border-slate-200'
          : 'bg-indigo-50/40 border-indigo-100 hover:border-indigo-200'
      }`}
    >
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        onError={handleAudioError}
        preload="metadata"
      />

      <div className="p-4 sm:p-5 flex flex-col gap-3.5">
        {/* Header / Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-indigo-100/80">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                isPlaying
                  ? 'bg-indigo-600 text-white shadow-xs animate-pulse'
                  : isVerificationActive
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
              }`}
            >
              <Headphones className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">
                  Audio de Autoverificación
                </span>
                {audioLabel && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-2xs">
                    {audioLabel}
                  </span>
                )}
              </div>

              {/* Status context label */}
              <p className="text-[11px] font-medium text-slate-500">
                {!isVerificationActive && !isEvaluated && (
                  <span>Paso 1: Escribe tus respuestas. Pulsa "Escuchar y Verificar" para autocorrección.</span>
                )}
                {isVerificationActive && !isEvaluated && (
                  <span className="text-indigo-700 font-semibold flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>Paso 2: Autocorrección activa — Escucha y ajusta tus respuestas antes de calificar.</span>
                  </span>
                )}
                {isEvaluated && (
                  <span className="text-emerald-700 font-semibold">
                    Paso 3: Respuestas comprobadas ✓ — Puedes volver a escuchar para practicar la pronunciación.
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Edit Mode Buttons */}
          {isEditMode && (
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                onClick={openSettings}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-white rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
                title="Editar pista o enlace del audio"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditingSettings ? 'Cerrar' : 'Configurar'}</span>
              </button>

              {onRemoveAudio && (
                <button
                  type="button"
                  onClick={onRemoveAudio}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 rounded-lg hover:bg-rose-100 transition cursor-pointer"
                  title="Quitar audio de autoverificación de este bloque"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Edit Settings Drawer (when in edit mode) */}
        {isEditMode && isEditingSettings && (
          <div className="p-3.5 bg-white rounded-xl border border-indigo-200/90 shadow-2xs flex flex-col sm:flex-row items-center gap-3 animate-in fade-in duration-200">
            <div className="w-full sm:w-1/3">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Etiqueta / Pista (ej. R1.2)
              </label>
              <input
                type="text"
                value={editLabel}
                placeholder="R1.2, Track 15..."
                onChange={(e) => setEditLabel(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-600 outline-none font-semibold text-slate-800"
              />
            </div>

            <div className="w-full sm:flex-1">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                URL o ruta del archivo MP3
              </label>
              <input
                type="text"
                value={editUrl}
                placeholder="https://... o /audio/R1.2.mp3"
                onChange={(e) => setEditUrl(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-600 outline-none text-slate-800"
              />
            </div>

            <button
              type="button"
              onClick={saveSettings}
              className="w-full sm:w-auto mt-2 sm:mt-5 flex items-center justify-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Guardar</span>
            </button>
          </div>
        )}

        {/* Audio Controls Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full">
          {/* Play/Pause & Reset buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className={`w-11 h-11 rounded-full flex items-center justify-center text-white transition transform active:scale-95 shadow-xs cursor-pointer ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-600 ring-2 ring-amber-200'
                  : isVerificationActive
                  ? 'bg-indigo-600 hover:bg-indigo-700 ring-2 ring-indigo-300'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
              title={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={handleRestart}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition cursor-pointer"
              title="Reiniciar audio al principio"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Scrubber slider and time display */}
          <div className="flex-1 flex flex-col justify-center w-full gap-1">
            <div className="relative flex items-center w-full">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 transition"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-0.5">
              <span>{formatTime(currentTime)}</span>
              <div className="flex items-center gap-2">
                {hasError && (
                  <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                    Pista reservada (audio de prueba)
                  </span>
                )}
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          {/* Volume toggle */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMute}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition cursor-pointer"
              title={isMuted ? 'Activar sonido' : 'Silenciar'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
