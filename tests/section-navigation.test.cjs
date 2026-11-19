/* Run with: node --test tests/section-navigation.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function fixture() {
  const sec = (id, parentId, title, kind, extra = {}) => ({
    id, parentId, title, kind, subjectId: 'math', order: 1, ...extra,
  });
  return {
    subjects: [{ id: 'math', name: 'الرياضيات', color: 'indigo' }],
    resources: [
      { id: 'r1', sectionId: 'first', kind: 'video', title: 'الموضوع الأول', url: 'https://example.com/1', order: 1 },
      { id: 'r2', sectionId: 'first-solution', kind: 'video', title: 'حل الموضوع الأول', url: 'https://example.com/2', order: 1 },
      { id: 'r3', sectionId: 'topic-second', kind: 'video', title: 'الموضوع الثاني', url: 'https://example.com/3', order: 1 },
    ],
    sections: [
      sec('bak', '', 'بكالوريات', 'tab'),
      sec('year', 'bak', '2025', 'folder'),
      sec('topic', 'year', 'الموضوع', 'page', { part: 'topic', order: 1 }),
      sec('solution', 'year', 'الحل', 'page', { part: 'solution', order: 2 }),
      sec('first', 'year', 'الموضوع الأول', 'page', { order: 3 }),
      sec('first-solution', 'year', 'حل الموضوع الأول', 'page', { order: 4 }),
      sec('second', 'year', 'الموضوع الثاني', 'folder', { order: 5 }),
      sec('second-solution', 'year', 'حل الموضوع الثاني', 'page', { order: 6 }),
      sec('hidden', 'year', 'قسم مخفي', 'page', { hidden: true, order: 7 }),
      sec('topic-second', 'topic', 'موضوع داخل الجزء', 'page'),
      sec('exercise', '', 'تمرين مستقل', 'exercise'),
      sec('ex-topic', 'exercise', 'الموضوع', 'page', { part: 'topic' }),
      sec('ex-solution', 'exercise', 'الحل', 'page', { part: 'solution' }),
      sec('ex-extra', 'exercise', 'قسم تمرين إضافي', 'page'),
    ],
  };
}

function render(data, id) {
  const nodes = {};
  const events = {};
  let toastMessage = '';
  function node(id) {
    if (!nodes[id]) nodes[id] = {
      innerHTML: '', textContent: '', className: '', hidden: id === 'additionalChildrenSection', style: {},
      addEventListener() {}, appendChild() {},
    };
    return nodes[id];
  }
  node('additionalChildrenSection');
  const document = {
    documentElement: { style: { setProperty() {} } },
    querySelector() { return null; },
    addEventListener() {}, createElement() { return node('created'); },
  };
  const window = { addEventListener() {} };
  const ctx = vm.createContext({
    window, document, console, URL, URLSearchParams, setTimeout, clearTimeout,
    location: { search: '', replace() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
  });
  vm.runInContext(read('js/app.js'), ctx);
  Object.assign(ctx, {
    loadData: () => data, requireAuth() {}, hydrateIcons() {}, param: () => id,
    svgIcon: (name) => `<svg data-icon="${name}"></svg>`, breadcrumb: () => '',
    isItemCompleted: () => false,
    toast: (message) => { toastMessage = message; },
    AyaPlayer: function () { this.load = () => {}; },
    $: (selector) => ['#lightbox', '#secCompleteBtn', '#logoutBtn'].includes(selector) ? null : node(selector.slice(1)),
    $all: (selector, element) => {
      if (selector !== '[data-empty-part]') return [];
      return [...element.innerHTML.matchAll(/data-empty-part="(topic|solution)"/g)].map((m) => ({
        dataset: { emptyPart: m[1] },
        addEventListener: (type, callback) => { events[m[1]] = callback; },
      }));
    },
  });
  vm.runInContext(read('js/section.js'), ctx);
  ctx.initSectionPage();
  return { nodes, events, toastMessage: () => toastMessage };
}

test('year shows all admin-created topics and solutions alongside the special parts', () => {
  const data = fixture();
  const { nodes, events, toastMessage } = render(data, 'year');
  assert.equal(nodes.additionalChildrenSection.hidden, false);
  const html = nodes.additionalChildrenGrid.innerHTML;
  for (const [id, title] of [['first', 'الموضوع الأول'], ['first-solution', 'حل الموضوع الأول'], ['second', 'الموضوع الثاني'], ['second-solution', 'حل الموضوع الثاني']]) {
    assert.match(html, new RegExp(`section\\.html\\?section=${id}"`));
    assert.ok(html.includes(title));
  }
  assert.ok(!html.includes('قسم مخفي'));
  assert.ok(!html.includes('section=topic"'));
  assert.ok(!html.includes('section=solution"'));
  assert.match(nodes.childrenGrid.innerHTML, /href="section\.html\?section=topic"/);
  assert.match(nodes.childrenGrid.innerHTML, /data-empty-part="solution"/);
  let prevented = false;
  events.solution({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(toastMessage(), 'لم يضاف الحل بعد');
  assert.equal(data.sections.find((s) => s.id === 'first').parentId, 'year');
});

test('normal sections and nested sections still expose their children and content', () => {
  const data = fixture();
  const bak = render(data, 'bak');
  assert.equal(bak.nodes.additionalChildrenSection.hidden, true);
  assert.match(bak.nodes.childrenGrid.innerHTML, /section=year/);
  const topic = render(data, 'topic');
  assert.match(topic.nodes.childrenGrid.innerHTML, /section=topic-second/);
  assert.ok(topic.nodes.childrenGrid.innerHTML.includes('موضوع داخل الجزء'));
  const first = render(data, 'first');
  assert.equal(first.nodes.childrenSection.style.display, 'none');
  assert.equal(first.nodes.playerShell.hidden, false);
});

test('independent exercises preserve parts, extra children, and empty solution behaviour', () => {
  const { nodes, events, toastMessage } = render(fixture(), 'exercise');
  assert.equal(nodes.additionalChildrenSection.hidden, false);
  assert.match(nodes.additionalChildrenGrid.innerHTML, /section=ex-extra/);
  assert.match(nodes.childrenGrid.innerHTML, /data-empty-part="solution"/);
  events.solution({ preventDefault() {} });
  assert.equal(toastMessage(), 'لم يضاف الحل بعد');
});

test('additional section has matching HTML mount and begins hidden', () => {
  const html = read('section.html');
  assert.match(html, /id="additionalChildrenSection" hidden/);
  assert.match(html, /id="additionalChildrenGrid"/);
});

test('pre-existing years without part records retain their children without migrating them', () => {
  const data = fixture();
  data.sections = data.sections.filter((s) => s.id !== 'topic' && s.id !== 'solution');
  const { nodes } = render(data, 'year');
  assert.ok(nodes.additionalChildrenGrid.innerHTML.includes('الموضوع الأول'));
  assert.ok(nodes.additionalChildrenGrid.innerHTML.includes('حل الموضوع الثاني'));
  assert.match(nodes.childrenGrid.innerHTML, /data-empty-part="topic"/);
  assert.match(nodes.childrenGrid.innerHTML, /data-empty-part="solution"/);
  assert.equal(data.sections.find((s) => s.id === 'first').parentId, 'year');
});

test('a part with nested solution content is reachable, while hidden content stays unavailable', () => {
  const data = fixture();
  data.sections.push({ id: 'answer', parentId: 'solution', subjectId: 'math', title: 'الحل الأول', kind: 'page', order: 1 });
  data.resources.push({ id: 'r4', sectionId: 'answer', kind: 'video', title: 'حل', url: 'https://example.com/4' });
  const year = render(data, 'year');
  assert.match(year.nodes.childrenGrid.innerHTML, /href="section\.html\?section=solution"/);
  assert.doesNotMatch(year.nodes.childrenGrid.innerHTML, /data-empty-part="solution"/);
  const solution = render(data, 'solution');
  assert.ok(solution.nodes.childrenGrid.innerHTML.includes('الحل الأول'));
  data.resources.find((r) => r.id === 'r4').hidden = true;
  assert.match(render(data, 'year').nodes.childrenGrid.innerHTML, /data-empty-part="solution"/);
});
