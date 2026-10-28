// T-027 回归测试：提前导入未来月份（显式选月份 → 以所选月份为准重写日期）
// 运行：node --test tests/t027-future-month.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const FN = path.join(__dirname, '..', 'cloudfunctions', 'importShift', 'index.js');

function setup(openid) {
  const state = createState();
  state.openid = openid;
  return { state: state, main: loadWithMock(FN, state) };
}

function rows(dates, shift) {
  return dates.map(function (d) { return { date: d, shift: shift || '休' }; });
}

test('10 月导入 11 月班表：显式选月份 + overrideMonth 时，日期被重写为 11 月', async function () {
  const ctx = setup('o-member-1');
  // 截图识别出的是 10 月（AI 没认对月份），但用户选了 11 月
  const r = await ctx.main({
    commit: true,
    year: 2026,
    month: 11,
    overrideMonth: true,
    preview: [{ name: '甲', rows: rows(['2026-10-01', '2026-10-02', '2026-10-30']) }]
  });
  assert.strictEqual(r.ok, true, r.msg);
  assert.strictEqual(ctx.state.shifts.length, 3);
  assert.deepStrictEqual(
    ctx.state.shifts.map(function (s) { return s.date; }).sort(),
    ['2026-11-01', '2026-11-02', '2026-11-30']
  );
  // 10 月不应有任何残留
  assert.strictEqual(ctx.state.shifts.some(function (s) { return s.date.slice(0, 7) === '2026-10'; }), false);
});

test('不选月份时行为不变：识别月份与所选月份不一致则拒绝', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({
    commit: true,
    year: 2026,
    month: 11,
    preview: [{ name: '甲', rows: rows(['2026-10-01']) }]
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /不一致/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('重写到 2 月时，31 号被拦住（该月只有 28 天）', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({
    commit: true,
    year: 2026,
    month: 2,
    overrideMonth: true,
    preview: [{ name: '甲', rows: rows(['2026-10-31']) }]
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /只有 28 天/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('选月份与识别一致时正常入库，且不会被误重写', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({
    commit: true,
    year: 2026,
    month: 11,
    overrideMonth: true,
    preview: [{ name: '甲', rows: rows(['2026-11-05', '2026-11-06']) }]
  });
  assert.strictEqual(r.ok, true, r.msg);
  assert.deepStrictEqual(
    ctx.state.shifts.map(function (s) { return s.date; }).sort(),
    ['2026-11-05', '2026-11-06']
  );
});

test('提前导入会整月替换该成员的目标月份（覆盖语义）', async function () {
  const ctx = setup('o-member-1');
  ctx.state.shifts.push(
    { _id: 'old1', userId: 'u1', date: '2026-11-10', shiftType: '正' },
    { _id: 'old2', userId: 'u1', date: '2026-11-20', shiftType: '正' },
    { _id: 'other', userId: 'u1', date: '2026-10-05', shiftType: '休' }
  );
  const r = await ctx.main({
    commit: true,
    year: 2026,
    month: 11,
    overrideMonth: true,
    preview: [{ name: '甲', rows: rows(['2026-10-01']) }]
  });
  assert.strictEqual(r.ok, true, r.msg);
  const nov = ctx.state.shifts.filter(function (s) { return s.date.slice(0, 7) === '2026-11'; });
  assert.deepStrictEqual(nov.map(function (s) { return s.date; }), ['2026-11-01']);
  // 其他月份不受影响
  assert.strictEqual(ctx.state.shifts.some(function (s) { return s.date === '2026-10-05'; }), true);
});
