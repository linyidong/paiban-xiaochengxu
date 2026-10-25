// T-003 回归测试：软删除成员、保留排班、全查询过滤。
// 运行：node --test tests/t003-soft-delete.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');

function setup(fnName, openid) {
  const state = createState();
  state.openid = openid;
  return { state: state, main: loadWithMock(path.join(ROOT, 'cloudfunctions', fnName, 'index.js'), state) };
}

function markDeleted(state, id) {
  const u = state.users.find(function (x) { return x._id === id; });
  u.isDeleted = true;
  u.deletedAt = new Date();
  return u;
}

test('remove 只打软删除标记，users 与 shifts 都不删除', async function () {
  const ctx = setup('manageMember', 'o-admin');
  ctx.state.shifts.push({ _id: 's1', userId: 'u2', date: '2026-10-01', shiftType: '休' });
  const r = await ctx.main({ action: 'remove', id: 'u2' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.softDeleted, true);
  const u = ctx.state.users.find(function (x) { return x._id === 'u2'; });
  assert.ok(u);
  assert.strictEqual(u.isDeleted, true);
  assert.ok(u.deletedAt);
  assert.strictEqual(ctx.state.shifts.length, 1, '排班必须保留');
});

test('list 不返回已删除成员', async function () {
  const ctx = setup('manageMember', 'o-admin');
  await ctx.main({ action: 'remove', id: 'u2' });
  const r = await ctx.main({ action: 'list' });
  const names = r.members.map(function (m) { return m.name; });
  assert.deepStrictEqual(names.includes('乙'), false);
  assert.deepStrictEqual(names.includes('甲'), true);
});

test('updateShift 目标为已删除成员时拒绝', async function () {
  const ctx = setup('updateShift', 'o-admin');
  markDeleted(ctx.state, 'u2');
  const r = await ctx.main({ name: '乙', shift: '休', dates: ['2026-10-02'] });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /已删除/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('login 忽略已删除记录，返回 needBind', async function () {
  const ctx = setup('login', 'o-member-2');
  markDeleted(ctx.state, 'u2');
  const r = await ctx.main();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.needBind, true);
  assert.strictEqual(r.name, '');
});

test('getShifts 成员列表与排班映射都不含已删除成员', async function () {
  const ctx = setup('getShifts', 'o-admin');
  ctx.state.shifts.push({ _id: 's1', userId: 'u1', date: '2026-10-01', shiftType: '正A' });
  ctx.state.shifts.push({ _id: 's2', userId: 'u2', date: '2026-10-01', shiftType: '休' });
  markDeleted(ctx.state, 'u2');
  const r = await ctx.main({ year: 2026, month: 10 });
  const names = r.members.map(function (m) { return m.name; });
  assert.deepStrictEqual(names.includes('乙'), false);
  assert.strictEqual(r.shiftsMap['乙'], undefined);
  assert.strictEqual(r.shiftsMap['甲']['2026-10-01'], '正A');
});

test('importShift commit 拒绝已删除成员，避免部分写入', async function () {
  const ctx = setup('importShift', 'o-admin');
  markDeleted(ctx.state, 'u2');
  const r = await ctx.main({
    commit: true,
    preview: [{ name: '乙', rows: [{ date: '2026-10-02', shift: '休' }] }]
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /已删除/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});

test('bindWechat 不能绑定已删除成员', async function () {
  const ctx = setup('manageMember', 'o-member-1');
  markDeleted(ctx.state, 'u2');
  const r = await ctx.main({ action: 'bindWechat', name: '乙' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /已删除/);
});

test('createAndBind 对已删除同名成员返回明确错误', async function () {
  const ctx = setup('manageMember', 'o-member-2');
  markDeleted(ctx.state, 'u2');
  const r = await ctx.main({ action: 'createAndBind', name: '乙' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /已删除/);
});

test('旧数据没有 isDeleted 字段时正常返回', async function () {
  const ctx = setup('getShifts', 'o-admin');
  ctx.state.shifts.push({ _id: 's1', userId: 'u2', date: '2026-10-01', shiftType: '休' });
  const r = await ctx.main({ year: 2026, month: 10 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.shiftsMap['乙']['2026-10-01'], '休');
});
