import JSZip from 'jszip';
import type { Lesson } from '../../types/schema';
import { generateScorm12Manifest } from './scormManifest';

/**
 * Generates a self-contained, standalone HTML Student View player
 * with integrated SCORM 1.2 communication and zero external runtime dependencies.
 */
function buildStandaloneStudentHtml(lesson: Lesson): string {
  const serializedLesson = JSON.stringify(lesson).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${lesson.title || 'SCORM 1.2 Lesson'} - Student Mode</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background-color: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      padding: 0.75rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 30;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.6rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.025em;
    }
    .badge-indigo { background-color: #e0e7ff; color: #4338ca; }
    .badge-amber { background-color: #fef3c7; color: #b45309; }
    .badge-emerald { background-color: #d1fae5; color: #065f46; }
    .badge-rose { background-color: #ffe4e6; color: #9f1239; }
    .badge-slate { background-color: #f1f5f9; color: #475569; }
    .nav-btn {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 0.4rem 0.75rem;
      border-radius: 0.5rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      color: #334155;
      transition: all 0.15s;
    }
    .nav-btn:hover:not(:disabled) { background: #e2e8f0; color: #0f172a; }
    .nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .main-container {
      max-width: 1200px;
      width: 100%;
      margin: 1.5rem auto;
      padding: 0 1rem 3rem;
      flex: 1;
    }
    .slide-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .slide-title { font-size: 1.35rem; font-weight: 800; color: #1e293b; margin-bottom: 0.25rem; }
    .slide-subtitle { font-size: 0.95rem; font-weight: 500; color: #64748b; margin-bottom: 1.25rem; }
    .stage-layout { display: flex; flex-direction: column; gap: 1.5rem; }
    @media (min-width: 900px) {
      .stage-layout.split-50 { display: grid; grid-template-columns: 5fr 7fr; gap: 1.75rem; }
    }
    .ref-panel {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 1.25rem;
      font-size: 0.95rem;
      color: #334155;
      line-height: 1.6;
    }
    .ref-title { font-size: 0.8rem; font-weight: 700; color: #4f46e5; text-transform: uppercase; margin-bottom: 0.75rem; }
    .ref-badge {
      display: inline-block;
      background: #e0e7ff;
      color: #4338ca;
      border: 1px solid #c7d2fe;
      padding: 0.15rem 0.5rem;
      border-radius: 0.35rem;
      font-weight: 800;
      font-size: 0.8rem;
      margin: 0 0.25rem;
    }
    .table-container { width: 100%; overflow-x: auto; margin-top: 0.75rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { border: 1px solid #cbd5e1; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    .interactive-panel { display: flex; flex-direction: column; gap: 1rem; }
    .word-bank {
      background: #eff6ff;
      border: 1px dashed #bfdbfe;
      border-radius: 0.75rem;
      padding: 0.85rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .word-chip {
      background: #ffffff;
      color: #1e40af;
      border: 1px solid #93c5fd;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .word-chip.used { opacity: 0.4; text-decoration: line-through; background: #f1f5f9; border-color: #cbd5e1; color: #64748b; }
    .item-row {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 0.85rem 1rem;
      transition: all 0.15s;
    }
    .item-row.correct { border-color: #10b981; background: #f0fdf4; }
    .item-row.incorrect { border-color: #f43f5e; background: #fff1f2; }
    .item-example {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 0.85rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.95rem;
    }
    .example-badge {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 0.25rem;
    }
    .blank-input {
      display: inline-block;
      padding: 0.35rem 0.65rem;
      font-size: 0.95rem;
      font-weight: 600;
      color: #0f172a;
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      border-radius: 0.5rem;
      outline: none;
      transition: all 0.15s;
      width: 100%;
      max-width: 320px;
    }
    .blank-input:focus { border-color: #4f46e5; background: #ffffff; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15); }
    .blank-input.correct { border-color: #10b981; background: #ffffff; color: #065f46; }
    .blank-input.incorrect { border-color: #f43f5e; background: #ffffff; color: #9f1239; }
    .feedback-hint { font-size: 0.8rem; font-weight: 600; color: #e11d48; margin-top: 0.25rem; }
    .btn-action {
      background: #4f46e5;
      color: #ffffff;
      font-weight: 700;
      font-size: 0.9rem;
      border: none;
      border-radius: 0.75rem;
      padding: 0.65rem 1.5rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.15s;
    }
    .btn-action:hover { background: #4338ca; }
    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      font-size: 0.9rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.75rem;
      padding: 0.65rem 1.25rem;
      cursor: pointer;
    }
    .btn-secondary:hover { background: #e2e8f0; }
    .score-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 700;
    }
    .action-bar {
      margin-top: 1.75rem;
      padding-top: 1.25rem;
      border-top: 1px solid #e2e8f0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .audio-player-box {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: #eef2ff;
      border: 1px solid #c7d2fe;
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .audio-player-box audio { flex: 1; height: 36px; }
    .scorm-status-pill {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #475569;
    }
    .scorm-status-pill.connected { background: #ecfdf5; border-color: #6ee7b7; color: #047857; }
    canvas#confetti-canvas {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 9999;
    }
  </style>
</head>
<body>
  <canvas id="confetti-canvas"></canvas>

  <header>
    <div style="display: flex; align-items: center; gap: 0.75rem;">
      <span class="badge badge-indigo">SCORM 1.2</span>
      <span class="badge badge-amber" id="lesson-level">B1</span>
      <span style="font-size: 0.85rem; font-weight: 700; color: #1e293b;" id="lesson-title">Cargando...</span>
    </div>
    <div style="display: flex; align-items: center; gap: 0.75rem;">
      <span id="scorm-status" class="scorm-status-pill">Standalone</span>
      <button class="nav-btn" id="prev-btn" onclick="prevSlide()">◀ Anterior</button>
      <span style="font-size: 0.8rem; font-weight: 700; color: #475569;" id="slide-indicator">1 / 1</span>
      <button class="nav-btn" id="next-btn" onclick="nextSlide()">Siguiente ▶</button>
    </div>
  </header>

  <main class="main-container">
    <div class="slide-card">
      <h1 class="slide-title" id="stage-title"></h1>
      <p class="slide-subtitle" id="stage-subtitle"></p>

      <div id="stage-layout" class="stage-layout">
        <!-- Rendered dynamically -->
      </div>

      <div class="action-bar" id="action-bar">
        <div id="score-container" style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-size: 0.85rem; color: #64748b;">Completa la actividad y presiona Comprobar.</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <button class="btn-secondary" onclick="resetCurrentSlide()">Reiniciar</button>
          <button class="btn-action" id="check-btn" onclick="checkCurrentSlide()">✓ Comprobar Respuestas</button>
        </div>
      </div>
    </div>
  </main>

  <script>
    // Embedded Lesson Payload
    window.__LESSON_DATA__ = ${serializedLesson};

    // SCORM 1.2 Driver Runtime
    let scormAPI = null;
    let scormInitialized = false;

    function findScormAPI(win) {
      let depth = 0;
      while (win && depth < 10) {
        try {
          if (win.API && typeof win.API.LMSInitialize === 'function') return win.API;
        } catch (e) { break; }
        try {
          if (win.parent && win.parent !== win) { win = win.parent; depth++; }
          else break;
        } catch (e) { break; }
      }
      return null;
    }

    function initScorm() {
      scormAPI = findScormAPI(window) || (window.opener ? findScormAPI(window.opener) : null);
      const statusPill = document.getElementById('scorm-status');
      if (scormAPI) {
        try {
          const res = scormAPI.LMSInitialize('');
          scormInitialized = (res === 'true' || res === true);
          if (scormInitialized) {
            statusPill.textContent = 'LMS Conectado';
            statusPill.className = 'scorm-status-pill connected';
            const cur = scormAPI.LMSGetValue('cmi.core.lesson_status');
            if (!cur || cur === 'not attempted') {
              scormAPI.LMSSetValue('cmi.core.lesson_status', 'incomplete');
              scormAPI.LMSCommit('');
            }
          }
        } catch (err) {
          console.warn('[SCORM 1.2] Error initializing:', err);
        }
      } else {
        statusPill.textContent = 'Modo Standalone';
      }
    }

    function reportScormScore(score, maxScore) {
      if (!scormAPI || !scormInitialized) return;
      try {
        scormAPI.LMSSetValue('cmi.core.score.raw', String(score));
        scormAPI.LMSSetValue('cmi.core.score.min', '0');
        scormAPI.LMSSetValue('cmi.core.score.max', String(maxScore));
        const passed = maxScore > 0 ? (score / maxScore >= 0.7) : true;
        scormAPI.LMSSetValue('cmi.core.lesson_status', passed ? 'passed' : 'failed');
        scormAPI.LMSCommit('');
      } catch (err) {
        console.warn('[SCORM 1.2] Error reporting score:', err);
      }
    }

    function finishScorm() {
      if (scormAPI && scormInitialized) {
        try {
          scormAPI.LMSCommit('');
          scormAPI.LMSFinish('');
          scormInitialized = false;
        } catch (e) {}
      }
    }

    window.addEventListener('beforeunload', finishScorm);
    window.addEventListener('unload', finishScorm);

    // Lightweight In-Browser Confetti
    function launchConfetti() {
      const canvas = document.getElementById('confetti-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const particles = [];
      const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];
      for (let i = 0; i < 90; i++) {
        particles.push({
          x: canvas.width / 2,
          y: canvas.height * 0.4,
          vx: (Math.random() - 0.5) * 16,
          vy: (Math.random() - 0.7) * 16,
          size: Math.random() * 8 + 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 10,
          gravity: 0.35,
          opacity: 1
        });
      }
      let frame = 0;
      function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;
          p.rotation += p.rotationSpeed;
          p.opacity -= 0.012;
          if (p.opacity > 0) {
            alive = true;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.opacity);
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
          }
        });
        frame++;
        if (alive && frame < 120) requestAnimationFrame(animate);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      animate();
    }

    // Lesson Application State
    let lessonData = window.__LESSON_DATA__;
    let currentSlideIndex = 0;
    const studentAnswers = {};
    const slideEvaluations = {};

    function initLesson() {
      initScorm();
      document.getElementById('lesson-title').textContent = lessonData.title || 'Lección';
      document.getElementById('lesson-level').textContent = lessonData.level || 'B1';
      renderSlide(0);
    }

    function renderSlide(index) {
      if (!lessonData.slides || lessonData.slides.length === 0) return;
      currentSlideIndex = Math.max(0, Math.min(index, lessonData.slides.length - 1));
      const slide = lessonData.slides[currentSlideIndex];

      document.getElementById('slide-indicator').textContent = (currentSlideIndex + 1) + ' / ' + lessonData.slides.length;
      document.getElementById('prev-btn').disabled = currentSlideIndex === 0;
      document.getElementById('next-btn').disabled = currentSlideIndex === lessonData.slides.length - 1;

      document.getElementById('stage-title').textContent = slide.title || '';
      document.getElementById('stage-subtitle').textContent = slide.subtitle || (slide.interaction && slide.interaction.instruction) || '';

      const stage = document.getElementById('stage-layout');
      stage.innerHTML = '';

      const hasRef = slide.referenceContent && (
        (slide.referenceContent.type === 'text' && slide.referenceContent.content) ||
        (slide.referenceContent.type === 'table_reference' && slide.referenceContent.rows) ||
        (slide.referenceContent.type === 'media' && slide.referenceContent.url)
      );

      if (hasRef) {
        stage.className = 'stage-layout split-50';
        const refCol = document.createElement('div');
        refCol.className = 'ref-panel';
        renderReference(slide.referenceContent, refCol);
        stage.appendChild(refCol);
      } else {
        stage.className = 'stage-layout';
      }

      const interCol = document.createElement('div');
      interCol.className = 'interactive-panel';
      renderInteraction(slide.interaction, interCol, slide.id);
      stage.appendChild(interCol);

      updateScoreBar();
    }

    function renderReference(ref, container) {
      if (!ref) return;
      const title = document.createElement('div');
      title.className = 'ref-title';
      title.textContent = ref.title || 'Material de Consulta / Lectura';
      container.appendChild(title);

      if (ref.type === 'text') {
        const body = document.createElement('div');
        let text = (ref.content || '').replace(/\\[\\s*(\\d{1,2})\\s*\\]/g, '<span class="ref-badge">[ $1 ]</span>');
        text = text.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
        text = text.replace(/\\n/g, '<br/>');
        body.innerHTML = text;
        container.appendChild(body);
      } else if (ref.type === 'table_reference' && Array.isArray(ref.rows)) {
        const wrap = document.createElement('div');
        wrap.className = 'table-container';
        let tableHtml = '<table>';
        if (ref.headers && ref.headers.length) {
          tableHtml += '<thead><tr>' + ref.headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead>';
        }
        tableHtml += '<tbody>';
        ref.rows.forEach(row => {
          tableHtml += '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';
        });
        tableHtml += '</tbody></table>';
        wrap.innerHTML = tableHtml;
        container.appendChild(wrap);
      } else if (ref.type === 'media' && ref.url) {
        if (ref.mediaType === 'image') {
          const img = document.createElement('img');
          img.src = ref.url;
          img.style.maxWidth = '100%';
          img.style.borderRadius = '0.5rem';
          container.appendChild(img);
        } else if (ref.mediaType === 'audio') {
          const audio = document.createElement('audio');
          audio.src = ref.url;
          audio.controls = true;
          container.appendChild(audio);
        }
      }
    }

    function renderInteraction(interaction, container, slideId) {
      if (!interaction) {
        container.innerHTML = '<div style="color: #94a3b8; padding: 2rem; text-align: center;">Esta diapositiva es puramente informativa.</div>';
        return;
      }

      // Audio verification if present
      if (interaction.verificationAudioUrl) {
        const audioBox = document.createElement('div');
        audioBox.className = 'audio-player-box';
        audioBox.innerHTML = '<span>🎧 Audio de Verificación:</span><audio controls src="' + interaction.verificationAudioUrl + '"></audio>';
        container.appendChild(audioBox);
      }

      // Word bank if present
      if (interaction.wordBank && interaction.wordBank.length > 0) {
        const bank = document.createElement('div');
        bank.className = 'word-bank';
        bank.innerHTML = '<strong style="font-size: 0.8rem; color: #1e40af; width: 100%;">Banco de Palabras:</strong>';
        interaction.wordBank.forEach(word => {
          const chip = document.createElement('span');
          chip.className = 'word-chip';
          chip.textContent = word;
          bank.appendChild(chip);
        });
        container.appendChild(bank);
      }

      const answers = studentAnswers[slideId] || {};
      const evalState = slideEvaluations[slideId];

      if (interaction.type === 'input_fields' && Array.isArray(interaction.listItems)) {
        interaction.listItems.forEach((item, idx) => {
          const itemKey = 'input-' + (item.id || idx);

          if (item.isExample) {
            const exDiv = document.createElement('div');
            exDiv.className = 'item-example';
            exDiv.innerHTML = '<span class="example-badge">✓ Ejemplo</span> <strong>' + (item.prompt || '1.') + '</strong> <span>' + (item.expectedAnswer || '') + '</span>';
            container.appendChild(exDiv);
            return;
          }

          const row = document.createElement('div');
          row.className = 'item-row';
          const isEvaluated = evalState && evalState.submitted;
          const isCorrect = isEvaluated && evalState.details[itemKey];

          if (isEvaluated) {
            row.className += isCorrect ? ' correct' : ' incorrect';
          }

          let promptHtml = item.prompt || ('Item ' + (idx + 1));
          if (promptHtml.includes('{{blank}}')) {
            const inputHtml = '<input type="text" class="blank-input ' + (isEvaluated ? (isCorrect ? 'correct' : 'incorrect') : '') + '" data-key="' + itemKey + '" value="' + (answers[itemKey] || '') + '" placeholder="escribe aquí..." oninput="handleInput(this, \\'' + slideId + '\\')" />';
            row.innerHTML = '<div>' + promptHtml.replace('{{blank}}', inputHtml) + '</div>';
          } else {
            row.innerHTML = '<div style="font-weight: 600; margin-bottom: 0.35rem;">' + promptHtml + '</div>' +
              '<input type="text" class="blank-input ' + (isEvaluated ? (isCorrect ? 'correct' : 'incorrect') : '') + '" data-key="' + itemKey + '" value="' + (answers[itemKey] || '') + '" placeholder="Tu respuesta..." oninput="handleInput(this, \\'' + slideId + '\\')" />';
          }

          if (isEvaluated && !isCorrect) {
            const hint = document.createElement('div');
            hint.className = 'feedback-hint';
            hint.textContent = 'Respuesta correcta: ' + item.expectedAnswer;
            row.appendChild(hint);
          }

          container.appendChild(row);
        });
      } else if (interaction.type === 'selection' && Array.isArray(interaction.questions)) {
        interaction.questions.forEach((q, qIdx) => {
          const qKey = 'select-' + (q.id || qIdx);
          const row = document.createElement('div');
          row.className = 'item-row';
          row.innerHTML = '<div style="font-weight: 700; margin-bottom: 0.5rem;">' + (q.prompt || 'Pregunta ' + (qIdx + 1)) + '</div>';

          const optionsWrap = document.createElement('div');
          optionsWrap.style.display = 'flex';
          optionsWrap.style.flexWrap = 'wrap';
          optionsWrap.style.gap = '0.5rem';

          (q.options || []).forEach((opt, oIdx) => {
            const optVal = opt.id || opt.text || String(oIdx);
            const isSelected = answers[qKey] === optVal;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'nav-btn';
            btn.textContent = opt.text || opt;
            if (isSelected) {
              btn.style.background = '#4f46e5';
              btn.style.color = '#ffffff';
              btn.style.borderColor = '#4338ca';
            }
            btn.onclick = function() {
              if (!studentAnswers[slideId]) studentAnswers[slideId] = {};
              studentAnswers[slideId][qKey] = optVal;
              renderSlide(currentSlideIndex);
            };
            optionsWrap.appendChild(btn);
          });

          row.appendChild(optionsWrap);
          container.appendChild(row);
        });
      }
    }

    function handleInput(input, slideId) {
      const key = input.getAttribute('data-key');
      if (!studentAnswers[slideId]) studentAnswers[slideId] = {};
      studentAnswers[slideId][key] = input.value;
    }

    function checkCurrentSlide() {
      const slide = lessonData.slides[currentSlideIndex];
      if (!slide || !slide.interaction) return;

      const inter = slide.interaction;
      const answers = studentAnswers[slide.id] || {};
      let score = 0;
      let maxScore = 0;
      const details = {};

      if (inter.type === 'input_fields' && Array.isArray(inter.listItems)) {
        inter.listItems.forEach((item, idx) => {
          if (item.isExample) return;
          maxScore++;
          const key = 'input-' + (item.id || idx);
          const userVal = (answers[key] || '').trim().toLowerCase();
          const expectedRaw = (item.expectedAnswer || '').trim().toLowerCase();
          const acceptable = expectedRaw.split(/[/|]/).map(s => s.trim());
          const isOk = acceptable.some(ans => ans === userVal);
          if (isOk) score++;
          details[key] = isOk;
        });
      } else if (inter.type === 'selection' && Array.isArray(inter.questions)) {
        inter.questions.forEach((q, idx) => {
          maxScore++;
          const key = 'select-' + (q.id || idx);
          const chosen = answers[key];
          const correctOpt = (q.options || []).find(o => o.isCorrect);
          const correctVal = correctOpt ? (correctOpt.id || correctOpt.text) : q.correctAnswer;
          const isOk = (chosen === correctVal);
          if (isOk) score++;
          details[key] = isOk;
        });
      }

      slideEvaluations[slide.id] = { submitted: true, score, maxScore, details };
      renderSlide(currentSlideIndex);

      if (maxScore > 0 && score === maxScore) {
        launchConfetti();
      }

      // Compute total course score
      let totalScore = 0;
      let totalMax = 0;
      lessonData.slides.forEach(s => {
        if (slideEvaluations[s.id]) {
          totalScore += slideEvaluations[s.id].score;
          totalMax += slideEvaluations[s.id].maxScore;
        }
      });
      reportScormScore(totalScore, totalMax);
    }

    function resetCurrentSlide() {
      const slide = lessonData.slides[currentSlideIndex];
      if (!slide) return;
      delete studentAnswers[slide.id];
      delete slideEvaluations[slide.id];
      renderSlide(currentSlideIndex);
    }

    function updateScoreBar() {
      const slide = lessonData.slides[currentSlideIndex];
      const evalState = slide && slideEvaluations[slide.id];
      const scoreContainer = document.getElementById('score-container');
      if (evalState && evalState.submitted) {
        const pct = evalState.maxScore > 0 ? Math.round((evalState.score / evalState.maxScore) * 100) : 100;
        scoreContainer.innerHTML = '<div class="score-banner ' + (evalState.score === evalState.maxScore ? 'badge-emerald' : 'badge-amber') + '">' +
          '<span>Puntaje: ' + evalState.score + ' / ' + evalState.maxScore + ' (' + pct + '%)</span>' +
          '</div>';
      } else {
        scoreContainer.innerHTML = '<span style="font-size: 0.85rem; color: #64748b;">Completa la actividad y presiona Comprobar.</span>';
      }
    }

    function prevSlide() { if (currentSlideIndex > 0) renderSlide(currentSlideIndex - 1); }
    function nextSlide() { if (currentSlideIndex < lessonData.slides.length - 1) renderSlide(currentSlideIndex + 1); }

    // Start on DOM ready
    window.addEventListener('DOMContentLoaded', initLesson);
  </script>
</body>
</html>`;
}

/**
 * Packages the active lesson into an ADL SCORM 1.2 compliant ZIP package.
 * Returns a Blob suitable for direct client-side download.
 */
export async function exportScormPackage(lessonData: Lesson): Promise<Blob> {
  const zip = new JSZip();

  // 1. Generate imsmanifest.xml
  const manifestXml = generateScorm12Manifest({
    lessonId: lessonData.id,
    lessonTitle: lessonData.title || 'Lección SCORM 1.2',
    files: ['index.html', 'lesson.json'],
  });
  zip.file('imsmanifest.xml', manifestXml);

  // 2. Generate lesson.json
  const lessonJsonContent = JSON.stringify(lessonData, null, 2);
  zip.file('lesson.json', lessonJsonContent);

  // 3. Generate standalone index.html (Student View runtime + SCORM Driver)
  const standaloneHtml = buildStandaloneStudentHtml(lessonData);
  zip.file('index.html', standaloneHtml);

  // 4. Generate the ZIP Blob
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return zipBlob;
}
