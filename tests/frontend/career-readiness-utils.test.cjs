const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('readiness page wires careerId-aware frontend module', () => {
  const htmlPath = path.resolve(__dirname, '../../dashboard/career/readiness/index.html');
  const content = fs.readFileSync(htmlPath, 'utf8');

  assert.match(content, /id="milestoneCategories"/);
  assert.match(content, /id="weeklyPlan"/);
  assert.match(content, /assets\/student\/career-readiness\.js/);
});

test('career paths page links to readiness plan route with careerId', () => {
  const jsPath = path.resolve(__dirname, '../../assets/student/career-paths.js');
  const content = fs.readFileSync(jsPath, 'utf8');

  assert.match(content, /dashboard\/career\/readiness\/index\.html\?careerId=/);
  assert.match(content, /View Readiness Plan/);
});
