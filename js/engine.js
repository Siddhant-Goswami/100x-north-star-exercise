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
    const keys = stuckList.length ? stuckList : ['else'];
    const points = [];
    keys.forEach((key) => {
      const description = guardrails[key] || guardrails.else;
      if (!points.includes(description)) points.push(description);
    });
    const guardrail = {
      id: 'guardrail',
      label: points.length > 1 ? 'Guardrails for where you stall' : 'A guardrail for where you stall',
      description: points[0],
      points
    };

    return [track, rhythm, guardrail];
  }

  // A deterministic, personalized roadmap used as the fallback when the
  // LLM-generated roadmap is unavailable (no API key, rate limit, or error).
  // The server returns a richer version; this keeps the experience whole.
  function buildRoadmap(answers, contact) {
    answers = answers || {};
    contact = contact || {};
    const name = text(contact.name).split(/\s+/)[0];
    const statement = text(answers.north_star);
    const isBuild = answers.path === 'build';
    const hours = WEEKLY_HOURS[answers.weekly_hours] || WEEKLY_HOURS['2-4'];
    const stuckList = Array.isArray(answers.stuck_on)
      ? answers.stuck_on
      : (answers.stuck_on ? [answers.stuck_on] : []);

    const headline = name
      ? `${name}, here is the shortest honest path to your North Star.`
      : 'Here is the shortest honest path to your North Star.';

    const reality = isBuild
      ? 'You do not need a bigger idea — you need one small thing shipped in front of one real user, then improved every week. The gap is not talent or tools; it is reps. This plan turns six months into a stack of small, finished reps instead of one heroic project you never launch.'
      : 'You do not need another certificate — you need proof. A few real things you built with AI, explained well, move you further than any course logo on a profile. This plan is built to produce that proof, one shipped piece at a time, sized to the time you actually have.';

    const milestones = isBuild
      ? [
          { window: 'Weeks 1–4', title: 'Ship the smallest real version', detail: `Pick the narrowest slice of your idea and get a working version in front of one real person. Sized to ${hours.label}, so finishing is normal, not heroic.` },
          { window: 'Weeks 5–10', title: 'Put it in front of users and listen', detail: 'Get five to ten people using it. Their friction — not your roadmap — tells you what to build next. You learn to read signal instead of guessing.' },
          { window: 'Weeks 11–18', title: 'Earn the first signal of demand', detail: 'Turn use into a waitlist, a first payment, or a committed pilot. The goal is one undeniable proof that someone wants this enough to act.' },
          { window: 'Weeks 19–26', title: 'Make it repeatable', detail: 'Tighten the loop from idea to shipped feature so you can keep moving after the program ends — running your thing, not just having built it once.' }
        ]
      : [
          { window: 'Weeks 1–4', title: 'Build your first AI proof piece', detail: `Ship one small, real project that uses AI to solve an actual problem at work or in your field. Sized to ${hours.label}, so it gets finished.` },
          { window: 'Weeks 5–10', title: 'Make it visible and useful', detail: 'Put your work where the right people see it — a demo for your team, a post, a portfolio piece — so the value is obvious without you explaining it twice.' },
          { window: 'Weeks 11–18', title: 'Stack two or three undeniable wins', detail: 'Repeat the loop until you have a small body of work that proves you can apply AI, not just talk about it. This is what changes the conversation about a job, raise, or role.' },
          { window: 'Weeks 19–26', title: 'Turn proof into the ask', detail: 'Use the evidence you built to make the move — the pitch, the internal project, the interview — backed by things you actually shipped.' }
        ];

    const whatItTakes = `Honestly? About ${hours.label}, protected and consistent. Not bursts of motivation — a rhythm that survives your worst weeks. Six months of small finished reps beats two months of heroics followed by a stall. If you can guard those hours, this is very doable.`;

    const whyMap = {
      time: { title: 'Sized to your real hours', detail: `Your weekly goals are built around the ${hours.label} you reported, so consistency beats intensity and finishing stays the normal case.` },
      confidence: { title: 'You build from day one, with a mentor', detail: 'You prove you are technical enough by doing — not by guessing today. A mentor is there for the hard parts so you do not stall on them alone.' },
      clarity: { title: 'A mentor keeps the thread', detail: 'The moment you lose the plot — the exact failure mode you named — someone is there to point you back at the next concrete step.' },
      momentum: { title: 'Visible wins, early and often', detail: 'You ship something rough early and improve it, so progress stays visible instead of feeling slow or invisible.' },
      accountability: { title: 'Someone is actually checking in', detail: 'The weekly check-in is the support most people miss when they try this alone — and the reason they finish here.' }
    };
    const seen = new Set();
    const why100x = [isBuild
      ? { title: 'Built around shipping your own thing', detail: 'The whole program is structured to get you running a product, tool, or first paying client — exactly the outcome you chose.' }
      : { title: 'Built around real, hireable proof', detail: 'The program is structured to produce work that gets you hired, promoted, or raised — with AI as the lever, exactly the outcome you chose.' }];
    seen.add(why100x[0].title);
    (stuckList.length ? stuckList : ['time']).forEach((key) => {
      const item = whyMap[key];
      if (item && !seen.has(item.title)) { seen.add(item.title); why100x.push(item); }
    });
    while (why100x.length < 3) {
      const fill = whyMap.accountability;
      if (seen.has(fill.title)) break;
      seen.add(fill.title); why100x.push(fill);
    }

    return {
      generatedBy: 'fallback',
      headline,
      statement,
      reality,
      milestones,
      whatItTakes,
      why100x: why100x.slice(0, 3)
    };
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

  return { scoreAssessment, rankFitSignals, buildRoadmap, normalizePhone, validateAnswers, hasTimeAndScale };
});
