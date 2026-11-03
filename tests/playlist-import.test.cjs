/* Run with Node 22.13+: node --test tests/playlist-import.test.cjs
 * No packages, network access, or real Supabase writes are needed.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const emptySite = () => ({ subjects: [], units: [], lessons: [], resources: [] });
const site = () => ({
  subjects: [{ id: 's-test', name: 'الرياضيات', icon: 'math', color: 'indigo', sort_order: 1 }],
  units: [{ id: 'u-existing', subject_id: 's-test', title: 'وحدة موجودة', sort_order: 1 }],
  lessons: [],
  resources: [],
});
const video = (index, title, exercise = false, unitHint = null) => ({
  index,
  video_id: `video-${index}`,
  title,
  cleaned_title: title,
  url: `https://www.youtube.com/watch?v=video${index}`,
  duration: '10:00',
  is_exercise_hint: exercise,
  unit_hint: unitHint,
  base_lesson_title: title,
  part_label: null,
});
const playlist = () => ({
  playlist_id: 'PL-test',
  title: 'قائمة المراجعة',
  author: 'قناة اختبارية',
  source_url: 'https://www.youtube.com/playlist?list=PL-test',
  video_count: 5,
  detected_subject_hint: null,
  videos: [
    video(1, 'شرح الدوال'),
    video(2, 'تمرين شامل', true, 'وحدة أخرى'),
    video(3, 'حل بكالوريا', true, 'وحدة ثالثة'),
    video(4, 'شرح المتتاليات', false, 'وحدة رابعة'),
    video(5, 'تطبيق أخير', true),
  ],
});

function loadBackend(initialSite = emptySite()) {
  const db = clone(initialSite);
  const writes = [];
  const claudeCalls = [];
  let handler;
  const sandbox = {
    URL, URLSearchParams, TextDecoder, Response, Request, console,
    atob, btoa, setTimeout, clearTimeout,
    Deno: {
      env: { get: (key) => key === 'SUPABASE_URL' ? 'https://supabase.test' : '' },
      serve: (fn) => { handler = fn; },
    },
    fetch: async (url, options = {}) => {
      const target = new URL(url);
      if (target.hostname === 'api.anthropic.com') {
        claudeCalls.push(JSON.parse(options.body));
        throw new Error('Claude must not override the single-unit option');
      }
      const table = target.pathname.split('/').pop();
      assert.ok(Object.hasOwn(db, table), `Unexpected fetch: ${url}`);
      if (options.method === 'POST') {
        const rows = JSON.parse(options.body);
        writes.push({ table, rows: clone(rows) });
        db[table].push(...rows);
        return new Response(JSON.stringify(rows), { status: 201 });
      }
      return new Response(JSON.stringify(db[table]));
    },
  };
  const source = stripTypeScriptTypes(read('supabase/functions/aya-mcp/index.ts'));
  vm.runInNewContext(source + '\nglobalThis.api = { buildSmartCurriculumPlan, executeCurriculumPlan, MCP_TOOLS };', sandbox);
  return { api: sandbox.api, handler, db, writes, claudeCalls };
}

function loadClient() {
  const storage = new Map();
  const sandbox = {
    URL, URLSearchParams, console,
    window: { AYA_ADMIN_MODE: true },
    SUPABASE_URL: 'https://supabase.test',
    ADMIN_PASS: 'test-only',
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    location: { search: '' },
    navigator: {},
    fetch: async () => { throw new Error('Unexpected client network call'); },
  };
  vm.createContext(sandbox);
  vm.runInContext(read('js/app.js'), sandbox);
  vm.runInContext(read('js/ai-admin.js'), sandbox);
  sandbox.data = emptySite();
  sandbox.save = () => { sandbox.saved = clone(sandbox.data); };
  return sandbox;
}

function assertTogether(plan, expectedTitle = 'قائمة المراجعة') {
  assert.equal(plan.units.length, 1);
  assert.equal(plan.units[0].title, expectedTitle);
  const lessons = plan.units[0].lessons;
  assert.equal(lessons.length, 5);
  assert.deepEqual(lessons.flatMap((l) => l.videos.map((v) => v.url)), playlist().videos.map((v) => v.url));
  for (const lesson of lessons) {
    assert.equal(lesson.item_type, 'lesson');
    assert.equal(lesson.videos.length, 1);
    assert.deepEqual(clone(lesson.exercises), []);
  }
}

test('single unit keeps every video, including exercises, in playlist order', () => {
  const { api } = loadBackend();
  const plan = api.buildSmartCurriculumPlan(playlist(), emptySite(), {
    groupingMode: 'single_unit', separateExercises: true,
  });
  assertTogether(plan);
});

test('single unit respects an existing unit id and ignores video unit hints', () => {
  const { api } = loadBackend(site());
  const plan = api.buildSmartCurriculumPlan(playlist(), site(), {
    subjectNameOrId: 's-test', unitTitleOrId: 'u-existing', groupingMode: 'single_unit',
  });
  assertTogether(plan, 'وحدة موجودة');
  assert.equal(plan.subject.id, 's-test');
  assert.equal(plan.units[0].id, 'u-existing');
});

test('single unit reuses an existing unit by normalized title', () => {
  const { api } = loadBackend(site());
  const plan = api.buildSmartCurriculumPlan(playlist(), site(), {
    subjectNameOrId: 's-test', unitTitleOrId: 'الوحده الموجوده', groupingMode: 'single_unit',
  });
  assert.equal(plan.units[0].id, 'u-existing');
  assert.equal(plan.units[0].title, 'وحدة موجودة');
});

test('single unit creates the requested new unit rather than splitting by hints', () => {
  const { api } = loadBackend(site());
  const plan = api.buildSmartCurriculumPlan(playlist(), site(), {
    subjectNameOrId: 's-test', unitTitleOrId: 'مراجعة نهائية', groupingMode: 'single_unit',
  });
  assertTogether(plan, 'مراجعة نهائية');
  assert.equal(plan.units[0].id, undefined);
});

test('single unit reuses the default playlist-name unit when it already exists', () => {
  const { api } = loadBackend(site());
  const input = playlist();
  input.title = 'وحدة موجودة';
  const plan = api.buildSmartCurriculumPlan(input, site(), {
    subjectNameOrId: 's-test', groupingMode: 'single_unit',
  });
  assert.equal(plan.units.length, 1);
  assert.equal(plan.units[0].id, 'u-existing');
});

test('an empty playlist does not create an empty unit or lesson', () => {
  const { api } = loadBackend();
  const input = playlist();
  input.videos = [];
  input.video_count = 0;
  const plan = api.buildSmartCurriculumPlan(input, emptySite(), { groupingMode: 'single_unit' });
  assert.deepEqual(clone(plan.units), []);
});

test('existing smart grouping and its exercise opt-out remain unchanged', () => {
  const { api } = loadBackend();
  const smart = api.buildSmartCurriculumPlan(playlist(), emptySite(), { groupingMode: 'smart' });
  assert.equal(smart.units.flatMap((u) => u.lessons).flatMap((l) => l.exercises).length, 3);
  const combined = api.buildSmartCurriculumPlan(playlist(), emptySite(), {
    groupingMode: 'smart', separateExercises: false,
  });
  assert.equal(combined.units.flatMap((u) => u.lessons).length, 5);
  assert.ok(combined.units.flatMap((u) => u.lessons).every((l) => l.exercises.length === 0));
});

test('MCP advertises the single-unit mode and its no-separation guarantee', () => {
  const { api } = loadBackend();
  const tool = api.MCP_TOOLS.find((t) => t.name === 'quick_import_youtube_playlist');
  assert.ok(tool.inputSchema.properties.grouping_mode.enum.includes('single_unit'));
  assert.match(tool.description, /single_unit/);
  assert.match(tool.inputSchema.properties.separate_exercises.description, /تجاهل/);
});

test('AI organize endpoint bypasses Claude for deterministic single-unit grouping', async () => {
  const backend = loadBackend(site());
  const response = await backend.handler(new Request('https://supabase.test/functions/v1/aya-mcp/api/ai-organize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': 'test-only' },
    body: JSON.stringify({
      playlist: playlist(), subjectId: 's-test', unitId: 'u-existing',
      groupingMode: 'single_unit', separateExercises: true, anthropicKey: 'fake-test-key',
    }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'smart');
  assertTogether(result.plan, 'وحدة موجودة');
  assert.equal(backend.claudeCalls.length, 0);
  assert.equal(backend.writes.length, 0, 'Preview must not write content');
});

test('cloud execution saves exercise videos as lesson videos and appends in order', async () => {
  const backend = loadBackend(site());
  const plan = backend.api.buildSmartCurriculumPlan(playlist(), site(), {
    subjectNameOrId: 's-test', unitTitleOrId: 'u-existing', groupingMode: 'single_unit',
  });
  const result = await backend.api.executeCurriculumPlan(plan, 'test-only');
  assert.equal(result.stats.units_created, 0);
  assert.equal(result.stats.units_reused, 1);
  assert.equal(result.stats.lessons_created, 5);
  assert.equal(result.stats.videos_added, 5);
  assert.equal(result.stats.exercises_added, 0);
  assert.equal(backend.db.units.length, 1);
  assert.ok(backend.db.lessons.every((l) => l.item_type === 'lesson' && l.unit_id === 'u-existing'));
  assert.deepEqual(backend.db.lessons.map((l) => l.sort_order), [1, 2, 3, 4, 5]);
  assert.ok(backend.db.resources.every((r) => r.kind === 'video' && r.exercise_type === null));
  assert.deepEqual(backend.db.resources.map((r) => r.url), playlist().videos.map((v) => v.url));

  const again = await backend.api.executeCurriculumPlan(plan, 'test-only');
  assert.equal(again.stats.videos_added, 0);
  assert.equal(again.stats.duplicates_skipped, 5);
  assert.equal(backend.db.resources.length, 5);
});

test('client preview and final plan cannot reclassify single-unit items as exercises', () => {
  const client = loadClient();
  const plan = {
    subject: { name: 'الرياضيات' },
    units: [{ title: 'وحدة واحدة', lessons: [{
      title: 'فيديوهات القائمة', item_type: 'exercise',
      videos: [{ title: 'شرح', url: 'https://youtu.be/lesson12345' }],
      exercises: [{ title: 'تمرين', url: 'https://youtu.be/exercise123' }],
    }] }],
  };
  const editable = client.prepareEditablePlan(plan, 'single_unit');
  assert.ok(editable.units[0].lessons[0]._items.every((v) => v.role === 'video'));
  editable.units[0].lessons[0].item_type = 'exercise';
  editable.units[0].lessons[0]._items[1].role = 'exercise';
  const final = client.buildFinalPlanFromEditable(editable, 'single_unit');
  assert.equal(final.units[0].lessons[0].item_type, 'lesson');
  assert.equal(final.units[0].lessons[0].videos.length, 2);
  assert.deepEqual(clone(final.units[0].lessons[0].exercises), []);
  const legacy = client.buildFinalPlanFromEditable(client.prepareEditablePlan(plan, 'smart'), 'smart');
  assert.equal(legacy.units[0].lessons[0].item_type, 'exercise');
  assert.equal(legacy.units[0].lessons[0].exercises.length, 1);
});

test('local fallback saves all five videos together without an exercise section', () => {
  const client = loadClient();
  const backend = loadBackend();
  const plan = backend.api.buildSmartCurriculumPlan(playlist(), emptySite(), { groupingMode: 'single_unit' });
  const editable = client.prepareEditablePlan(plan, 'single_unit');
  const final = client.buildFinalPlanFromEditable(editable, 'single_unit');
  const result = client.applyPlanLocally(final);
  assert.equal(result.stats.videos_added, 5);
  assert.equal(result.stats.exercises_added, 0);
  assert.equal(client.data.units.length, 1);
  assert.equal(client.lessonsOf(client.data, client.data.units[0].id).length, 5);
  assert.equal(client.unitExercisesOf(client.data, client.data.units[0].id).length, 0);
  assert.ok(client.data.resources.every((r) => r.kind === 'video'));
  assert.deepEqual(client.data.resources.map((r) => r.url), playlist().videos.map((v) => v.url));
  assert.equal(client.saved.resources.length, 5);
});
