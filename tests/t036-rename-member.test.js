// T-036 管理员修改成员名：只改 users.name，排班按 userId 不受影响；重名/管理员/非管理员拦截。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const FN = path.join(ROOT, 'cloudfunctions', 'manageMember', 'index.js');

function setup(openid) {
  const state = createState();
  state.openid = openid;
  return { state: state, main: loadWithMock(FN, state) };
}

test('管理员改名成功，排班 userId 不变', async function () {
  const ctx = setup('o-admin');
  ctx.state.shifts.push({ _id: 's1', userId: 'u1', date: '2026-10-01', shiftType: '休' });
  const r = await ctx.main({ action: 'rename', id: 'u1', newName: '甲新' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.oldName, '甲');
  const u = ctx.state.users.find(function (x) { return x._id === 'u1'; });
  assert.strictEqual(u.name, '甲新');
  assert.strictEqual(ctx.state.shifts[0].userId, 'u1');
});

test('重名（含已删除）被拒绝', async function () {
  const ctx = setup('o-admin');
  assert.strictEqual((await ctx.main({ action: 'rename', id: 'u1', newName: '乙' })).ok, false);
  ctx.state.users.push({ _id: 'u4', name: '丙', role: 'member', isDeleted: true });
  assert.strictEqual((await ctx.main({ action: 'rename', id: 'u1', newName: '丙' })).ok, false);
});

test('非管理员不能改名', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ action: 'rename', id: 'u1', newName: '甲新' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /仅管理员/);
});

test('不能修改管理员名字', async function () {
  const ctx = setup('o-admin');
  const r = await ctx.main({ action: 'rename', id: 'u3', newName: '管理员新' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /管理员/);
});

test('空名/超长/不存在被拒绝', async function () {
  const ctx = setup('o-admin');
  assert.strictEqual((await ctx.main({ action: 'rename', id: 'u1', newName: '   ' })).ok, false);
  assert.strictEqual((await ctx.main({ action: 'rename', id: 'u1', newName: '一二三四五六七八九十一二三四五六七八九十一' })).ok, false);
  assert.strictEqual((await ctx.main({ action: 'rename', id: 'nope', newName: '甲新' })).ok, false);
});

test('成员页提供行内改名入口', function () {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'members', 'members.wxml'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'members', 'members.js'), 'utf8');
  assert.ok(wxml.includes('onStartRename'));
  assert.ok(wxml.includes('onSaveRename'));
  assert.ok(js.includes("action: 'rename'"));
});
