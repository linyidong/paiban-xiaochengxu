// T-007 回归测试：管理员新增成员、权限与重名（含软删除）。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const FN = path.join(__dirname, '..', 'cloudfunctions', 'manageMember', 'index.js');

function setup(openid) {
  const state = createState();
  state.openid = openid;
  return { state: state, main: loadWithMock(FN, state) };
}

test('管理员新增成员成功，users +1 且未绑定', async function () {
  const ctx = setup('o-admin');
  const before = ctx.state.users.length;
  const r = await ctx.main({ action: 'add', name: '张三' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.state.users.length, before + 1);
  const u = ctx.state.users.find(function (x) { return x.name === '张三'; });
  assert.ok(u);
  assert.strictEqual(u.openid, '');
  assert.strictEqual(u.role, 'member');
});

test('非管理员新增成员被拒绝', async function () {
  const ctx = setup('o-member-1');
  const before = ctx.state.users.length;
  const r = await ctx.main({ action: 'add', name: '李四' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /仅管理员/);
  assert.strictEqual(ctx.state.users.length, before);
});

test('新增已存在姓名被拒绝', async function () {
  const ctx = setup('o-admin');
  const r = await ctx.main({ action: 'add', name: '甲' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /已存在/);
});

test('新增已软删除姓名被拒绝并提示可能已删除', async function () {
  const ctx = setup('o-admin');
  const u = ctx.state.users.find(function (x) { return x._id === 'u2'; });
  u.isDeleted = true;
  const r = await ctx.main({ action: 'add', name: '乙' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /可能已删除/);
});
