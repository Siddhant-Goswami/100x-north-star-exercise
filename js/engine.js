(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ExerciseEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TIME_MARKERS = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
  ];

  // How many hours each weekly band represents, used for plan sizing.
  const WEEKLY_HOURS = {
    under2: { value: 1, label: 'under 2 hours a week' },
    '2-4': { value: 3, label: '2–4 hours a week' },
    '5-7': { value: 6, label: '5–7 hours a week' },
    '8-12': { value: 10, label: '8–12 hours a week' },
    '12plus': { value: 14, label: 'more than 12 hours a week' }
  };

  function text(value) {
    return String(value || '').trim();
  }

  function detailScore(value, thresholds) {
    const length = text(value).length;
    if (length >= thresholds[2]) return 5;
    if (length >= thresholds[1]) return 4;
    if (length >= thresholds[0]) return 3;
    return length ? 2 : 1;
  }

  // A North Star is concrete when it names a time horizon and a level/number.
  function hasTimeAndScale(value) {
    const normalized = text(value).toLowerCase();
    const hasTime = /\b20\d\d\b/.test(normalized) || TIME_MARKERS.some((month) => normalized.includes(month));
    const hasScale = /\d/.test(normalized);
    return hasTime && hasScale;
  }

  function scoreAssessment(answers) {
    const northStarBase = detailScore(answers.north_star, [40, 80, 140]);
    const northStarClarity = hasTimeAndScale(answers.north_star)
      ? Math.min(5, Math.max(4, northStarBase))
      : northStarBase;

    const timeRealism = answers.worst_week_hours === '5plus' ? 5
      : answers.worst_week_hours === '3-5' ? 4
      : answers.worst_week_hours === '1-2' ? 3
      : 1;

    let commitmentSignal = answers.decision === 'yes' ? 5 : answers.decision === 'refine' ? 3 : 2;
    if (answers.weekly_hours === 'under2') commitmentSignal = Math.min(commitmentSignal, 2);

    const stats = {
      northStarClarity,
      // Outcome clarity reads how fully the North Star describes the outcome itself.
      outcomeClarity: detailScore(answers.north_star, [60, 120, 200]),
      // Motivation depth reads the "why now" answer that opened this section.
      motivationDepth: detailScore(answers.itch, [40, 80, 150]),
      gapHonesty: detailScore(answers.stall_point, [50, 110, 200]),
      startingClarity: detailScore(answers.journey, [50, 110, 200]),
      timeRealism,
      commitmentSignal
    };

    const flags = [];
    if (answers.weekly_hours === 'under2') flags.push('low-weekly-hours');
    if (answers.worst_week_hours === 'none') flags.push('no-worst-week-buffer');
    if (answers.weekly_hours === 'under2' && answers.worst_week_hours === 'none') flags.push('no-consistent-hours');
    if (stats.northStarClarity <= 2) flags.push('north-star-vague');
    const stuckList = Array.isArray(answers.stuck_on) ? answers.stuck_on : (answers.stuck_on ? [answers.stuck_on] : []);
    if (stuckList.includes('time')) flags.push('stuck-on-time');
    if (answers.decision === 'unsure') flags.push('still-deciding');
    if (answers.decision === 'refine') flags.push('wants-to-refine');

    const average = Object.values(stats).reduce((sum, value) => sum + value, 0) / Object.keys(stats).length;
    let readinessState = 'Clarity in progress';
    if (average >= 4) readinessState = 'Ready for a fit conversation';
    else if (average >= 3) readinessState = 'Clear North Star forming';

    return { stats, readinessState, flags };
  }

  // Three reflections that map the answers onto how the program closes the gap.
  function rankFitSignals(answers) {
    const track = answers.path === 'build'
      ? {
          id: 'track', label: 'Builder track',
          description: 'Built around shipping and running your own thing — a product, tool, service, or first paying client.'
        }
      : {
          id: 'track', label: 'Career track',
          description: 'Built around getting hired, promoted, or raised, with AI as the lever that gets you there.'
        };

    const hours = WEEKLY_HOURS[answers.weekly_hours] || WEEKLY_HOURS['2-4'];
    const rhythm = {
      id: 'rhythm', label: 'A weekly rhythm that fits',
      description: `Your goals are sized to the ${hours.label} you reported, so finishing is the normal case and not a heroic one.`
    };

    const guardrails = {
      time: 'Your weekly goals are sized to the hours you actually have, so consistency beats intensity here.',
      confidence: 'You build from the first module with a mentor, so you confirm you are technical enough by doing, not by guessing today.',
      clarity: 'A mentor checks the thread when you lose it — the exact failure mode most people name when they try this alone.',
      momentum: 'You ship something rough early and improve it, so results stay visible instead of feeling slow or invisible.',
      accountability: 'A mentor checks in on you, the kind of support most people miss when they go it alone.',
      else: 'A mentor checks the thread when you lose it, the exact failure mode most people name when they have tried this alone.'
    };
    const stuckList = Array.isArray(answers.stuck_on) ? answers.stuck_on : (answers.stuck_on ? [answers.stuck_on] : []);
    const guardrail = {
      id: 'guardrail', label: 'A guardrail for where you stall',
      description: guardrails[stuckList[0]] || guardrails.else
    };

    return [track, rhythm, guardrail];
  }

  function normalizePhone(countryCode, phone) {
    const codeDigits = text(countryCode).replace(/\D/g, '');
    let phoneDigits = text(phone).replace(/\D/g, '');
    if (!codeDigits || codeDigits.length > 4) return null;
    if (codeDigits === '91' && phoneDigits.length === 11 && phoneDigits.startsWith('0')) phoneDigits = phoneDigits.slice(1);
    const result = `+${codeDigits}${phoneDigits}`;
    if (!/^\+[1-9]\d{9,14}$/.test(result)) return null;
    return result;
  }

  function validateAnswers(answers, questions) {
    const errors = {};
    questions.forEach((question) => {
      const value = answers[question.id];
      if (!text(value)) {
        errors[question.id] = 'Answer this question to continue.';
      }
    });
    return errors;
  }

  return { scoreAssessment, rankFitSignals, normalizePhone, validateAnswers, hasTimeAndScale };
});
