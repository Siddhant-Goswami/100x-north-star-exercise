const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const engine = require('../js/engine.js');
const dataContext = {};
vm.createContext(dataContext);
vm.runInContext(fs.readFileSync('js/data.js', 'utf8'), dataContext);
const questions = vm.runInContext('EXERCISE_DATA.questions', dataContext);

function answers(overrides = {}) {
  return {
    role_experience: 'Product Manager, 6 years',
    journey: 'I started in support, moved into product ops, and have led roadmap delivery for a fintech team for the last three years.',
    code_history: 'A little Python years ago, nothing in production.',
    building_now: 'Not right now, but I have an idea for a tool my team needs.',
    industry: 'Fintech',
    weekly_hours: '5-7',
    worst_week_hours: '1-2',
    worst_week_cause: 'Quarter-end crunch and travel.',
    itch: 'I keep watching peers ship AI things and I feel left behind.',
    path: 'build',
    six_month_goal: 'I want a working internal tool real teammates use to triage support tickets.',
    payoff: 'Proof to myself that I can build, and a future-proofed role.',
    north_star: 'By December 2026, I have launched an internal AI tool that 40 teammates use weekly.',
    stall_point: 'I bought a course, finished two modules, then a launch ate my evenings and I never went back.',
    stuck_on: 'time',
    do_nothing: 'Same role, same itch, another year watching others build.',
    decision: 'yes',
    ...overrides
  };
}

test('the exercise contains all required questions', () => {
  assert.equal(questions.length, 17);
  assert.deepEqual(engine.validateAnswers(answers(), questions), {});
});

test('assessment produces seven bounded stats and review flags', () => {
  const result = engine.scoreAssessment(answers());
  assert.equal(Object.keys(result.stats).length, 7);
  Object.values(result.stats).forEach((score) => assert.ok(score >= 1 && score <= 5));
  // A North Star with a month, year, and number reads as concrete.
  assert.ok(result.stats.northStarClarity >= 4);
  assert.equal(result.stats.commitmentSignal, 5);
});

test('a vague North Star and no consistent hours are flagged for review', () => {
  const result = engine.scoreAssessment(answers({
    north_star: 'get good at AI',
    weekly_hours: 'under2',
    worst_week_hours: 'none'
  }));
  assert.ok(result.flags.includes('north-star-vague'));
  assert.ok(result.flags.includes('no-consistent-hours'));
  assert.ok(result.stats.commitmentSignal <= 2);
});

test('fit signals always return a track, rhythm, and guardrail and respond to the path', () => {
  const builder = engine.rankFitSignals(answers({ path: 'build' }));
  const career = engine.rankFitSignals(answers({ path: 'job', stuck_on: 'accountability' }));
  assert.equal(builder.length, 3);
  assert.deepEqual(builder.map((item) => item.id), ['track', 'rhythm', 'guardrail']);
  assert.equal(builder[0].label, 'Builder track');
  assert.equal(career[0].label, 'Career track');
  assert.match(career[2].description, /checks in on you/);
});

test('hasTimeAndScale recognises a concrete time horizon and a number', () => {
  assert.equal(engine.hasTimeAndScale('By December 2026 I run a $5k/month practice'), true);
  assert.equal(engine.hasTimeAndScale('someday I want to be better'), false);
});

test('custom international calling codes normalize to E.164', () => {
  assert.equal(engine.normalizePhone('+91', '098765 43210'), '+919876543210');
  assert.equal(engine.normalizePhone('+358', '40 123 4567'), '+358401234567');
  assert.equal(engine.normalizePhone('1', '(415) 555-2671'), '+14155552671');
  assert.equal(engine.normalizePhone('+12345', '5551234567'), null);
});

test('short answers are accepted while blank answers are rejected', () => {
  assert.deepEqual(engine.validateAnswers(answers({
    journey: 'Support to product.',
    north_star: 'Lead role by 2026.'
  }), questions), {});

  const errors = engine.validateAnswers(answers({ north_star: '   ' }), questions);
  assert.equal(errors.north_star, 'Answer this question to continue.');
});
