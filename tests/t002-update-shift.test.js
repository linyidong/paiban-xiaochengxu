// T-002 回归测试：updateShift 的权限、日期校验、去重与取消语义。
// 运行：node --test tests/t002-update-shift.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const FN = path.join(__dirname, '..', 'cloudfunctions', 'updateShift', 'index.js');

function setup(openid) {
  const state = createState();
  state.openid = openid;
  return { state: state, main: loadWithMock(FN, state) };
}

test('成员改自己成功，updatedBy = me._id', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ name: '甲', shift: '正A', dates: ['2026-10-01'] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.state.shifts.length, 1);
  assert.strictEqual(ctx.state.shifts[0].updatedBy, 'u1');
  assert.strictEqual(ctx.state.shifts[0].shiftType, '正A');
});

test('成员改他人被拒绝，数据不变', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ name: '乙', shift: '休', dates: ['2026-10-02'] });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /只能修改自己的排班/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('管理员改他人成功', async function () {
  const ctx = setup('o-admin');
  const r = await ctx.main({ name: '乙', shift: '售B', dates: ['2026-10-03'] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.state.shifts.length, 1);
});

test('非法日期 2026-02-30 被拒绝且不写入', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ name: '甲', shift: '休', dates: ['2026-02-30'] });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /日期不合法/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('闰年 2024-02-29 合法', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ name: '甲', shift: '年假', dates: ['2024-02-29'] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.state.shifts.length, 1);
});

test('重复日期去重，只写一条', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ name: '甲', shift: '休', dates: ['2026-10-01', '2026-10-01'] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.count, 1);
  assert.strictEqual(ctx.state.shifts.length, 1);
});

test('同名多成员时拒绝，不猜目标', async function () {
  const ctx = setup('o-member-1');
  ctx.state.users.push({ _id: 'u4', openid: 'o-x', name: '甲', role: 'member' });
  const r = await ctx.main({ name: '甲', shift: '休', dates: ['2026-10-05'] });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /姓名重复/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('shift 为空时取消并删除记录', async function () {
  const ctx = setup('o-member-1');
  await ctx.main({ name: '甲', shift: '休', dates: ['2026-10-06'] });
  const r = await ctx.main({ name: '甲', shift: '', dates: ['2026-10-06'] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('changeLog 写入 operator = me._id', async function () {
  const ctx = setup('o-member-1');
  await ctx.main({ name: '甲', shift: '正', dates: ['2026-10-07'] });
  assert.strictEqual(ctx.state.changeLog.length, 1);
  assert.strictEqual(ctx.state.changeLog[0].operator, 'u1');
  assert.strictEqual(ctx.state.changeLog[0].newShift, '正');
});
