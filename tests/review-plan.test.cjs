/* node --test tests/review-plan.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '../js/review.js'), 'utf8');
function context() {
  const values = new Map(); let n = 0;
  const ctx = vm.createContext({
    window: {}, console, Promise,
    localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) },
    uid: p => p + '-' + (++n), loadSavedPlan: () => null,
  });
  vm.runInContext(src, ctx);
  return { ctx, values };
}
const clone = value => JSON.parse(JSON.stringify(value));

test('imports actual subject, day and distinct slot time without changing the schedule', () => {
  const { ctx } = context();
  const plan = { slots: [
    { dayIdx: 0, timeLabel: '17:30 - 19:30', subjectId: 'accounting' },
    { dayIdx: 1, timeLabel: '08:30 - 10:30', subjectId: 'math' },
    { dayIdx: 2, timeLabel: '08:30 - 10:30', subjectId: 'accounting' },
    { dayIdx: 5, timeLabel: '19:30 - 18:00', subjectId: 'law' },
    { dayIdx: 6, timeLabel: '08:30 - 10:30', subjectId: 'law' },
  ] };
  const before = clone(plan);
  const grid = ctx.reviewFromSchedule(plan);
  assert.deepEqual(clone(plan), before);
  assert.deepEqual(clone(grid.columns.map(c => c.time)), ['08:30 - 10:30', '08:30 - 10:30', '17:30 - 19:30', '19:30 - 18:00']);
  assert.equal(grid.entries.length, 5);
  assert.equal(grid.entries[1].columnId, grid.entries[2].columnId);
  assert.equal(grid.entries[3].dayIdx, 5);
  assert.notEqual(grid.entries[1].columnId, grid.entries[4].columnId);
  assert.equal(grid.columns.find(c => c.id === grid.entries[4].columnId).group, 'weekend');
});

test('cloud review wins over local data and a blank cloud plan remains blank', () => {
  const { ctx, values } = context();
  values.set('ayaBacReviewPlan.v1', JSON.stringify({ columns: [{ id: 'local', time: 'old' }], entries: [] }));
  ctx.window.CLOUD_SCHEDULE = { review: { columns: [], entries: [] }, plan: { slots: [{ subjectId: 'x', dayIdx: 0 }] } };
  assert.equal(ctx.loadReviewPlan().columns.length, 0);
  ctx.window.CLOUD_SCHEDULE.review = null;
  assert.equal(ctx.loadReviewPlan().entries.length, 1);
  values.clear();
  assert.equal(ctx.loadReviewPlan().entries.length, 1);
});

test('successful cloud write updates cache; failed cloud write keeps prior data', async () => {
  const { ctx, values } = context();
  const original = { columns: [], entries: [] };
  const next = { columns: [{ id: 'c', time: '08:30 - 10:30' }], entries: [] };
  ctx.window.CLOUD_SCHEDULE = { review: original, plan: { slots: [] } };
  ctx.Cloud = { mode: 'cloud', saveReviewPlan: async () => false };
  assert.equal(await ctx.saveReviewPlan(next), false);
  assert.equal(ctx.window.CLOUD_SCHEDULE.review, original);
  assert.equal(values.size, 0);
  let sent;
  ctx.Cloud.saveReviewPlan = async p => { sent = p; return true; };
  assert.equal(await ctx.saveReviewPlan(next), true);
  assert.deepEqual(clone(sent), next);
  assert.deepEqual(clone(ctx.window.CLOUD_SCHEDULE.review), next);
  assert.deepEqual(JSON.parse(values.get('ayaBacReviewPlan.v1')), next);
  next.columns[0].time = 'changed';
  assert.equal(ctx.window.CLOUD_SCHEDULE.review.columns[0].time, '08:30 - 10:30');
});

test('local save is independent of the weekly plan', async () => {
  const { ctx, values } = context();
  const plan = { columns: [{ id: 'c', time: '09:00 - 10:00' }], entries: [] };
  assert.equal(await ctx.saveReviewPlan(plan), true);
  assert.deepEqual(JSON.parse(values.get('ayaBacReviewPlan.v1')), plan);
  assert.equal(values.has('ayaBacSchedulePlan.v1'), false);
});

test('cloud loads the review row separately and saves only that row', async () => {
  const saved = [];
  const review = { columns: [{ id: 'p', time: '08:30 - 10:30' }], entries: [] };
  const weekly = { slots: [{ dayIdx: 1, subjectId: 's', timeLabel: '08:30 - 10:30' }] };
  const rows = {
    subjects: [], units: [], lessons: [], resources: [], aya_sections: [], aya_completed_items: [],
    aya_study_schedule: [{ id: 'plan', payload: weekly }, { id: 'review_plan', payload: review }],
  };
  const client = { from(name) { return {
    select: () => Promise.resolve({ data: rows[name] || [], error: null }),
    upsert: (items, opts) => { saved.push({ name, items, opts }); return Promise.resolve({ error: null }); },
  }; } };
  const values = new Map();
  const ctx = vm.createContext({ window: {}, console, Promise, Date, setTimeout, clearTimeout,
    localStorage: { setItem: (k, v) => values.set(k, v) }, byOrder: () => 0,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/cloud.js'), 'utf8'), ctx);
  ctx.Cloud.client = client;
  await ctx.Cloud.loadAll();
  assert.deepEqual(clone(ctx.window.CLOUD_SCHEDULE.review), review);
  assert.deepEqual(clone(ctx.window.CLOUD_SCHEDULE.plan), weekly);
  assert.deepEqual(JSON.parse(values.get('ayaBacReviewPlan.v1')), review);
  ctx.Cloud.mode = 'cloud'; ctx.Cloud.adminClient = client;
  assert.equal(await ctx.Cloud.saveReviewPlan(review), true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'aya_study_schedule');
  assert.equal(saved[0].items[0].id, 'review_plan');
  assert.deepEqual(clone(saved[0].items[0].payload), review);
  assert.equal(saved[0].items.length, 1);
});

test('offline drafts stay separate from the published version until explicitly saved online', async () => {
  const { ctx, values } = context();
  const draft = { columns: [{ id: 'local', time: '11:00 - 12:00' }], entries: [] };
  const published = { columns: [{ id: 'cloud', time: '08:00 - 09:00' }], entries: [] };
  ctx.window.AYA_ADMIN_MODE = true;
  assert.equal(await ctx.saveReviewPlan(draft), true);
  assert.ok(values.has('ayaBacReviewDraft.v1'));
  ctx.window.CLOUD_SCHEDULE = { review: published, plan: { slots: [] } };
  ctx.Cloud = { mode: 'cloud', saveReviewPlan: async () => false };
  assert.equal(ctx.loadReviewPlan().columns[0].id, 'local');
  assert.equal(await ctx.saveReviewPlan(draft), false);
  assert.ok(values.has('ayaBacReviewDraft.v1'));
  ctx.window.AYA_ADMIN_MODE = false;
  assert.equal(ctx.loadReviewPlan().columns[0].id, 'cloud');
  ctx.window.CLOUD_SCHEDULE.review = null;
  assert.equal(ctx.loadReviewPlan().columns.length, 0);
  ctx.window.AYA_ADMIN_MODE = true;
  ctx.Cloud.saveReviewPlan = async () => true;
  assert.equal(await ctx.saveReviewPlan(draft), true);
  assert.equal(values.has('ayaBacReviewDraft.v1'), false);
  assert.equal(ctx.window.CLOUD_SCHEDULE.review.columns[0].id, 'local');
});

test('renaming a shared time updates the existing column without adding columns or changing its entries', () => {
  const { ctx } = context();
  const plan = { columns: [{ id: 'first', time: '08:00 - 10:00' }, { id: 'next', time: '14:00 - 16:00' }], entries: [
    { id: 'one', dayIdx: 0, columnId: 'first', subjectId: 'math' },
    { id: 'two', dayIdx: 1, columnId: 'first', subjectId: 'ar' },
    { id: 'three', dayIdx: 1, columnId: 'next', subjectId: 'law' },
  ] };
  const entries = clone(plan.entries);
  assert.equal(ctx.renameReviewColumn(plan, 'first', '09:00 - 11:00'), true);
  assert.equal(plan.columns.length, 2);
  assert.equal(plan.columns[0].id, 'first');
  assert.equal(plan.columns[0].time, '09:00 - 11:00');
  assert.deepEqual(plan.entries, entries);
  assert.equal(ctx.renameReviewColumn(plan, 'first', '14:00 - 16:00'), false);
  assert.equal(plan.columns[0].time, '09:00 - 11:00');
  assert.equal(ctx.renameReviewColumn(plan, 'missing', '12:00'), false);
});

test('deleting a column removes only its own entries, including an empty column', () => {
  const { ctx } = context();
  const plan = { columns: [{ id: 'first', time: '09:00' }, { id: 'next', time: '14:00' }, { id: 'empty', time: '16:00' }], entries: [
    { id: 'one', dayIdx: 0, columnId: 'first' }, { id: 'two', dayIdx: 1, columnId: 'first' },
    { id: 'three', dayIdx: 1, columnId: 'next' },
  ] };
  ctx.removeReviewColumn(plan, 'first');
  assert.deepEqual(clone(plan.columns.map(c => c.id)), ['next', 'empty']);
  assert.deepEqual(clone(plan.entries.map(e => e.id)), ['three']);
  ctx.removeReviewColumn(plan, 'empty');
  assert.deepEqual(clone(plan.columns.map(c => c.id)), ['next']);
  assert.deepEqual(clone(plan.entries.map(e => e.id)), ['three']);
});

test('editing a single cell time keeps its column and other days unchanged', () => {
  const { ctx } = context();
  const plan = { columns: [{ id: 'a', time: '08:00 - 10:00' }], entries: [
    { id: 'first', dayIdx: 0, subjectId: 'math', columnId: 'a' },
    { id: 'second', dayIdx: 1, subjectId: 'ar', columnId: 'a' },
  ] };
  ctx.setReviewEntryTime(plan.entries[0], plan.columns[0], '17:00 - 19:00');
  assert.equal(plan.columns.length, 1);
  assert.equal(plan.columns[0].time, '08:00 - 10:00');
  assert.equal(plan.entries[0].time, '17:00 - 19:00');
  assert.equal(plan.entries[0].columnId, 'a');
  assert.equal(plan.entries[1].time, undefined);
  ctx.setReviewEntryTime(plan.entries[0], plan.columns[0], '08:00 - 10:00');
  assert.equal(Object.hasOwn(plan.entries[0], 'time'), false);
});

test('a custom cell time survives saving and remains independent of a later header edit', async () => {
  const { ctx } = context();
  const plan = { columns: [{ id: 'a', time: '08:00 - 10:00' }], entries: [
    { id: 'first', dayIdx: 0, subjectId: 'math', columnId: 'a' },
    { id: 'second', dayIdx: 1, subjectId: 'ar', columnId: 'a' },
  ] };
  ctx.setReviewEntryTime(plan.entries[0], plan.columns[0], '17:00 - 19:00');
  assert.equal(ctx.renameReviewColumn(plan, 'a', '09:00 - 11:00'), true);
  assert.equal(plan.entries[0].time, '17:00 - 19:00');
  assert.equal(plan.entries[1].time, undefined);
  ctx.Cloud = { mode: 'cloud', saveReviewPlan: async () => true };
  ctx.window.CLOUD_SCHEDULE = { review: null, plan: null };
  assert.equal(await ctx.saveReviewPlan(plan), true);
  assert.equal(ctx.loadReviewPlan().entries[0].time, '17:00 - 19:00');
  assert.equal(ctx.loadReviewPlan().columns[0].time, '09:00 - 11:00');
});

test('legacy schedules split into independent groups without losing entries or times', () => {
  const { ctx } = context();
  const old = { version: 1, columns: [{ id: 'p1', time: '08:00 - 10:00' }, { id: 'empty', time: '16:00 - 18:00' }], entries: [
    { id: 'sunday', dayIdx: 0, columnId: 'p1', subjectId: 'math', time: '09:00 - 11:00' },
    { id: 'thursday', dayIdx: 4, columnId: 'p1', subjectId: 'ar' },
    { id: 'saturday', dayIdx: 6, columnId: 'p1', subjectId: 'law' },
  ] };
  const original = clone(old);
  const plan = ctx.splitReviewGroups(old);
  assert.deepEqual(old, original);
  assert.equal(plan.columns.length, 4);
  assert.equal(plan.entries.length, 3);
  const early = plan.columns.find(c => c.id === plan.entries.find(e => e.id === 'sunday').columnId);
  const late = plan.columns.find(c => c.id === plan.entries.find(e => e.id === 'thursday').columnId);
  assert.equal(early.group, 'week');
  assert.equal(late.group, 'weekend');
  assert.notEqual(early.id, late.id);
  assert.equal(plan.entries.find(e => e.id === 'saturday').columnId, late.id);
  assert.equal(plan.entries.find(e => e.id === 'sunday').time, '09:00 - 11:00');
  assert.equal(ctx.renameReviewColumn(plan, late.id, '19:00 - 21:00'), true);
  assert.equal(early.time, '08:00 - 10:00');
  ctx.removeReviewColumn(plan, late.id);
  assert.deepEqual(clone(plan.entries.map(e => e.id)), ['sunday']);
  assert.equal(plan.columns.find(c => c.id === early.id).time, '08:00 - 10:00');
});

test('normalization is idempotent and equal times are allowed across separate groups', () => {
  const { ctx } = context();
  const input = { version: 2, columns: [
    { id: 'a', group: 'week', time: '08:00' }, { id: 'b', group: 'weekend', time: '09:00' },
    { id: 'c', group: 'weekend', time: '10:00' },
  ], entries: [{ id: 'e', dayIdx: 5, columnId: 'b', subjectId: 's' }] };
  const first = ctx.splitReviewGroups(input), second = ctx.splitReviewGroups(first);
  assert.deepEqual(clone(second), clone(first));
  assert.equal(ctx.renameReviewColumn(first, 'b', '08:00'), true);
  assert.equal(ctx.renameReviewColumn(first, 'b', '10:00'), false);
  assert.equal(first.columns.find(c => c.id === 'a').time, '08:00');
});

test('generated canvas is landscape and contains every day, custom time and subject', () => {
  const { ctx } = context();
  const texts = [];
  const context2d = {
    measureText: s => ({ width: Array.from(String(s)).length * 14 }),
    fillRect() {}, strokeRect() {},
    fillText: s => texts.push(String(s)),
  };
  let canvas;
  ctx.document = { createElement(tag) { assert.equal(tag, 'canvas'); return (canvas = { getContext: () => context2d }); } };
  ctx.getSubject = (data, id) => data.subjects.find(s => s.id === id) || null;
  const data = { subjects: [{ id: 'm', name: 'الرياضيات' }, { id: 'a', name: 'اللغة العربية' }] };
  const plan = { columns: [ { id: 'c', group: 'week', time: '08:00 - 10:00' }, { id: 'd', group: 'weekend', time: '18:00 - 19:00' } ], entries: [
    { id: 'a', dayIdx: 0, columnId: 'c', subjectId: 'm', time: '09:30 - 10:30' },
    { id: 'b', dayIdx: 5, columnId: 'd', subjectId: 'a' },
  ] };
  assert.equal(ctx.buildReviewCanvas(plan, data), canvas);
  assert.ok(canvas.width > canvas.height);
  for (const name of ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الرياضيات', 'اللغة العربية', '09:30 - 10:30']) assert.ok(texts.includes(name), name);
});

test('canvas wraps long values and accommodates multiple entries without clipping', () => {
  const { ctx } = context();
  const text = [];
  const context2d = { measureText: s => ({width: Array.from(String(s)).length * 17}), fillRect() {}, strokeRect() {}, fillText: (s, x, y) => text.push({s,x,y}) };
  let canvas;
  ctx.document = { createElement: () => (canvas = { getContext: () => context2d }) };
  ctx.getSubject = (data, id) => data.subjects.find(s => s.id === id) || null;
  const plan = { columns: [{ id: 'p', group: 'week', time: '08:30 - 10:30' }], entries: Array.from({length: 15}, (_, i) => ({ id: String(i), dayIdx: 0, columnId: 'p', subjectId: 's', time: '18:00 - 19:00' })) };
  ctx.buildReviewCanvas(plan, { subjects: [{ id: 's', name: 'اللغة العربية' }] });
  assert.ok(canvas.width > canvas.height);
  assert.equal(text.filter(t => t.s === 'اللغة العربية').length, 15);
  assert.ok(text.every(t => t.y <= canvas.height));
});

test('migrated groups and custom times survive local and cloud save and reload', async () => {
  const { ctx, values } = context();
  const legacy = { columns: [{ id: 'p', time: '18:00 - 20:00' }], entries: [
    { id: 'e1', dayIdx: 2, columnId: 'p', subjectId: 'm', time: '19:00 - 21:00' },
    { id: 'e2', dayIdx: 4, columnId: 'p', subjectId: 'a' },
  ] };
  values.set('ayaBacReviewPlan.v1', JSON.stringify(legacy));
  const migrated = ctx.splitReviewGroups(ctx.loadReviewPlan());
  const weekendColumn = migrated.columns.find(c => c.group === 'weekend');
  assert.equal(ctx.renameReviewColumn(migrated, weekendColumn.id, '09:00 - 11:00'), true);
  assert.equal(await ctx.saveReviewPlan(migrated), true);
  assert.deepEqual(clone(ctx.splitReviewGroups(ctx.loadReviewPlan())), clone(migrated));
  ctx.window.AYA_ADMIN_MODE = true;
  ctx.window.CLOUD_SCHEDULE = { review: legacy, plan: { slots: [] } };
  let sent;
  ctx.Cloud = { mode: 'cloud', saveReviewPlan: async p => { sent = clone(p); return true; } };
  assert.deepEqual(clone(ctx.loadReviewPlan()), clone(migrated));
  assert.equal(await ctx.saveReviewPlan(migrated), true);
  assert.equal(values.has('ayaBacReviewDraft.v1'), false);
  ctx.window.AYA_ADMIN_MODE = false;
  assert.deepEqual(clone(ctx.splitReviewGroups(ctx.loadReviewPlan())), sent);
  assert.equal(sent.entries.find(e => e.id === 'e1').time, '19:00 - 21:00');
  assert.equal(sent.columns.find(c => c.id === sent.entries.find(e => e.id === 'e2').columnId).time, '09:00 - 11:00');
});
