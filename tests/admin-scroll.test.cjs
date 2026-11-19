/* Run with: node --test tests/admin-scroll.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAdmin() {
  const main = { scrollTop: 240, scrollLeft: -12 };
  const calls = [];
  const window = {
    scrollX: 9, scrollY: 850,
    scrollTo(options) {
      calls.push({ ...options });
      this.scrollX = options.left;
      this.scrollY = options.top;
    },
  };
  const context = vm.createContext({ window, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/admin.js'), 'utf8'), context);
  context.$ = (selector) => selector === '.admin-main' ? main : null;
  return { context, window, main, calls };
}

function simulateDomReplacement(window, main) {
  // A browser can clamp scroll while a long panel is temporarily replaced.
  window.scrollX = 0;
  window.scrollY = 0;
  main.scrollTop = 0;
  main.scrollLeft = 0;
}

test('same-tab panel redraw restores document and admin-main scroll instantly', () => {
  const { context, window, main, calls } = loadAdmin();
  context.currentTab = 'sections';
  context.lastRenderedAdminTab = 'sections';
  context.renderPanelContents = () => simulateDomReplacement(window, main);
  context.renderPanel();
  assert.equal(window.scrollY, 850);
  assert.equal(window.scrollX, 9);
  assert.equal(main.scrollTop, 240);
  assert.equal(main.scrollLeft, -12);
  assert.deepEqual(calls.at(-1), { left: 9, top: 850, behavior: 'instant' });
});

test('changing tabs goes to the top, but subsequent redraws stay in place', () => {
  const { context, window, main, calls } = loadAdmin();
  context.currentTab = 'lessons';
  context.lastRenderedAdminTab = 'sections';
  context.renderPanelContents = () => simulateDomReplacement(window, main);
  context.renderPanel();
  assert.equal(context.lastRenderedAdminTab, 'lessons');
  assert.deepEqual(calls.at(-1), { left: 0, top: 0, behavior: 'instant' });
  assert.equal(main.scrollTop, 0);
  window.scrollY = 600;
  main.scrollTop = 70;
  context.renderPanel();
  assert.equal(window.scrollY, 600);
  assert.equal(main.scrollTop, 70);
});

test('content and composer redraws restore the position at the time they run', () => {
  const { context, window, main } = loadAdmin();
  const args = [{}, { id: 'lesson' }, {}];
  context.renderResourceSectionsContent = (...received) => {
    assert.equal(received[1].id, 'lesson');
    simulateDomReplacement(window, main);
  };
  context.renderResourceSections(...args);
  assert.equal(window.scrollY, 850);
  assert.equal(main.scrollTop, 240);
  // A long upload can finish after the user has scrolled elsewhere.
  window.scrollY = 1230;
  main.scrollTop = 460;
  context.renderDynamicComposerContent = (...received) => {
    assert.equal(received[3], 'video');
    simulateDomReplacement(window, main);
  };
  context.renderDynamicComposer({}, {}, { id: 'lesson' }, 'video', {}, {});
  assert.equal(window.scrollY, 1230);
  assert.equal(main.scrollTop, 460);
});

test('nested panel and content redraws restore the original scroll after both finish', () => {
  const { context, window, main } = loadAdmin();
  context.currentTab = context.lastRenderedAdminTab = 'content';
  context.renderPanelContents = () => {
    simulateDomReplacement(window, main);
    context.renderResourceSections({}, { id: 'lesson' }, {});
  };
  context.renderResourceSectionsContent = () => simulateDomReplacement(window, main);
  context.renderPanel();
  assert.equal(window.scrollY, 850);
  assert.equal(main.scrollTop, 240);
});

test('scroll is restored even when a redraw throws', () => {
  const { context, window, main } = loadAdmin();
  assert.throws(() => context.preserveAdminScroll(() => {
    simulateDomReplacement(window, main);
    throw new Error('render failed');
  }), /render failed/);
  assert.equal(window.scrollY, 850);
  assert.equal(main.scrollTop, 240);
});
