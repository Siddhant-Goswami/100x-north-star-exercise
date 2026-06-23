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
    const quote = statement
      ? `<div class="star-quote"><span>Your North Star</span><p>${escapeHtml(statement)}</p></div>`
      : '';
    return `
      ${quote}
      <div class="vehicle-panel">
        <div class="vehicle-cols">
          <div class="vehicle-card good">
            <h4><span aria-hidden="true">✓</span> This is built for you if</h4>
            <ul>
              <li>You learn by building, not by collecting tutorials you never finish.</li>
              <li>You have a real goal — a job, a raise, a product, a client — and want AI to be the lever.</li>
              <li>You can protect a small but consistent number of hours each week.</li>
              <li>You are willing to ship something rough and improve it, instead of waiting until you feel ready.</li>
            </ul>
          </div>
          <div class="vehicle-card warn">
            <h4><span aria-hidden="true">→</span> This is probably not for you yet if</h4>
            <ul>
              <li>You want a certificate for a profile and nothing more.</li>
              <li>You cannot find any consistent weekly hours in the next six months.</li>
              <li>You want someone to build it for you, rather than learn to build it yourself.</li>
              <li>You are looking for passive theory and not hands-on work.</li>
            </ul>
          </div>
        </div>
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

  function renderContact() {
    return `
      <section class="step">
        <span class="eyebrow">Your exercise is complete</span>
        <h1>Send it back to us, or bring it to your fit conversation.</h1>
        <p class="subtitle">We will read it the same way you wrote it, honestly, and tell you whether this is the right vehicle for the North Star you set. Add the name and WhatsApp number you signed up with.</p>
        ${buildAnswerReview()}
        <form id="contactForm" class="contact-card" novalidate>
          <div class="form-grid">
            <div class="field full">
              <label class="label" for="fullName">Your name</label>
              <input class="input" id="fullName" name="fullName" autocomplete="name" maxlength="100" value="${escapeHtml(state.contact.name || '')}" placeholder="Your full name" />
              <p class="field-error" data-error-for="name"></p>
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
              <button id="submitButton" class="btn btn--primary" type="submit">Send for review →</button>
              <div id="submitStatus" class="submit-status" role="status" aria-live="polite"></div>
              <div id="submitError" class="error-summary" hidden></div>
            </div>
          </div>
        </form>
      </section>`;
  }

  function attachContactEvents() {
    const form = document.querySelector('#contactForm');
    const fields = ['fullName', 'phone', 'countryCode', 'consent'];
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
      phone: document.querySelector('#phone').value,
      countryCode: document.querySelector('#countryCode').value,
      consent: document.querySelector('#consent').checked
    };
    persist();
  }

  function validateContact() {
    saveContactDraft();
    const errors = {};
    if (state.contact.name.trim().length < 2) errors.name = 'Enter the name you signed up with.';
    const normalizedPhone = engine.normalizePhone(state.contact.countryCode, state.contact.phone);
    if (!normalizedPhone) errors.phone = 'Enter a valid WhatsApp number with country code.';
    if (!state.contact.consent) errors.consent = 'We need your consent to reach out about your fit conversation.';
    ['name', 'phone', 'consent'].forEach((id) => contactFieldError(id, errors[id]));
    document.querySelector('#fullName').classList.toggle('is-error', Boolean(errors.name));
    document.querySelector('#phone').classList.toggle('is-error', Boolean(errors.phone));
    document.querySelector('#countryCode').classList.toggle('is-error', Boolean(errors.phone));
    return { errors, normalizedPhone };
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

    const submitButton = document.querySelector('#submitButton');
    const status = document.querySelector('#submitStatus');
    const errorBox = document.querySelector('#submitError');
    const honeypot = document.querySelector('#companyWebsite').value;
    submitButton.disabled = true;
    submitButton.textContent = 'Sending…';
    status.textContent = 'Saving your exercise for review.';
    errorBox.hidden = true;

    const assessment = engine.scoreAssessment(state.answers);
    const fitSignals = engine.rankFitSignals(state.answers);
    const payload = {
      exerciseId: config.exerciseId,
      name: state.contact.name.trim(),
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

    try {
      let responseData = null;
      if (config.allowLocalDemo && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        responseData = { id: `local-${Date.now()}`, assessment, fitSignals, demo: true };
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

      state.submitted = true;
      state.submissionId = responseData.id;
      state.assessment = responseData.assessment || assessment;
      state.fitSignals = responseData.fitSignals || fitSignals;
      state.maxReached = steps.length - 1;
      state.pos = steps.length - 1;
      persist();
      localStorage.setItem(RECEIPT_KEY, JSON.stringify({
        id: state.submissionId,
        exerciseId: config.exerciseId,
        submittedAt: new Date().toISOString()
      }));
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = 'Try again →';
      status.textContent = '';
      errorBox.textContent = error.message || 'Something went wrong. Your answers are still saved on this device.';
      errorBox.hidden = false;
    }
  }

  function renderResult() {
    const assessment = state.assessment || engine.scoreAssessment(state.answers);
    const fitSignals = state.fitSignals || engine.rankFitSignals(state.answers);
    const s = assessment.stats;
    const scores = [
      ['North Star clarity', s.northStarClarity],
      ['Outcome clarity', s.outcomeClarity],
      ['Motivation depth', s.motivationDepth],
      ['Gap honesty', s.gapHonesty],
      ['Starting clarity', s.startingClarity],
      ['Time realism', s.timeRealism],
      ['Commitment signal', s.commitmentSignal]
    ];
    const firstName = escapeHtml((state.contact.name || '').trim().split(/\s+/)[0]);
    const statement = String(state.answers.north_star || '').trim();
    const icons = { track: '🎯', rhythm: '🗓️', guardrail: '🛟' };

    return `
      <section class="step result-step">
        <div class="result-head">
          <div>
            <span class="result-badge">${escapeHtml(assessment.readinessState)}</span>
            <h1>${firstName ? `${firstName}, your North Star is yours to keep.` : 'Your North Star is yours to keep.'}</h1>
            <p class="subtitle">These scores describe how clear and honest your answers are right now. They help us decide what to talk through before we tell you, straight, whether we are the right vehicle.</p>
          </div>
          <button id="printButton" class="btn btn--secondary" type="button">Print / save PDF</button>
        </div>
        ${statement ? `<div class="star-quote"><span>Your North Star statement</span><p>${escapeHtml(statement)}</p></div>` : ''}
        <div class="score-grid">
          ${scores.map(([label, score]) => `<div class="score-card"><strong>${score}/5</strong><span>${escapeHtml(label)}</span><div class="score-bar"><i style="width:${score * 20}%"></i></div></div>`).join('')}
        </div>
        <span class="eyebrow">How we would close the gap you described</span>
        <h2>If this is the right vehicle, here is the shape of it.</h2>
        <div class="fit-grid">
          ${fitSignals.map((item) => {
            const body = Array.isArray(item.points) && item.points.length > 1
              ? `<ul class="fit-points">${item.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`
              : `<p>${escapeHtml(item.description)}</p>`;
            return `<article class="fit-card"><div class="fit-icon" aria-hidden="true">${icons[item.id] || '★'}</div><div><h3>${escapeHtml(item.label)}</h3>${body}</div></article>`;
          }).join('')}
        </div>
        <div class="next-box">
          <h3>Your next step</h3>
          <p>Send this back to us, or bring it to your fit conversation. We will read it honestly and tell you whether this is the right vehicle for the North Star you set. If it is, we will show you exactly what your first thirty days look like. If it is not, we will point you somewhere better.</p>
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
    if (step.type === 'result') document.querySelector('#printButton').addEventListener('click', () => window.print());
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
