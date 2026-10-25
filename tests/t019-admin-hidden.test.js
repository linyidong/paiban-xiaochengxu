// T-019 回归测试：管理员伪成员不出现在列表，且不能被绑定（防提权）。
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

test('管理员调用 list 也不返回管理员记录', async function () {
  const ctx = setup('o-admin');
  const r = await ctx.main({ action: 'list' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.members.some(function (m) { return m.name === '管理员'; }), false);
  assert.strictEqual(r.members.some(function (m) { return m.role === 'admin'; }), false);
});

test('普通成员调用 list 同样不返回管理员记录', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ action: 'list' });
  assert.strictEqual(r.members.some(function (m) { return m.role === 'admin'; }), false);
});

test('bindWechat 不能绑定管理员记录', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ action: 'bindWechat', name: '管理员' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /管理员账号不能绑定/);
});

test('createAndBind 命中管理员同名时拒绝', async function () {
  const ctx = setup('o-new');
  const r = await ctx.main({ action: 'createAndBind', name: '管理员' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /管理员账号不能绑定/);
});
