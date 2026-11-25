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
  ] };
  const before = clone(plan);
  const grid = ctx.reviewFromSchedule(plan);
  assert.deepEqual(clone(plan), before);
  assert.deepEqual(clone(grid.columns.map(c => c.time)), ['08:30 - 10:30', '17:30 - 19:30', '19:30 - 18:00']);
  assert.equal(grid.entries.length, 4);
  assert.equal(grid.entries[1].columnId, grid.entries[2].columnId);
  assert.equal(grid.entries[3].dayIdx, 5);
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
