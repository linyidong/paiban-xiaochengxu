// T-009 回归测试：管理员整表导入（多成员一次提交）。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const FN = path.join(__dirname, '..', 'cloudfunctions', 'importShift', 'index.js');

function setup(openid) {
  const state = createState();
  state.openid = openid;
  state.users.push({ _id: 'u5', openid: 'o-member-3', name: '丙', role: 'member' });
  return { state: state, main: loadWithMock(FN, state) };
}

function rows(date, shift) {
  return [{ date: date, shift: shift || '休' }];
}

test('管理员一次提交 3 人整表，各写各的', async function () {
  const ctx = setup('o-admin');
  const r = await ctx.main({
    commit: true,
    preview: [
      { name: '甲', rows: rows('2026-10-01', '正A') },
      { name: '乙', rows: rows('2026-10-01', '售B') },
      { name: '丙', rows: rows('2026-10-01', '休') }
    ]
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.count, 3);
  assert.strictEqual(ctx.state.shifts.length, 3);
  const byUser = {};
  ctx.state.shifts.forEach(function (s) { byUser[s.userId] = s.shiftType; });
  assert.deepStrictEqual(byUser, { u1: '正A', u2: '售B', u5: '休' });
});

test('整表中包含新成员时自动建档，已存在成员不重复建', async function () {
  const ctx = setup('o-admin');
  const before = ctx.state.users.length;
  const r = await ctx.main({
    commit: true,
    preview: [
      { name: '甲', rows: rows('2026-10-01') },
      { name: '丁', rows: rows('2026-10-01') }
    ]
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.newMembers, ['丁']);
  assert.strictEqual(ctx.state.users.length, before + 1);
  assert.strictEqual(ctx.state.shifts.length, 2);
});

test('普通成员提交多人整表被拒绝', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({
    commit: true,
    preview: [
      { name: '甲', rows: rows('2026-10-01') },
      { name: '乙', rows: rows('2026-10-01') }
    ]
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /只能导入自己的排班/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});
