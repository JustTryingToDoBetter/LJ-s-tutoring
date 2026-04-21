const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Emulate a minimal DOM so we can evaluate the common.js ES module in Node
// without pulling in jsdom. Only the APIs the helpers actually touch are
// shimmed — everything else throws loudly so tests fail fast on drift.

class FakeClassList {
  constructor(el) { this.el = el; }
  add() {}
  remove() {}
  toggle() {}
}

class FakeNode {
  constructor(tag) {
    this.tagName = (tag || '').toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.textContent = '';
    this.className = '';
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.listeners = {};
    this.classList = new FakeClassList(this);
  }
  get firstChild() { return this.children[0]; }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  append(...children) { for (const c of children) this.appendChild(c); }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    return child;
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get innerHTML() {
    return this.children.map(serialize).join('');
  }
}

function serialize(node) {
  if (node.nodeType === 3) return node.textContent;
  const tag = node.tagName ? node.tagName.toLowerCase() : '';
  if (!tag) return node.textContent || '';
  const attrs = [];
  if (node.className) attrs.push(`class="${node.className}"`);
  for (const [k, v] of Object.entries(node.attributes)) attrs.push(`${k}="${v}"`);
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  const inner = node.children.map(serialize).join('') + (node.textContent && !node.children.length ? node.textContent : '');
  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

function createTextNode(text) {
  const n = new FakeNode();
  n.nodeType = 3;
  n.textContent = String(text);
  return n;
}

global.HTMLElement = FakeNode;
global.document = {
  createElement: (tag) => new FakeNode(tag),
  createTextNode,
  querySelector: () => null,
  querySelectorAll: () => [],
  cookie: '',
};
global.window = {
  location: { hostname: 'localhost', protocol: 'http:' },
  crypto: { randomUUID: () => 'abc-test-id' },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  __PO_API_BASE__: '',
};

const common = loadCommonModule();

test('renderList never parses user strings as HTML tags', () => {
  const target = new FakeNode('div');
  const hostile = '<img src=x onerror="alert(1)">';

  common.renderList(target, [{ name: hostile }], (item) => ({
    rows: [{ el: 'strong', text: item.name }],
  }));

  assert.equal(target.children.length, 1);
  const row = target.children[0];
  assert.equal(row.className, 'list-item');
  const strong = row.children[0];
  assert.equal(strong.tagName, 'STRONG');
  // textContent assignment is the safe path — the payload is stored on the
  // node as a literal string, never as parsed DOM children.
  assert.equal(strong.textContent, hostile);
  assert.equal(strong.children.length, 0, 'text must not have produced child elements');
});

test('renderList delegates to an HTMLElement returned by the renderer', () => {
  const target = new FakeNode('div');
  const custom = new FakeNode('section');
  custom.textContent = 'built-safely';
  common.renderList(target, [1], () => custom);
  assert.equal(target.children[0], custom);
});

test('renderEmpty and renderError set text content, never HTML', () => {
  const target = new FakeNode('div');
  common.renderEmpty(target, '<b>empty</b>');
  assert.equal(target.children[0].textContent, '<b>empty</b>');

  const target2 = new FakeNode('div');
  common.renderError(target2, '<script>1</script>');
  assert.equal(target2.children[0].textContent, '<script>1</script>');
  assert.equal(target2.children[0].getAttribute('role'), 'alert');
});

test('buildSafeItem never interprets strings as HTML', () => {
  const item = common.buildSafeItem({
    className: 'list-item',
    rows: [
      { el: 'strong', text: '<evil>' },
      '<plain-string-also-safe>',
    ],
  });
  assert.equal(item.children[0].textContent, '<evil>');
  assert.equal(item.children[1].textContent, '<plain-string-also-safe>');
});

function loadCommonModule() {
  // common.js is an ES module using `export`. We load the source text and
  // evaluate it as a CommonJS-visible object by stripping the `export`
  // keywords into a captured-export form. This keeps the test runner
  // dependency-free while still exercising the real helper logic.
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'assets', 'common.js'),
    'utf8',
  );
  const exportsMap = {};
  const transformed = src.replace(/export\s+(async\s+)?function\s+(\w+)/g, (_m, asyncPrefix, name) => {
    return `${asyncPrefix || ''}function ${name}`;
  }).replace(/export\s+const\s+(\w+)/g, 'const $1');
  // Collect named functions after transformation by appending explicit assignments.
  const names = [
    'apiUrl', 'getCsrfToken', 'apiFetch', 'setActiveNav', 'setText',
    'clearChildren', 'renderEmpty', 'buildSafeItem', 'renderList',
    'renderError', 'renderLoading', 'loadJson',
  ];
  const epilogue = names.map((n) => `try { __poExports.${n} = ${n}; } catch (_e) { /* missing helper */ }`).join('\n');
  const wrapped = `(function (__poExports) { ${transformed}\n${epilogue} })(exportsMap);`;
  // eslint-disable-next-line no-new-func
  const fn = new Function('exportsMap', 'console', wrapped);
  fn(exportsMap, console);
  return exportsMap;
}
