(function () {
  'use strict';

  const STORAGE_KEY = 'north-star.cohort-8.v1';
  const RECEIPT_KEY = 'north-star.cohort-8.receipt.v1';
  const config = window.APP_CONFIG;
  const data = window.EXERCISE_DATA;
  const engine = window.ExerciseEngine;
  const steps = [
    ...data.introSteps,
    ...data.questions,
    { id: 'contact', module: 'contact', type: 'contact' },
    { id: 'result', module: 'result', type: 'result' }
  ];
  const questionNumber = new Map(data.questions.map((question, index) => [question.id, index + 1]));
  const moduleStarts = {};
  steps.forEach((step, index) => {
    if (moduleStarts[step.module] === undefined) moduleStarts[step.module] = index;
  });

  const state = loadState();
  state.answers = state.answers && typeof state.answers === 'object' ? state.answers : {};
  state.contact = state.contact && typeof state.contact === 'object' ? state.contact : {};
  state.startedAt = Number.isFinite(state.startedAt) ? state.startedAt : Date.now();
  state.pos = Number.isInteger(state.pos) ? Math.max(0, Math.min(steps.length - 1, state.pos)) : 0;
  state.maxReached = Number.isInteger(state.maxReached) ? Math.max(state.pos, Math.min(steps.length - 1, state.maxReached)) : state.pos;
  state.submitted = Boolean(state.submitted);
  state.assessment = state.assessment || null;
  state.fitSignals = Array.isArray(state.fitSignals) ? state.fitSignals : null;
  state.roadmap = state.roadmap && typeof state.roadmap === 'object' ? state.roadmap : null;
  let pendingCelebration = false;
  if (!state.submitted && steps[state.pos].type === 'result') state.pos = steps.length - 2;

  const stage = document.querySelector('#stage');
  const footer = document.querySelector('#stepFooter');
  const continueButton = document.querySelector('#continueBtn');
  const backButton = document.querySelector('#backBtn');
  const sidebar = document.querySelector('#sidebar');
  const scrim = document.querySelector('#scrim');
  const menuButton = document.querySelector('#menuBtn');

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The exercise remains usable if browser storage is unavailable.
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Echo Q10's colour language back onto the user's own statement: tint any
  // detected time marker and any number/scale, leave the rest plain.
  function highlightNorthStar(statement) {
    let html = escapeHtml(String(statement || '').trim());
    if (!html) return '';
    const slots = [];
    const stash = (className, value) => {
      // Token is wrapped in letters so the later number pass can't re-match it.
      const token = 'SEGSLOT' + slots.length + 'END';
      slots.push('<span class="seg ' + className + '">' + value + '</span>');
      return token;
    };
    // Tint time markers first, then scale/numbers, stashing each so a later
    // pass can never re-wrap text that is already highlighted.
    html = html.replace(/\b(20\d\d|Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/gi,
      (match) => stash('seg-time', match));
    html = html.replace(/(\$\s?\d[\d,]*(?:\.\d+)?\s?[kKmM]?(?:\s?(?:\/|per )[a-z]+)?|\b\d[\d,]*(?:\.\d+)?\s?[kKmM]?\b)/g,
      (match) => stash('seg-scale', match));
    return html.replace(/SEGSLOT(\d+)END/g, (_, index) => slots[Number(index)]);
  }

  // Full colour-coding for the result North Star: the LLM splits the statement
  // into {text, part} tokens (time/role/thing/scale), matching the Q10 template.
  // Falls back to time+scale auto-highlighting when segments are unavailable.
  function renderNorthStarSegments(roadmap, statement) {
    const segments = roadmap && Array.isArray(roadmap.statementSegments) ? roadmap.statementSegments : null;
    const valid = segments && segments.length
      && segments.every((token) => token && typeof token.text === 'string')
      && segments.map((token) => token.text).join('').replace(/\s/g, '').length >= statement.replace(/\s/g, '').length * 0.6;
    if (!valid) return highlightNorthStar(statement);
    const parts = new Set(['time', 'role', 'thing', 'scale']);
    return segments
      .map((token) => parts.has(token.part)
        ? `<span class="seg seg-${token.part}">${escapeHtml(token.text)}</span>`
        : escapeHtml(token.text))
      .join('');
  }

  function toast(message) {
    const node = document.querySelector('#toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(node.timer);
    node.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    scrim.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }

  function goTo(index) {
    const target = Math.max(0, Math.min(steps.length - 1, index));
    if (target > state.maxReached || (steps[target].type === 'result' && !state.submitted)) return;
    state.pos = target;
    persist();
    closeSidebar();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    stage.focus({ preventScroll: true });
  }

  function unlockNext() {
    const next = Math.min(steps.length - 1, state.pos + 1);
    state.maxReached = Math.max(state.maxReached, next);
    state.pos = next;
    persist();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    stage.focus({ preventScroll: true });
  }

  function valueIsComplete(question) {
    const value = state.answers[question.id];
    if (question.type === 'multi') return Array.isArray(value) && value.length > 0;
    const normalized = String(value || '').trim();
    return Boolean(normalized);
  }

  function renderNavigation() {
    const nav = document.querySelector('#moduleNav');
    nav.innerHTML = '';
    const currentModule = steps[state.pos].module;

    data.modules.forEach((module) => {
      const start = moduleStarts[module.id];
      const unlocked = start <= state.maxReached && !(module.id === 'result' && !state.submitted);
      const nextStart = data.modules
        .map((item) => moduleStarts[item.id])
        .find((value) => value > start);
      const done = nextStart !== undefined ? state.maxReached >= nextStart : state.submitted;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mod${currentModule === module.id ? ' active' : ''}${done ? ' done' : ''}`;
      button.disabled = !unlocked;
      if (currentModule === module.id) button.setAttribute('aria-current', 'step');
      button.innerHTML = `<span class="mod-num">${done ? '✓' : module.number}</span><span class="mod-label">${escapeHtml(module.title)}</span>`;
      button.addEventListener('click', () => goTo(start));
      nav.appendChild(button);
    });
  }

  function renderProgress() {
    const progressEnd = steps.length - 2;
    const current = Math.min(state.pos, progressEnd);
    const percent = state.submitted ? 100 : Math.round((current / progressEnd) * 100);
    document.querySelector('#progressFill').style.width = `${percent}%`;
    document.querySelector('#progressBar').setAttribute('aria-valuenow', String(percent));
    document.querySelector('#progressLabel').textContent = state.submitted ? 'Complete' : `${percent}%`;
  }

  function renderIntro(step) {
    const promises = (step.promises || [])
      .map((promise) => `<div class="promise"><b>${escapeHtml(promise.title)}</b><span>${escapeHtml(promise.body)}</span></div>`)
      .join('');
    return `
      <section class="step hero">
        <div class="hero-mark" aria-hidden="true">★</div>
        <span class="eyebrow">${escapeHtml(step.eyebrow || config.exerciseTitle)}</span>
        <h1>${escapeHtml(step.title)}</h1>
        ${step.subtitle ? `<p class="subtitle">${escapeHtml(step.subtitle)}</p>` : ''}
        ${step.body ? `<p class="body-copy">${escapeHtml(step.body)}</p>` : ''}
        ${promises ? `<div class="promise-grid">${promises}</div>` : ''}
      </section>`;
  }

  function renderVehiclePanel() {
    const statement = String(state.answers.north_star || '').trim();
    if (!statement) return '';
    return `
      <div class="ns-restate">
        <span class="ns-restate-label">Your North Star</span>
        <p class="ns-restate-text">${highlightNorthStar(statement)}</p>
      </div>`;
  }

  function renderNorthStarGuide(question) {
    const template = (question.template || [])
      .map((token) => token.part
        ? `<span class="seg seg-${token.part}">${escapeHtml(token.text)}</span>`
        : escapeHtml(token.text))
      .join('');
    const examples = (question.examples || []).map((example) => `
      <p class="ns-ex">
        <span class="seg-lead">By </span><span class="seg seg-time">${escapeHtml(example.time)}</span><span class="seg-lead">, I am </span><span class="seg seg-role">${escapeHtml(example.role)}</span> <span class="seg seg-thing">${escapeHtml(example.thing)}</span> <span class="seg-lead">at </span><span class="seg seg-scale">${escapeHtml(example.scale)}</span>.
      </p>`).join('');
    return `
      <div class="ns-guide">
        <div class="ns-template">
          <span class="ns-template-label">The shape to aim for</span>
          <p>${template}</p>
        </div>
        <div class="ns-anim" aria-hidden="true">
          <span class="ns-anim-label">For example</span>
          <div class="ns-anim-stack">${examples}</div>
        </div>
      </div>`;
  }

  function renderQuestion(question) {
    const number = questionNumber.get(question.id);
    const value = state.answers[question.id];
    let control = '';

    if (question.type === 'single' || question.type === 'multi') {
      const selected = question.type === 'multi' && Array.isArray(value) ? value : [];
      control = `<div class="choices ${question.type === 'multi' ? 'multi' : ''}" role="${question.type === 'single' ? 'radiogroup' : 'group'}">
        ${question.options.map(([optionValue, label]) => {
          const isSelected = question.type === 'single' ? value === optionValue : selected.includes(optionValue);
          return `<button class="choice${isSelected ? ' selected' : ''}" type="button" data-value="${escapeHtml(optionValue)}" aria-pressed="${isSelected}">
            <span class="choice-mark" aria-hidden="true">${isSelected ? '✓' : ''}</span>
            <span class="choice-text">${escapeHtml(label)}</span>
          </button>`;
        }).join('')}
      </div>
      ${question.other && (Array.isArray(value) ? value.includes('else') : value === 'else') ? `<div class="other-field"><label class="label" for="otherInput">If something else, name it</label><input class="input" id="otherInput" maxlength="160" placeholder="Tell us in a few words" value="${escapeHtml(state.answers[`${question.id}_other`] || '')}" /></div>` : ''}`;
    } else {
      const tag = question.type === 'long' ? 'textarea' : 'input';
      if (tag === 'textarea') {
        control = `<textarea class="textarea" rows="5" id="answerInput" maxlength="${question.maxLength || 500}" placeholder="${escapeHtml(question.placeholder || '')}">${escapeHtml(value || '')}</textarea>`;
      } else {
        control = `<input class="input" type="text" id="answerInput" maxlength="${question.maxLength || 500}" placeholder="${escapeHtml(question.placeholder || '')}" value="${escapeHtml(value || '')}" />`;
      }
      control += `<div class="char-count"><span id="charCount">${String(value || '').length}</span> / ${question.maxLength || 500}</div>`;
    }

    const example = Array.isArray(question.example) && question.example.length
      ? `<p class="example">${question.example.map((line) => `<em>${escapeHtml(line)}</em>`).join('<br />')}</p>`
      : '';

    return `
      <section class="step">
        <span class="question-index">Question ${number} of ${data.questions.length}</span>
        <h2>${escapeHtml(question.title)}</h2>
        ${question.northStar ? '' : (question.help ? `<p class="question-help">${escapeHtml(question.help)}</p>` : '')}
        ${question.vehicle ? renderVehiclePanel() : ''}
        ${question.northStar ? renderNorthStarGuide(question) : example}
        ${control}
        <p id="questionError" class="field-error" role="alert"></p>
      </section>`;
  }

  function attachQuestionEvents(question) {
    if (question.type === 'single' || question.type === 'multi') {
      document.querySelectorAll('.choice').forEach((button) => {
        button.addEventListener('click', () => {
          const option = button.dataset.value;
          if (question.type === 'single') {
            state.answers[question.id] = option;
          } else {
            let values = Array.isArray(state.answers[question.id]) ? [...state.answers[question.id]] : [];
            values = values.includes(option) ? values.filter((item) => item !== option) : [...values, option];
            state.answers[question.id] = values;
          }
          persist();
          // Refining the decision sends them back to edit the North Star itself.
          if (question.id === 'decision' && option === 'refine') {
            const target = steps.findIndex((step) => step.id === 'north_star');
            toast('Take another pass at your North Star, then continue.');
            goTo(target);
            return;
          }
          render();
        });
      });
      const other = document.querySelector('#otherInput');
      if (other) {
        other.addEventListener('input', () => {
          state.answers[`${question.id}_other`] = other.value;
          persist();
        });
      }
    } else {
      const input = document.querySelector('#answerInput');
      input.addEventListener('input', () => {
        state.answers[question.id] = input.value;
        const count = document.querySelector('#charCount');
        if (count) count.textContent = input.value.length;
        document.querySelector('#questionError').textContent = '';
        persist();
        updateContinueState();
      });
      // Avoid auto-popping the keyboard (and the footer-hide) on phones.
      if (!window.matchMedia('(max-width:900px)').matches) setTimeout(() => input.focus(), 0);
    }
  }

  function contactFieldError(id, message) {
    const node = document.querySelector(`[data-error-for="${id}"]`);
    if (node) node.textContent = message || '';
  }

  function answerDisplay(question) {
    const value = state.answers[question.id];
    if (question.type === 'single') {
      const option = (question.options || []).find(([optionValue]) => optionValue === value);
      let label = option ? option[1] : '';
      const other = state.answers[`${question.id}_other`];
      if (question.other && value === 'else' && other) label += ` — ${other}`;
      return label;
    }
    if (question.type === 'multi') {
      const values = Array.isArray(value) ? value : [];
      let label = (question.options || [])
        .filter(([optionValue]) => values.includes(optionValue))
        .map(([, optionLabel]) => optionLabel)
        .join('; ');
      const other = state.answers[`${question.id}_other`];
      if (question.other && values.includes('else') && other) label += ` — ${other}`;
      return label;
    }
    return String(value || '').trim();
  }

  function buildAnswerReview() {
    const rows = data.questions.map((question) => {
      const stepIndex = steps.findIndex((step) => step.id === question.id);
      const number = questionNumber.get(question.id);
      const answer = answerDisplay(question);
      const display = answer.length > 150 ? `${answer.slice(0, 150)}…` : answer;
      return `<button class="review-item" type="button" data-step="${stepIndex}">
        <span class="review-q">Question ${number}</span>
        <span class="review-a">${escapeHtml(display) || '<em>—</em>'}</span>
        <span class="review-edit">Edit</span>
      </button>`;
    }).join('');
    return `<details class="answer-review">
      <summary><span class="chev" aria-hidden="true">›</span> Review your answers <span class="rev-sub">${data.questions.length} questions</span></summary>
      <div class="review-list">${rows}</div>
    </details>`;
  }

  function renderLockedPreview() {
    const blurLines = [
      'span-90', 'span-70', 'span-100', 'span-60'
    ].map((cls) => `<span class="blur-line ${cls}"></span>`).join('');
    return `
      <div class="prescription-teaser" aria-hidden="true">
        <div class="teaser-blur">
          <span class="teaser-eyebrow">Your personalized roadmap</span>
          <span class="blur-line span-80 strong"></span>
          ${blurLines}
          <div class="teaser-rows">
            <div class="teaser-row"><span class="blur-dot"></span><span class="blur-line span-90"></span></div>
            <div class="teaser-row"><span class="blur-dot"></span><span class="blur-line span-70"></span></div>
            <div class="teaser-row"><span class="blur-dot"></span><span class="blur-line span-80"></span></div>
          </div>
        </div>
        <div class="teaser-lock">
          <div class="lock-badge">🔒</div>
          <strong>Your roadmap is ready to generate</strong>
          <span>Add your details below to unlock a plan built only for you — your milestones, your weekly rhythm, and exactly what it takes.</span>
        </div>
      </div>`;
  }

  function renderContact() {
    return `
      <section class="step">
        <span class="eyebrow">One last step · still free</span>
        <h1>Unlock your personalized North Star roadmap.</h1>
        <p class="subtitle">Your answers are done. Add your details and we will generate a roadmap built only for you — the milestones, the weekly rhythm, and the honest work it takes to reach the North Star you wrote.</p>
        ${renderLockedPreview()}
        ${buildAnswerReview()}
        <form id="contactForm" class="contact-card" novalidate>
          <div class="form-grid">
            <div class="field full">
              <label class="label" for="fullName">Your name</label>
              <input class="input" id="fullName" name="fullName" autocomplete="name" maxlength="100" value="${escapeHtml(state.contact.name || '')}" placeholder="Your full name" />
              <p class="field-error" data-error-for="name"></p>
            </div>
            <div class="field full">
              <label class="label" for="email">Email</label>
              <input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="160" value="${escapeHtml(state.contact.email || '')}" placeholder="you@example.com" />
              <p class="help">We send your roadmap here, and reach out about your fit conversation.</p>
              <p class="field-error" data-error-for="email"></p>
            </div>
            <div class="field full">
              <label class="label" for="phone">WhatsApp number</label>
              <div class="phone-row">
                <input class="input country-code" id="countryCode" name="countryCode" type="tel" inputmode="tel" autocomplete="tel-country-code" maxlength="5" aria-label="Country calling code" value="${escapeHtml(state.contact.countryCode || '+91')}" placeholder="+91" />
                <input class="input" id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="18" value="${escapeHtml(state.contact.phone || '')}" placeholder="98765 43210" />
              </div>
              <p class="help">Use your international calling code, for example +91, +1, +44, or +971.</p>
              <p class="field-error" data-error-for="phone"></p>
            </div>
            <div class="field full honeypot" aria-hidden="true">
              <label for="companyWebsite">Company website</label>
              <input id="companyWebsite" name="companyWebsite" tabindex="-1" autocomplete="off" />
            </div>
            <div class="field full">
              <label class="consent">
                <input id="consent" name="consent" type="checkbox"${state.contact.consent ? ' checked' : ''} />
                <span>I would like 100x Engineers to read my answers and reach out on WhatsApp about my fit conversation. I can opt out at any time.</span>
              </label>
              <p class="field-error" data-error-for="consent"></p>
            </div>
            <div class="field full privacy-note">
              <span aria-hidden="true">🔒</span>
              <span>The clarity is yours to keep either way. Your answers are used for this review and are not displayed publicly.</span>
            </div>
            <div class="field full">
              <button id="submitButton" class="btn btn--primary" type="submit">Generate my roadmap →</button>
              <div id="submitStatus" class="submit-status" role="status" aria-live="polite"></div>
              <div id="submitError" class="error-summary" hidden></div>
            </div>
          </div>
        </form>
      </section>`;
  }

  function attachContactEvents() {
    const form = document.querySelector('#contactForm');
    const fields = ['fullName', 'email', 'phone', 'countryCode', 'consent'];
    fields.forEach((id) => {
      const el = document.querySelector(`#${id}`);
      el.addEventListener('change', saveContactDraft);
      el.addEventListener('input', () => {
        saveContactDraft();
        el.classList.remove('is-error');
      });
    });
    form.addEventListener('submit', submitExercise);
    document.querySelectorAll('.review-item').forEach((btn) => {
      btn.addEventListener('click', () => goTo(Number(btn.dataset.step)));
    });
  }

  function saveContactDraft() {
    state.contact = {
      name: document.querySelector('#fullName').value,
      email: document.querySelector('#email').value,
      phone: document.querySelector('#phone').value,
      countryCode: document.querySelector('#countryCode').value,
      consent: document.querySelector('#consent').checked
    };
    persist();
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
  }

  function validateContact() {
    saveContactDraft();
    const errors = {};
    if (state.contact.name.trim().length < 2) errors.name = 'Enter the name you signed up with.';
    if (!validEmail(state.contact.email)) errors.email = 'Enter a valid email so we can send your roadmap.';
    const normalizedPhone = engine.normalizePhone(state.contact.countryCode, state.contact.phone);
    if (!normalizedPhone) errors.phone = 'Enter a valid WhatsApp number with country code.';
    if (!state.contact.consent) errors.consent = 'We need your consent to reach out about your fit conversation.';
    ['name', 'email', 'phone', 'consent'].forEach((id) => contactFieldError(id, errors[id]));
    document.querySelector('#fullName').classList.toggle('is-error', Boolean(errors.name));
    document.querySelector('#email').classList.toggle('is-error', Boolean(errors.email));
    document.querySelector('#phone').classList.toggle('is-error', Boolean(errors.phone));
    document.querySelector('#countryCode').classList.toggle('is-error', Boolean(errors.phone));
    return { errors, normalizedPhone };
  }

  const THINKING_LINES = [
    'Reading your North Star…',
    'Mapping where you stand today…',
    'Searching for what your goal really takes…',
    'Sizing milestones to the hours you actually have…',
    'Planning around the places you tend to stall…',
    'Writing your roadmap…'
  ];

  function startThinking() {
    stage.innerHTML = `
      <section class="step thinking-step">
        <div class="thinking-orb" aria-hidden="true"><span></span><span></span><span></span></div>
        <span class="eyebrow">Generating your roadmap</span>
        <h1 class="thinking-title">Building a plan only for you.</h1>
        <p class="subtitle">This takes a few moments. We are reading everything you wrote and grounding the plan in what your North Star really takes.</p>
        <ul class="thinking-lines" id="thinkingLines"></ul>
      </section>`;
    const list = document.querySelector('#thinkingLines');
    let i = 0;
    const add = () => {
      if (!list || i >= THINKING_LINES.length) return;
      const active = list.querySelector('.thinking-line.active');
      if (active) {
        active.classList.remove('active');
        active.classList.add('done');
        const mark = active.querySelector('.tl-mark');
        if (mark) mark.textContent = '✓';
      }
      const li = document.createElement('li');
      li.className = 'thinking-line active';
      li.innerHTML = `<span class="tl-mark" aria-hidden="true"></span><span class="tl-text">${escapeHtml(THINKING_LINES[i])}</span>`;
      list.appendChild(li);
      i += 1;
    };
    add();
    const timer = setInterval(add, 1400);
    return () => clearInterval(timer);
  }

  function fireConfetti() {
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const colors = ['#F96846', '#E8542F', '#2563EB', '#108A46', '#F5A623', '#1D1D1F'];
    const pieces = Array.from({ length: 150 }, () => ({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * window.innerHeight * 0.6,
      r: 5 + Math.random() * 6,
      c: colors[(Math.random() * colors.length) | 0],
      vx: -2.4 + Math.random() * 4.8,
      vy: 2.6 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: -0.22 + Math.random() * 0.44,
      square: Math.random() < 0.5
    }));
    const DURATION = 2800;
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION);
        ctx.fillStyle = p.c;
        if (p.square) ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.62);
        else { ctx.beginPath(); ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      });
      if (elapsed < DURATION) raf = requestAnimationFrame(tick);
      else canvas.remove();
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    setTimeout(() => { cancelAnimationFrame(raf); canvas.remove(); }, DURATION + 600);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function submitExercise(event) {
    event.preventDefault();
    const answerErrors = engine.validateAnswers(state.answers, data.questions);
    if (Object.keys(answerErrors).length) {
      const firstId = Object.keys(answerErrors)[0];
      const firstIndex = steps.findIndex((step) => step.id === firstId);
      toast('One answer still needs your attention.');
      goTo(firstIndex);
      return;
    }

    const { errors, normalizedPhone } = validateContact();
    if (Object.keys(errors).length) return;

    const honeypot = document.querySelector('#companyWebsite').value;
    const assessment = engine.scoreAssessment(state.answers);
    const fitSignals = engine.rankFitSignals(state.answers);
    const payload = {
      exerciseId: config.exerciseId,
      name: state.contact.name.trim(),
      email: String(state.contact.email || '').trim(),
      phone: normalizedPhone,
      consent: true,
      answers: state.answers,
      clientAssessment: assessment,
      clientFitSignals: fitSignals,
      startedAt: new Date(state.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      elapsedSeconds: Math.max(1, Math.round((Date.now() - state.startedAt) / 1000)),
      website: honeypot
    };

    // Swap the form for the thinking loader while the roadmap generates.
    const stopThinking = startThinking();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const shownAt = Date.now();

    try {
      let responseData = null;
      if (config.allowLocalDemo && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        await delay(2600);
        responseData = { id: `local-${Date.now()}`, assessment, fitSignals, roadmap: engine.buildRoadmap(state.answers, state.contact), demo: true };
      } else if (config.submissionEndpoint && !config.submissionEndpoint.includes('YOUR-PROJECT-REF')) {
        const response = await fetch(config.submissionEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        responseData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(responseData.error || 'Your exercise could not be sent.');
      } else {
        throw new Error('Submissions are not configured yet. Please tell the 100x team.');
      }

      // Let the loader breathe for a moment even on a fast response.
      const shownFor = Date.now() - shownAt;
      if (shownFor < 2200) await delay(2200 - shownFor);
      stopThinking();

      state.submitted = true;
      state.submissionId = responseData.id;
      state.assessment = responseData.assessment || assessment;
      state.fitSignals = responseData.fitSignals || fitSignals;
      state.roadmap = responseData.roadmap || engine.buildRoadmap(state.answers, state.contact);
      state.maxReached = steps.length - 1;
      state.pos = steps.length - 1;
      persist();
      localStorage.setItem(RECEIPT_KEY, JSON.stringify({
        id: state.submissionId,
        exerciseId: config.exerciseId,
        submittedAt: new Date().toISOString()
      }));
      pendingCelebration = true;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      stopThinking();
      render();
      const errorBox = document.querySelector('#submitError');
      if (errorBox) {
        errorBox.textContent = error.message || 'Something went wrong. Your answers are still saved on this device.';
        errorBox.hidden = false;
      }
      const submitButton = document.querySelector('#submitButton');
      if (submitButton) submitButton.textContent = 'Try again →';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function renderResult() {
    const roadmap = state.roadmap || engine.buildRoadmap(state.answers, state.contact);
    const firstName = escapeHtml((state.contact.name || '').trim().split(/\s+/)[0]);
    const statement = String(roadmap.statement || state.answers.north_star || '').trim();
    const headline = roadmap.headline
      || (firstName ? `${firstName}, here is your path to your North Star.` : 'Here is your path to your North Star.');
    const milestones = Array.isArray(roadmap.milestones) ? roadmap.milestones : [];
    const why100x = Array.isArray(roadmap.why100x) ? roadmap.why100x : [];
    const principles = Array.isArray(roadmap.firstPrinciples)
      ? roadmap.firstPrinciples.map((item) => (typeof item === 'string' ? item : (item && item.detail) || '')).filter(Boolean)
      : [];

    return `
      <section class="step result-step">
        <div class="result-head">
          <div>
            <span class="result-badge">Your personalized roadmap</span>
            <h1>${escapeHtml(headline)}</h1>
          </div>
          <button id="printButton" class="btn btn--secondary" type="button">Print / save PDF</button>
        </div>
        ${statement ? `<div class="ns-restate result-ns"><span class="ns-restate-label">Your North Star</span><p class="ns-restate-text">${renderNorthStarSegments(roadmap, statement)}</p></div>` : ''}
        ${roadmap.reality ? `<div class="reality-box"><span class="eyebrow">The honest read</span><p>${escapeHtml(roadmap.reality)}</p></div>` : ''}
        ${principles.length ? `
        <div class="principles">
          <span class="eyebrow">From first principles</span>
          <ul>${principles.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
        </div>` : ''}
        ${roadmap.insight ? `<div class="insight-box"><span class="insight-tag">What we found</span><p>${escapeHtml(roadmap.insight)}</p></div>` : ''}
        <span class="eyebrow">Your six-month path</span>
        <h2>Simple milestones, sized to your life.</h2>
        <div class="timeline">
          ${milestones.map((m) => `
            <div class="tl-item">
              <span class="tl-node" aria-hidden="true"></span>
              <span class="tl-window">${escapeHtml(m.window || '')}</span>
              <div class="tl-card">
                <h3>${escapeHtml(m.title || '')}</h3>
                <p>${escapeHtml(m.detail || '')}</p>
              </div>
            </div>`).join('')}
        </div>
        ${roadmap.whatItTakes ? `<div class="takes-box"><h3>What it will take</h3><p>${escapeHtml(roadmap.whatItTakes)}</p></div>` : ''}
        <span class="eyebrow">Why 100x is built for this</span>
        <h2>How we would get you there faster.</h2>
        <div class="fit-grid">
          ${why100x.map((item) => `<article class="fit-card"><div class="fit-icon" aria-hidden="true">★</div><div><h3>${escapeHtml(item.title || '')}</h3><p>${escapeHtml(item.detail || '')}</p></div></article>`).join('')}
        </div>
        <div class="next-box">
          <h3>Your next step</h3>
          <p>This roadmap is yours to keep, whatever you decide. If you want us to walk it with you, bring it to your fit conversation — we will tell you honestly whether 100x is the right vehicle for the North Star you set, and if it is not, we will point you somewhere better.</p>
        </div>
      </section>`;
  }

  function updateContinueState() {
    // Keep Continue clickable so an empty answer gets a visible reason on click,
    // instead of a silent disabled button.
    continueButton.disabled = false;
  }

  function renderFooter() {
    const step = steps[state.pos];
    const hidden = step.type === 'contact' || step.type === 'result';
    footer.style.display = hidden ? 'none' : 'flex';
    if (hidden) return;

    backButton.style.visibility = state.pos === 0 ? 'hidden' : 'visible';
    backButton.onclick = () => goTo(state.pos - 1);
    continueButton.textContent = 'Continue →';
    continueButton.onclick = () => {
      if (data.questions.includes(step) && !valueIsComplete(step)) {
        const error = document.querySelector('#questionError');
        error.textContent = step.type === 'single' || step.type === 'multi'
          ? 'Pick an option to continue.'
          : 'Add your answer to continue.';
        const field = document.querySelector('#answerInput');
        if (field) field.focus();
        return;
      }
      unlockNext();
    };
    updateContinueState();

    const moduleStepIndexes = steps
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.module === step.module);
    document.querySelector('#stepDots').innerHTML = moduleStepIndexes
      .map(({ index }) => `<span class="step-dot${index < state.pos ? ' done' : ''}${index === state.pos ? ' current' : ''}"></span>`)
      .join('');
  }

  function render() {
    const step = steps[state.pos];
    renderNavigation();
    renderProgress();

    if (step.type === 'intro') stage.innerHTML = renderIntro(step);
    else if (step.type === 'contact') stage.innerHTML = renderContact();
    else if (step.type === 'result') stage.innerHTML = renderResult();
    else stage.innerHTML = renderQuestion(step);

    if (data.questions.includes(step)) attachQuestionEvents(step);
    if (step.type === 'contact') attachContactEvents();
    if (step.type === 'result') {
      document.querySelector('#printButton').addEventListener('click', () => window.print());
      if (pendingCelebration) {
        pendingCelebration = false;
        fireConfetti();
      }
    }
    renderFooter();
  }

  document.querySelector('#homeLink').addEventListener('click', () => goTo(0));
  menuButton.addEventListener('click', () => {
    const open = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', open);
    scrim.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
  });
  scrim.addEventListener('click', closeSidebar);
  // On phones, hide the sticky footer while typing so the on-screen keyboard
  // never covers the Continue button (CSS applies the hide only under 900px).
  const isStageField = (target) => target && target.closest && target.closest('#stage') && /^(INPUT|TEXTAREA)$/.test(target.tagName);
  document.addEventListener('focusin', (event) => { if (isStageField(event.target)) document.body.classList.add('kbd-typing'); });
  document.addEventListener('focusout', (event) => { if (isStageField(event.target)) document.body.classList.remove('kbd-typing'); });
  document.querySelector('#resetBtn').addEventListener('click', () => {
    if (!window.confirm('Clear your answers and restart the exercise?')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RECEIPT_KEY);
    window.location.reload();
  });

  render();
})();
