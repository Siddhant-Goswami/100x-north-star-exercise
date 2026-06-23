(function (root) {
  const questions = [
    // PART 1 — Where you stand today
    {
      id: 'role_experience', module: 'standing', type: 'text',
      title: 'What is your current role or designation, and how many years of total experience do you have?',
      help: 'This is the floor we measure progress from. Keep it simple and factual.',
      placeholder: 'e.g. Product Manager, 6 years', maxLength: 140
    },
    {
      id: 'journey', module: 'standing', type: 'long',
      title: 'In a few lines, what is the shape of your journey so far?',
      help: 'Not a resume. Just the rough arc of how you got to where you are now.',
      placeholder: 'Where you started, the turns it took, where you are today.', maxLength: 900
    },
    {
      id: 'code_history', module: 'standing', type: 'long',
      title: 'Have you written code before? If yes, roughly how long, and what have you built?',
      help: 'There is no right answer here. None at all is a perfectly good starting point.',
      placeholder: 'e.g. A bit of Python years ago, or never, or I ship production code weekly.', maxLength: 700
    },
    {
      id: 'building_now', module: 'standing', type: 'long',
      title: 'Are you building or running anything of your own right now? If yes, what?',
      help: 'A side project, a product, a service, a small business — anything you own and run.',
      placeholder: 'Describe it, or say not right now.', maxLength: 700
    },
    {
      id: 'weekly_hours', module: 'standing', type: 'single',
      title: 'On a normal week, how many hours do you have or can spend on learning?',
      help: 'Be honest, not aspirational. This is the single most useful answer on the form. The program only works when your weekly goals are sized to the hours you actually have, not the hours you wish you had.',
      options: [
        ['under2', 'Under 2 hours'],
        ['2-4', '2–4 hours'],
        ['5-7', '5–7 hours'],
        ['8-12', '8–12 hours'],
        ['12plus', 'More than 12 hours']
      ]
    },
    {
      id: 'worst_week_hours', module: 'standing', type: 'single',
      title: 'On your worst recent week (deadlines, on-call, travel, family), how many did you actually have?',
      help: 'The honest worst case matters more than the good week. A plan that survives your worst week is a plan that finishes.',
      options: [
        ['none', 'Almost none'],
        ['1-2', '1–2 hours'],
        ['3-5', '3–5 hours'],
        ['5plus', 'More than 5 hours']
      ]
    },
    {
      id: 'worst_week_cause', module: 'standing', type: 'long',
      title: 'What usually makes your worst weeks worse?',
      help: 'Naming the pattern is the first step to planning around it.',
      placeholder: 'e.g. Quarter-end crunch, travel, kids unwell, on-call rotations.', maxLength: 600
    },

    // PART 2 — Where you want to be
    {
      id: 'itch', module: 'northstar', type: 'long',
      title: 'What made you start looking for a program like this right now?',
      help: 'This is the part most people skip, then wonder where six months went. Slow down here.',
      placeholder: 'Write whatever comes to mind. No editing.', maxLength: 900
    },
    {
      id: 'path', module: 'northstar', type: 'single', other: true,
      title: 'Six months from now, which of these sounds more like you?',
      help: 'Choose the one that pulls harder. You confirm your real path later, from experience, not from this guess.',
      options: [
        ['job', 'I got a better job, promotion, or raise — and AI is the reason I got it.'],
        ['build', 'I built something with AI — a product, tool, service, or business — and I am running it.'],
        ['else', 'Something else.']
      ]
    },
    {
      id: 'north_star', module: 'northstar', type: 'long',
      title: 'Write your North Star statement.',
      northStar: true,
      template: [
        { text: 'By ' },
        { text: '[month + year]', part: 'time' },
        { text: ', I am ' },
        { text: '[role or identity]', part: 'role' },
        { text: ' doing ' },
        { text: '[specific thing]', part: 'thing' },
        { text: ' at ' },
        { text: '[level, income, or scale]', part: 'scale' },
        { text: '.' }
      ],
      examples: [
        { time: 'December 2026', role: 'an AI real-estate consultant', thing: 'helping agencies automate lead gen', scale: '$15,000 per month' },
        { time: 'December 2026', role: 'the go-to AI person on my team', thing: 'leading the internal LLM rollout', scale: 'enterprise scale' },
        { time: 'December 2026', role: 'a solo founder', thing: 'running a working AI product', scale: '$2,000 in monthly recurring revenue' }
      ],
      placeholder: 'By December 2026, I am …', maxLength: 500
    },

    // PART 3 — The gap between
    {
      id: 'stall_point', module: 'gap', type: 'long',
      title: 'Have you tried to move toward this goal before, on your own or through a course or a side project? If yes, where did it stall, and what stopped you?',
      help: 'Tell us what actually happened, not what you planned to happen. The honest stall point is the most useful thing on this page.',
      placeholder: 'The course you stopped, the project that fizzled, the moment you lost it.', maxLength: 900
    },
    {
      id: 'stuck_on', module: 'gap', type: 'single',
      title: 'Looking ahead at the next six months, what is the part you quietly suspect you will get stuck on?',
      help: 'Pick the one that feels most true. We use it to set the right guardrail for you.',
      other: true,
      options: [
        ['time', 'Time. I do not have enough hours in the day to keep up consistently.'],
        ['confidence', 'Confidence. I am not sure I am technical enough to get through the hard parts.'],
        ['clarity', 'Clarity. I lose the thread when I am not sure what I am building toward.'],
        ['momentum', 'Momentum. I lose steam when results feel slow or invisible.'],
        ['accountability', 'Accountability. I work better when someone is checking in on me.'],
        ['else', 'Something else.']
      ]
    },

    // PART 4 + 5 — Is this the right vehicle? / Where this leaves you
    {
      id: 'decision', module: 'vehicle', type: 'single',
      title: 'Re-read your North Star statement. Does it still feel true, and worth six months of effort?',
      help: 'Read the two columns above against the answers you just wrote, then answer honestly. We would rather you not join than join, stall, and resent it.',
      vehicle: true,
      options: [
        ['yes', 'Yes, this is the one.'],
        ['refine', 'Close, but I want to refine it.']
      ]
    }
  ];

  root.EXERCISE_DATA = {
    introSteps: [
      {
        id: 'welcome', module: 'context', type: 'intro',
        eyebrow: '100x Engineers · Cohort 8',
        title: 'Before you decide, find your North Star.',
        subtitle: 'A clarity exercise to find your North Star, and to see if we are the right vehicle to reach it.',
        body: 'You are trying to answer one question: is this program worth your time, your money, and the next six months of effort. This is built to help you answer it honestly, before you pay anything.',
        promises: [
          { title: 'A written North Star', body: 'A concrete statement of where you want to be in six months.' },
          { title: 'An honest gap', body: 'A clear view of what stands between you and it.' },
          { title: 'A fit read', body: 'A straight answer on whether we are the right way to close it.' }
        ]
      }
    ],
    modules: [
      { id: 'context', title: 'Before you start', number: '01' },
      { id: 'standing', title: 'Where you stand', number: '02' },
      { id: 'northstar', title: 'Where you want to be', number: '03' },
      { id: 'gap', title: 'The gap between', number: '04' },
      { id: 'vehicle', title: 'The right vehicle?', number: '05' },
      { id: 'contact', title: 'Send for review', number: '06' },
      { id: 'result', title: 'Where this leaves you', number: '07' }
    ],
    questions
  };
})(typeof window !== 'undefined' ? window : globalThis);
