const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dataContext = {};
vm.createContext(dataContext);
vm.runInContext(fs.readFileSync('js/data.js', 'utf8'), dataContext);
const questionIds = vm.runInContext('EXERCISE_DATA.questions.map((q) => q.id)', dataContext);

test('contact collection appears after every exercise question', () => {
  const app = fs.readFileSync('js/app.js', 'utf8');
  assert.match(
    app,
    /\.\.\.data\.questions,\s*\{ id: 'contact', module: 'contact', type: 'contact' \}/
  );
});

test('the exercise does not push a paid program or hard-sell copy', () => {
  const sources = ['index.html', 'js/config.js', 'js/data.js', 'js/app.js']
    .map((path) => fs.readFileSync(path, 'utf8'))
    .join('\n');
  assert.doesNotMatch(sources, /enroll now|buy now|seats? closing|limited seats|apply before/i);
});

test('questions do not enforce minimum response lengths', () => {
  const sources = ['js/data.js', 'js/engine.js', 'js/app.js']
    .map((path) => fs.readFileSync(path, 'utf8'))
    .join('\n');
  assert.doesNotMatch(sources, /minLength|Add a little more detail|at least \d+ characters/);
});

test('the result reflects the participant North Star statement back to them', () => {
  const app = fs.readFileSync('js/app.js', 'utf8');
  assert.match(app, /Your North Star statement/);
  assert.match(app, /state\.answers\.north_star/);
});

test('the Edge Function recomputes the assessment and upserts the unique exercise phone', () => {
  const source = fs.readFileSync('supabase/functions/submit-exercise/index.ts', 'utf8');
  assert.match(source, /const assessment = scoreAssessment\(answers\)/);
  assert.match(source, /const fitSignals = rankFitSignals\(answers\)/);
  assert.match(source, /onConflict: 'exercise_id,phone_e164'/);
  assert.match(source, /north_star_submissions/);
});

test('the server validates every required answer id', () => {
  const fn = fs.readFileSync('supabase/functions/submit-exercise/index.ts', 'utf8');
  assert.ok(questionIds.length >= 17);
  questionIds.forEach((id) => assert.ok(fn.includes(`'${id}'`), `Edge Function should require ${id}`));
});
