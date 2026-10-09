import React from 'react';
import { useLessonStore } from '../store/useLessonStore';
import { useSessionStore } from '../store/useSessionStore';
import { INTERACTION_RENDERER_REGISTRY, REFERENCE_RENDERER_REGISTRY } from './renderers/registry';
import { SlideErrorBoundary } from './common/SlideErrorBoundary';
import confetti from 'canvas-confetti';
import type { PedagogicalRole } from '../core/ai/payloadMapper';
import type { ReferenceMediaBlock } from '../types/schema';
import { renderFormattedMarkdown } from '../core/text/markdownRenderer';
import { isSubstantialTextOverlap, isConcatenationOfItems } from '../core/text/textDeduplication';
import { ReferenceImageModal } from './modals/ReferenceImageModal';
import { 
  CheckCircle2, 
  RotateCcw, 
  Award, 
  BookOpen, 
  PenTool, 
  CheckSquare, 
  FolderGit2, 
  ListOrdered, 
  Sparkles,
  Plus,
  Wand2,
  Headphones,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';

interface FormatSwitchOption {
  id: PedagogicalRole;
  label: string;
  icon: string;
}

const FORMAT_SWITCH_OPTIONS: FormatSwitchOption[] = [
  { id: 'interaction_inputs', label: 'Rellenar', icon: '📝' },
  { id: 'interaction_selection', label: 'Selección', icon: '☑️' },
  { id: 'interaction_buckets', label: 'Buckets', icon: '🗂️' },
  { id: 'interaction_sequence', label: 'Secuencia', icon: '🔀' },
  { id: 'interaction_writing', label: 'Escritura', icon: '✍️' },
  { id: 'reference_text', label: 'Referencia', icon: '📖' },
];

function generateReferenceImageId(): string {
  return `ref-img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const Canvas: React.FC = () => {
  const {
    lesson,
    addSlide,
    updateSlideTitle,
    updateSlideSubtitle,
    updateInteractionBlock,
    updateReferenceBlock,
    convertSlideRole,
    updateSlideIsGraded,
  } = useLessonStore();

  const {
    currentSlideId,
    setCurrentSlideId,
    mode,
    studentAnswers,
    studentEvaluation,
    isAiEvaluating,
    isVerificationAudioActive,
    setStudentAnswer,
    checkCurrentSlideAnswers,
    resetStudentAnswers,
    triggerPlayVerificationAudio,
    toggleReferenceDrawer,
    setIsOcrDrawerOpen,
  } = useSessionStore();

  const [isImageModalOpen, setIsImageModalOpen] = React.useState(false);

  const currentSlide = lesson.slides.find((s) => s.id === currentSlideId);

  if (!currentSlide || lesson.slides.length === 0) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 w-full bg-slate-100 select-none min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-2xl mx-auto bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-12 flex flex-col items-center text-center shadow-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mb-5 shadow-xs">
            <Sparkles className="w-8 h-8" />
          </div>
          
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
            Lienzo en blanco listo para digitalizar tu libro
          </h2>
          
          <p className="text-sm sm:text-base text-slate-500 max-w-lg mb-8 leading-relaxed">
            Empieza desde cero importando un recorte de tu libro de texto mediante IA o añade una diapositiva en blanco para estructurar tu lección manualmente.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => setIsOcrDrawerOpen(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-xs transition transform active:scale-95"
            >
              <Wand2 className="w-4 h-4" />
              <span>🪄 Digitalizar Recorte de Libro (Ctrl+V)</span>
            </button>

            <button
              onClick={() => {
                const newId = addSlide('split_50_50');
                setCurrentSlideId(newId);
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-xl border border-slate-200 shadow-2xs transition"
            >
              <Plus className="w-4 h-4" />
              <span>+ Diapositiva en Blanco</span>
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Tip: Puedes presionar Ctrl+V en cualquier pantalla para pegar una captura del libro.</span>
          </div>
        </div>
      </main>
    );
  }

  const isEditMode = mode === 'edit';
  const hasReference = Boolean(
    currentSlide.referenceContent && (
      (currentSlide.referenceContent.type === 'text' && currentSlide.referenceContent.content?.trim().length > 0) ||
      (currentSlide.referenceContent.type === 'reference_table' && currentSlide.referenceContent.columns?.length > 0) ||
      (currentSlide.referenceContent.type === 'table_reference' && currentSlide.referenceContent.rows?.length > 0) ||
      (currentSlide.referenceContent.type === 'media' && currentSlide.referenceContent.url?.trim().length > 0)
    )
  );
  const isImageReference = Boolean(
    currentSlide.referenceContent &&
    currentSlide.referenceContent.type === 'media' &&
    currentSlide.referenceContent.mediaType === 'image'
  );
  const hasInteraction = Boolean(currentSlide.interaction);

  const handleAttachReferenceImage = (dataUrl: string, title: string) => {
    const newRef: ReferenceMediaBlock = {
      type: 'media',
      id: generateReferenceImageId(),
      mediaType: 'image',
      url: dataUrl,
      title: title || 'Material Visual de Consulta',
    };
    updateReferenceBlock(currentSlide.id, newRef);
  };

  const verificationAudioUrl = currentSlide.interaction && 'verificationAudioUrl' in currentSlide.interaction
    ? currentSlide.interaction.verificationAudioUrl
    : undefined;
  const audioLabel = currentSlide.interaction && 'audioLabel' in currentSlide.interaction
    ? currentSlide.interaction.audioLabel
    : undefined;
  const hasVerificationAudio = Boolean(verificationAudioUrl && verificationAudioUrl.trim().length > 0);

  const handleCheck = async () => {
    await checkCurrentSlideAnswers();
    const evaluation = useSessionStore.getState().studentEvaluation;
    if (currentSlide?.isGraded === false) {
      confetti({
        particleCount: 90,
        spread: 65,
        origin: { y: 0.6 }
      });
    } else if (evaluation.score === evaluation.maxScore && evaluation.maxScore > 0) {
      confetti({
        particleCount: 110,
        spread: 75,
        origin: { y: 0.6 }
      });
    }
  };

  const getReferenceButtonLabel = () => {
    if (!currentSlide.referenceContent) return 'Consultar Referencia';
    switch (currentSlide.referenceContent.type) {
      case 'reference_table':
        return 'Consultar Cuadro de Vocabulario / Gramática';
      case 'table_reference':
        return 'Consultar Tabla Gramatical';
      case 'media':
        return currentSlide.referenceContent.mediaType === 'image'
          ? 'Consultar Imagen de Apoyo'
          : 'Consultar Audio / Transcripción';
      default:
        return 'Consultar Lectura y Reglas';
    }
  };

  const currentFormat: PedagogicalRole = (() => {
    if (currentSlide.interaction) {
      switch (currentSlide.interaction.type) {
        case 'input_fields':
          return 'interaction_inputs';
        case 'selection':
          return 'interaction_selection';
        case 'buckets_matching':
          return 'interaction_buckets';
        case 'sequence':
          return 'interaction_sequence';
        case 'writing':
          return 'interaction_writing';
      }
    }
    if (currentSlide.referenceContent) {
      if (currentSlide.referenceContent.type === 'reference_table' || currentSlide.referenceContent.type === 'table_reference') return 'reference_table';
      return 'reference_text';
    }
    return 'interaction_inputs';
  })();

  // Resolve renderers from registry
  const InteractionComponent = currentSlide.interaction
    ? INTERACTION_RENDERER_REGISTRY[currentSlide.interaction.type]
    : null;

  const ReferenceComponent = currentSlide.referenceContent
    ? REFERENCE_RENDERER_REGISTRY[currentSlide.referenceContent.type]
    : null;

  // Check if slide subtitle is redundant with slide title or interaction content
  const isSubtitleRedundant = (() => {
    if (!currentSlide.subtitle?.trim()) return false;

    // Redundant with title
    if (isSubstantialTextOverlap(currentSlide.subtitle, currentSlide.title, 0.7)) {
      return true;
    }

    const interaction = currentSlide.interaction;
    if (!interaction) return false;

    // Redundant with interaction instruction
    if ('instruction' in interaction && typeof (interaction as any).instruction === 'string') {
      const instr = (interaction as any).instruction;
      if (instr && isSubstantialTextOverlap(currentSlide.subtitle, instr, 0.65)) {
        return true;
      }
    }

    // Redundant with writing prompt or guidelines
    if (interaction.type === 'writing') {
      const writing = interaction as any;
      if (writing.prompt && isSubstantialTextOverlap(currentSlide.subtitle, writing.prompt, 0.65)) {
        return true;
      }
      if (Array.isArray(writing.guidelines) && writing.guidelines.length > 0) {
        if (isConcatenationOfItems(currentSlide.subtitle, writing.guidelines, 0.55)) {
          return true;
        }
      }
    }

    // Redundant with input item prompts
    if ('listItems' in interaction && Array.isArray((interaction as any).listItems)) {
      const itemPrompts = (interaction as any).listItems
        .map((it: any) => it.prompt || '')
        .filter(Boolean);
      if (itemPrompts.length > 0 && isConcatenationOfItems(currentSlide.subtitle, itemPrompts, 0.55)) {
        return true;
      }
    }

    return false;
  })();

  return (
    <main className="flex-1 flex flex-col items-center justify-start p-4 sm:p-6 md:p-10 pb-24 w-full bg-slate-100 select-none min-h-[calc(100vh-4rem)]">
      {/* Dynamic Wide Container: 94vw on laptop/desktop, 88vw on 2k/4k displays, no wasted grey gutters! */}
      <div className="w-full max-w-[94vw] 2xl:max-w-[88vw] mx-auto bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 md:p-10 flex flex-col shadow-sm transition-all min-h-[580px]">
        
        {/* Slide Top Banner: Title, Subtitle & Scaffolding Drawer Trigger */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
          <div className="flex-1 max-w-4xl">
            {isEditMode ? (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={currentSlide.title}
                  placeholder="Título de la diapositiva..."
                  onChange={(e) => updateSlideTitle(currentSlide.id, e.target.value)}
                  className="w-full text-xl md:text-3xl font-bold text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-600 outline-none pb-0.5"
                />
                <input
                  type="text"
                  value={currentSlide.subtitle || ''}
                  placeholder="Subtítulo o contexto pedagógico..."
                  onChange={(e) => updateSlideSubtitle(currentSlide.id, e.target.value)}
                  className="w-full text-sm font-medium text-slate-500 bg-transparent border-b border-dashed border-slate-200 focus:border-indigo-600 outline-none"
                />
              </div>
            ) : (
              <div>
                <h2 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">
                  {currentSlide.title}
                </h2>
                {currentSlide.subtitle && !isSubtitleRedundant && (
                  <p className="text-sm text-slate-500 font-medium mt-1 leading-relaxed">
                    {renderFormattedMarkdown(currentSlide.subtitle)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Floating Scaffolding Button / Screen Indicator & Visual Reference Button */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Visual Reference Button in Edit Mode */}
            {isEditMode && (
              !hasReference ? (
                <button
                  type="button"
                  onClick={() => setIsImageModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs rounded-xl border border-emerald-200 shadow-2xs transition transform active:scale-95 cursor-pointer"
                  title="Adjuntar una imagen o material visual de consulta a esta diapositiva"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>🖼️ Añadir Referencia Visual / Imagen</span>
                </button>
              ) : isImageReference ? (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/90 rounded-xl p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setIsImageModalOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-indigo-600 hover:bg-white rounded-lg transition cursor-pointer"
                    title="Reemplazar o cambiar la imagen de referencia"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Cambiar Imagen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateReferenceBlock(currentSlide.id, null)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title="Quitar referencia visual y restaurar ancho completo (100%)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Quitar</span>
                  </button>
                </div>
              ) : null
            )}

            {/* Floating Scaffolding Button / Screen Indicator */}
            {hasReference && !hasInteraction && isEditMode && (
              <button
                onClick={toggleReferenceDrawer}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs sm:text-sm rounded-xl border border-indigo-200 shadow-2xs transition transform active:scale-95 cursor-pointer"
                title="Abrir cajón flotante de consulta sin salir del ejercicio"
              >
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>{getReferenceButtonLabel()}</span>
              </button>
            )}
            {hasReference && hasInteraction && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50/80 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200/80 shadow-2xs">
                {isImageReference ? (
                  <>
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Imagen Integrada en Pantalla</span>
                  </>
                ) : (
                  <>
                    <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Lectura Integrada en Pantalla</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Archetype Conversion Toolbar (Segmented Control) - Only visible in Edit Mode */}
        {isEditMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5 px-3.5 py-2 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Formato Activo:</span>
              </span>
              <span className="text-[11px] text-slate-400 hidden md:inline">
                (Convierte en caliente preservando enunciados e ítems)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-2xs">
                {FORMAT_SWITCH_OPTIONS.map((opt) => {
                  const isSelected = currentFormat === opt.id || (opt.id === 'reference_text' && currentFormat === 'reference_table');
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        if (!isSelected) {
                          convertSlideRole(currentSlide.id, opt.id);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs scale-[1.02]'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      title={`Convertir diapositiva a formato ${opt.label} (Reversible con Ctrl+Z)`}
                    >
                      <span className="text-xs">{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Discrete isGraded Switch */}
              {hasInteraction && (
                <label
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold select-none cursor-pointer transition shadow-2xs ${
                    currentSlide.isGraded !== false
                      ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-800'
                  }`}
                  title="Define si la actividad otorga puntaje numérico con respuestas correctas fijas o si es una encuesta/reflexión personal de respuesta libre"
                >
                  <input
                    type="checkbox"
                    checked={currentSlide.isGraded !== false}
                    onChange={(e) => updateSlideIsGraded(currentSlide.id, e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>
                    {currentSlide.isGraded !== false ? 'Actividad Calificable' : 'Encuesta / No Calificable'}
                  </span>
                </label>
              )}
              {/* Quick Visual Reference Button in Toolbar */}
              {!hasReference && (
                <button
                  type="button"
                  onClick={() => setIsImageModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-lg border border-slate-200 text-xs font-semibold shadow-2xs transition cursor-pointer"
                  title="Añadir una imagen de referencia o diagrama para activar el layout de doble columna"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>+ Imagen Referencia</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Stage: Full Prominence for the Primary Pedagogical Purpose, natural vertical expansion */}
        <div className="flex-1 flex flex-col w-full">
          <SlideErrorBoundary fallbackTitle="Error al procesar el contenido de la diapositiva">
            {hasInteraction && hasReference && InteractionComponent && ReferenceComponent ? (
              /* DUAL INTEGRATED LAYOUT: Both Reading/Reference and Interactive Activity on the Main Canvas Stage */
              <div className="w-full flex flex-col lg:flex-row gap-8 items-start">
                {/* Left Column: Reading Passage / Reference Content */}
                <div className="w-full lg:w-5/12 sm:sticky sm:top-4 self-start flex flex-col bg-slate-50/80 border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 uppercase tracking-wider">
                      {isImageReference ? (
                        <>
                          <ImageIcon className="w-4 h-4 text-indigo-600" />
                          <span>Material Visual de Consulta</span>
                        </>
                      ) : (
                        <>
                          <BookOpen className="w-4 h-4 text-indigo-600" />
                          <span>Material de Lectura / Consulta</span>
                        </>
                      )}
                    </div>
                    {isEditMode ? (
                      <button
                        type="button"
                        onClick={() => updateReferenceBlock(currentSlide.id, null)}
                        className="text-[10px] text-slate-400 hover:text-rose-600 font-semibold px-2 py-0.5 rounded hover:bg-rose-50 transition cursor-pointer"
                        title="Quitar panel de referencia para dar ancho completo a la actividad"
                      >
                        Quitar Referencia
                      </button>
                    ) : (
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                        Referencia Activa
                      </span>
                    )}
                  </div>

                  <ReferenceComponent
                    block={currentSlide.referenceContent}
                    isEditMode={isEditMode}
                    slideTitle={currentSlide.title}
                    onChange={(updated: any) => updateReferenceBlock(currentSlide.id, updated)}
                    onRemove={() => updateReferenceBlock(currentSlide.id, null)}
                  />
                </div>

                {/* Right Column: Interactive Activity */}
                <div className="w-full lg:w-7/12 space-y-4">
                  <InteractionComponent
                    block={currentSlide.interaction}
                    studentAnswers={studentAnswers}
                    evaluation={studentEvaluation}
                    isEditMode={isEditMode}
                    onAnswerChange={(key: string, value: any) => setStudentAnswer(key, value)}
                    onChange={(updated: any) => updateInteractionBlock(currentSlide.id, updated)}
                  />
                </div>
              </div>
            ) : hasInteraction && InteractionComponent ? (
              /* Primary Interactive Block takes the full stage */
              <div className="w-full">
                <InteractionComponent
                  block={currentSlide.interaction}
                  studentAnswers={studentAnswers}
                  evaluation={studentEvaluation}
                  isEditMode={isEditMode}
                  onAnswerChange={(key: string, value: any) => setStudentAnswer(key, value)}
                  onChange={(updated: any) => updateInteractionBlock(currentSlide.id, updated)}
                />
              </div>
            ) : hasReference && ReferenceComponent ? (
              /* If slide is purely reference, render reference on main stage */
              <ReferenceComponent
                block={currentSlide.referenceContent}
                isEditMode={isEditMode}
                slideTitle={currentSlide.title}
                onChange={(updated: any) => updateReferenceBlock(currentSlide.id, updated)}
              />
            ) : isEditMode ? (
              /* Edit Mode Placeholder to choose an interactive template */
              <div className="border border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center p-10 text-center bg-slate-50/50">
                <Sparkles className="w-8 h-8 text-indigo-500 mb-2" />
                <p className="text-sm font-semibold text-slate-800 mb-1">
                  Selecciona una de las 4 Plantillas Universales
                </p>
                <p className="text-xs text-slate-500 mb-4 max-w-sm">
                  Crea una interacción evaluable para esta diapositiva:
                </p>
                <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                  <button
                    onClick={() => updateInteractionBlock(currentSlide.id, {
                      type: 'input_fields',
                      id: `inp-${Date.now()}`,
                      instruction: 'Rellena los espacios con la forma correcta:',
                      layoutMode: 'list',
                      listItems: [
                        { id: 'item-1', prompt: 'She _______ (live) here since 2010.', acceptedAnswers: ['have lived', 'have been living'] }
                      ],
                      tableHeaders: [],
                      tableRows: [],
                      paragraphTemplate: '',
                      paragraphInputs: {}
                    })}
                    className="p-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left flex items-center gap-3 shadow-2xs transition"
                  >
                    <PenTool className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">1. Rellenar</div>
                      <div className="text-[11px] text-slate-500">Casillas / Cloze</div>
                    </div>
                  </button>

                  <button
                    onClick={() => updateInteractionBlock(currentSlide.id, {
                      type: 'selection',
                      id: `sel-${Date.now()}`,
                      instruction: 'Elige la opción correcta:',
                      questions: [
                        {
                          id: 'q-1',
                          prompt: 'Which sentence is grammatically correct?',
                          mode: 'single_choice',
                          options: [
                            { id: 'o-1', text: 'She has lived here for three years.', isCorrect: true },
                            { id: 'o-2', text: 'She has lived here since three years.', isCorrect: false }
                          ]
                        }
                      ]
                    })}
                    className="p-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left flex items-center gap-3 shadow-2xs transition"
                  >
                    <CheckSquare className="w-5 h-5 text-emerald-600" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">2. Selección</div>
                      <div className="text-[11px] text-slate-500">Radio / Checkbox</div>
                    </div>
                  </button>

                  <button
                    onClick={() => updateInteractionBlock(currentSlide.id, {
                      type: 'buckets_matching',
                      id: `buc-${Date.now()}`,
                      instruction: 'Arrastra cada ficha a su contenedor:',
                      buckets: [
                        { id: 'b1', label: 'FOR', color: '#4f46e5' },
                        { id: 'b2', label: 'IN', color: '#059669' }
                      ],
                      tokens: [
                        { id: 't1', text: 'apply', correctBucketId: 'b1' },
                        { id: 't2', text: 'succeed', correctBucketId: 'b2' }
                      ]
                    })}
                    className="p-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left flex items-center gap-3 shadow-2xs transition"
                  >
                    <FolderGit2 className="w-5 h-5 text-amber-600" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">3. Buckets</div>
                      <div className="text-[11px] text-slate-500">Preposiciones</div>
                    </div>
                  </button>

                  <button
                    onClick={() => updateInteractionBlock(currentSlide.id, {
                      type: 'sequence',
                      id: `seq-${Date.now()}`,
                      instruction: 'Ordena las frases cronológicamente:',
                      items: [
                        { id: 's1', text: 'Good morning, reception speaking.', correctOrder: 1 },
                        { id: 's2', text: 'Hi, I would like to book a room.', correctOrder: 2 }
                      ]
                    })}
                    className="p-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left flex items-center gap-3 shadow-2xs transition"
                  >
                    <ListOrdered className="w-5 h-5 text-purple-600" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">4. Secuencia</div>
                      <div className="text-[11px] text-slate-500">Diálogos</div>
                    </div>
                  </button>

                  <button
                    onClick={() => updateInteractionBlock(currentSlide.id, {
                      type: 'writing',
                      id: `wri-${Date.now()}`,
                      instruction: 'Redacta un texto siguiendo las pautas:',
                      prompt: 'Write a short profile or paragraph answering the questions.',
                      guidelines: ['Use at least 3 descriptive adjectives', 'Check punctuation and spelling'],
                      minWords: 30,
                      placeholder: 'Escribe tu redacción aquí...'
                    })}
                    className="p-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left flex items-center gap-3 shadow-2xs transition col-span-2"
                  >
                    <PenTool className="w-5 h-5 text-indigo-600" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">5. Producción Escrita (Writing)</div>
                      <div className="text-[11px] text-slate-500">Redacción libre con feedback formativo en tiempo real</div>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                Esta diapositiva no tiene contenido asignado.
              </div>
            )}
          </SlideErrorBoundary>
        </div>

        {/* Student Mode Bottom Action & Score Bar - Never cut off! */}
        {!isEditMode && hasInteraction && (
          <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {studentEvaluation.isSubmitted ? (
                currentSlide.isGraded === false ? (
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold border bg-indigo-50 text-indigo-800 border-indigo-200 shadow-2xs">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      <span>¡Respuestas registradas!</span>
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-slate-600">
                      Actividad completada ✓
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold border ${
                      studentEvaluation.score === studentEvaluation.maxScore
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      <Award className="w-4 h-4" />
                      <span>
                        Puntaje: {studentEvaluation.score} / {studentEvaluation.maxScore} (
                        {studentEvaluation.maxScore > 0 ? Math.round((studentEvaluation.score / studentEvaluation.maxScore) * 100) : 100}%)
                      </span>
                    </div>

                    <span className="text-xs sm:text-sm font-medium text-slate-600">
                      {studentEvaluation.score === studentEvaluation.maxScore
                        ? '¡Excelente trabajo! 🎉'
                        : 'Revisa las correcciones en pantalla.'}
                    </span>
                    {studentEvaluation.usedAi && (
                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                        <span>🧠</span>
                        <span>Corrección Semántica IA</span>
                      </span>
                    )}
                  </div>
                )
              ) : (
                <span className="text-xs sm:text-sm text-slate-500 font-medium">
                  {currentSlide.isGraded === false
                    ? 'Responde según tu criterio o experiencia personal y registra tus respuestas.'
                    : hasVerificationAudio && !isVerificationAudioActive
                    ? 'Paso 1: Escribe tus respuestas y pulsa Escuchar y Verificar para oír el audio de autocorrección.'
                    : hasVerificationAudio && isVerificationAudioActive
                    ? 'Paso 2: Ajusta tus respuestas mientras escuchas el audio. Cuando termines, pulsa Comprobar.'
                    : 'Completa el ejercicio en pantalla y pulsa Comprobar para calificar.'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={resetStudentAnswers}
                disabled={isAiEvaluating}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition disabled:opacity-50 cursor-pointer"
                title="Reiniciar respuestas"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reiniciar</span>
              </button>

              {/* Progressive Action Button (Paso 1: Escuchar y Verificar -> Paso 2: Comprobar Respuestas) */}
              {hasVerificationAudio && !isVerificationAudioActive && !studentEvaluation.isSubmitted ? (
                <button
                  onClick={triggerPlayVerificationAudio}
                  disabled={isAiEvaluating}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition transform active:scale-95 cursor-pointer ring-2 ring-indigo-200/60"
                  title="Reproducir audio de verificación para autocorrección previa a la calificación"
                >
                  <Headphones className="w-4 h-4 animate-pulse" />
                  <span>
                    🎧 Escuchar y Verificar {audioLabel ? `[${audioLabel}]` : ''}
                  </span>
                </button>
              ) : (
                <button
                  onClick={handleCheck}
                  disabled={isAiEvaluating}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition transform ${
                    isAiEvaluating
                      ? 'bg-indigo-500 text-white cursor-wait animate-pulse'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs active:scale-95 cursor-pointer'
                  }`}
                >
                  {isAiEvaluating ? (
                    <>
                      <span className="text-base animate-bounce">🧠</span>
                      <span>Evaluando con IA...</span>
                    </>
                  ) : currentSlide.isGraded === false ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{studentEvaluation.isSubmitted ? 'Respuestas Registradas ✓' : 'Registrar Respuestas'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {hasVerificationAudio && isVerificationAudioActive && !studentEvaluation.isSubmitted
                          ? '✅ Comprobar Respuestas'
                          : 'Comprobar Respuestas'}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reference Image Upload / Paste Modal */}
      {isEditMode && (
        <ReferenceImageModal
          key={isImageModalOpen ? `open-${isImageReference && currentSlide.referenceContent?.type === 'media' ? currentSlide.referenceContent.url : 'new'}` : 'closed'}
          isOpen={isImageModalOpen}
          onClose={() => setIsImageModalOpen(false)}
          onAttach={handleAttachReferenceImage}
          currentImageUrl={
            isImageReference && currentSlide.referenceContent && currentSlide.referenceContent.type === 'media'
              ? currentSlide.referenceContent.url
              : undefined
          }
          currentTitle={
            isImageReference && currentSlide.referenceContent && currentSlide.referenceContent.type === 'media'
              ? currentSlide.referenceContent.title
              : undefined
          }
        />
      )}
    </main>
  );
};
