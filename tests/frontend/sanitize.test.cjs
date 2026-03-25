const test = require('node:test');
const assert = require('node:assert/strict');
const sanitize = require('../../assets/lib/sanitize.js');

test('containsHtmlTags detects simple markup', () => {
  assert.equal(sanitize.containsHtmlTags('<b>test</b>'), true);
  assert.equal(sanitize.containsHtmlTags('plain text'), false);
});

test('stripHtmlTags removes tags and trims output', () => {
  const clean = sanitize.stripHtmlTags('  <div>Hello <em>World</em></div>  ');
  assert.equal(clean, 'Hello World');
});
