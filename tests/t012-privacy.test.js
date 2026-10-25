// T-012 回归测试：成员列表按角色裁剪 openid。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const FN = path.join(__dirname, '..', 'cloudfunctions', 'manageMember', 'index.js');

function setup(openid) {
  const state = createState();
  state.openid = openid;
  state.users.push({ _id: 'u4', openid: '', name: '未绑定成员', role: 'member' });
  return { state: state, main: loadWithMock(FN, state) };
}

test('管理员 list 返回 openid', async function () {
  const ctx = setup('o-admin');
  const r = await ctx.main({ action: 'list' });
  assert.strictEqual(r.ok, true);
  const me = r.members.find(function (m) { return m.name === '管理员'; });
  assert.strictEqual(me.openid, 'o-admin');
});

test('普通成员 list 不含 openid 字段', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ action: 'list' });
  assert.strictEqual(r.ok, true);
  r.members.forEach(function (m) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(m, 'openid'), false);
  });
});

test('isSelf 只对自己为 true', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ action: 'list' });
  const self = r.members.find(function (m) { return m.name === '甲'; });
  const other = r.members.find(function (m) { return m.name === '乙'; });
  assert.strictEqual(self.isSelf, true);
  assert.strictEqual(other.isSelf, false);
});

test('isBound 反映是否已绑定微信', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ action: 'list' });
  const bound = r.members.find(function (m) { return m.name === '甲'; });
  const unbound = r.members.find(function (m) { return m.name === '未绑定成员'; });
  assert.strictEqual(bound.isBound, true);
  assert.strictEqual(unbound.isBound, false);
});
