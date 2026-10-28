// T-004 回归测试：导入权限、按成员+月份全量替换、年份/日期合法性。
// 运行：node --test tests/t004-import-shift.test.js
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

test('成员导入自己成功，返回新增计数', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ commit: true, preview: [{ name: '甲', rows: rows(['2026-10-01', '2026-10-02']) }] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.added, 2);
  assert.strictEqual(r.updated, 0);
  assert.strictEqual(r.removed, 0);
  assert.strictEqual(ctx.state.shifts.length, 2);
  assert.strictEqual(ctx.state.shifts[0].userId, 'u1');
});

test('成员导入他人被拒绝，0 写入', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ commit: true, preview: [{ name: '乙', rows: rows(['2026-10-01']) }] });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /只能导入自己的排班/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('管理员导入他人成功', async function () {
  const ctx = setup('o-admin');
  const r = await ctx.main({ commit: true, preview: [{ name: '乙', rows: rows(['2026-10-01']) }] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.state.shifts.length, 1);
  assert.strictEqual(ctx.state.shifts[0].userId, 'u2');
});

test('全量替换：新表未出现的日期被清空，其他月份不受影响', async function () {
  const ctx = setup('o-member-1');
  ctx.state.shifts.push(
    { _id: 's1', userId: 'u1', date: '2026-10-01', shiftType: '正' },
    { _id: 's2', userId: 'u1', date: '2026-10-03', shiftType: '休' },
    { _id: 's3', userId: 'u1', date: '2026-09-30', shiftType: '休' }
  );
  const r = await ctx.main({ commit: true, preview: [{ name: '甲', rows: rows(['2026-10-01', '2026-10-02']) }] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.updated, 1);
  assert.strictEqual(r.added, 1);
  assert.strictEqual(r.removed, 1);
  const oct = ctx.state.shifts.filter(function (s) { return s.date.slice(0, 7) === '2026-10'; });
  assert.deepStrictEqual(oct.map(function (s) { return s.date; }).sort(), ['2026-10-01', '2026-10-02']);
  assert.strictEqual(ctx.state.shifts.some(function (s) { return s.date === '2026-09-30'; }), true);
});

test('同一天历史重复记录会被清理为一条', async function () {
  const ctx = setup('o-member-1');
  ctx.state.shifts.push(
    { _id: 'd1', userId: 'u1', date: '2026-10-01', shiftType: '休' },
    { _id: 'd2', userId: 'u1', date: '2026-10-01', shiftType: '正' }
  );
  const r = await ctx.main({ commit: true, preview: [{ name: '甲', rows: rows(['2026-10-01']) }] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.removed, 1);
  assert.strictEqual(ctx.state.shifts.length, 1);
});

test('预览跨月份被拒绝', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({
    commit: true,
    preview: [{ name: '甲', rows: rows(['2026-10-01', '2026-11-01']) }]
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /多个月份/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('非法日期 2026-02-31 被拒绝', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ commit: true, preview: [{ name: '甲', rows: rows(['2026-02-31']) }] });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /日期不合法/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('选择月份与预览月份不一致时按所选月份重写', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({
    commit: true,
    year: 2025,
    month: 12,
    preview: [{ name: '甲', rows: rows(['2026-10-01']) }]
  });
  assert.strictEqual(r.ok, true, r.msg);
  assert.strictEqual(ctx.state.shifts[0].date, '2025-12-01');
});

test('管理员可自动登记新成员并写入排班', async function () {
  const ctx = setup('o-admin');
  const before = ctx.state.users.length;
  const r = await ctx.main({ commit: true, preview: [{ name: '丙', rows: rows(['2026-10-01']) }] });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.newMembers, ['丙']);
  assert.strictEqual(ctx.state.users.length, before + 1);
  const p = ctx.state.users.find(function (u) { return u.name === '丙'; });
  assert.strictEqual(ctx.state.shifts[0].userId, p._id);
});

test('成员不能通过导入自动登记他人', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ commit: true, preview: [{ name: '丙', rows: rows(['2026-10-01']) }] });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /只能导入自己的排班/);
  assert.strictEqual(ctx.state.users.some(function (u) { return u.name === '丙'; }), false);
});

test('按成员拆分：两人分别替换各自月份', async function () {
  const ctx = setup('o-admin');
  ctx.state.shifts.push(
    { _id: 'a1', userId: 'u1', date: '2026-10-01', shiftType: '休' },
    { _id: 'b1', userId: 'u2', date: '2026-10-05', shiftType: '休' }
  );
  const r = await ctx.main({
    commit: true,
    preview: [
      { name: '甲', rows: rows(['2026-10-02']) },
      { name: '乙', rows: rows(['2026-10-05']) }
    ]
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.state.shifts.filter(function (s) { return s.userId === 'u1'; }).length, 1);
  assert.strictEqual(ctx.state.shifts.filter(function (s) { return s.userId === 'u2'; }).length, 1);
});
