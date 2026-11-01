// T-058 映射持久化使用 setRealNameSelf，不再依赖客户端成员目录
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const MANAGE = path.join(__dirname, '..', 'cloudfunctions', 'manageMember', 'index.js');

test('setRealNameSelf 按当前微信写入真实姓名', async function () {
  const state = createState();
  state.openid = 'o-member-1';
  const main = loadWithMock(MANAGE, state);
  const r = await main({ action: 'setRealNameSelf', realName: '罗小雯' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(state.users.find(function (u) { return u._id === 'u1'; }).realName, '罗小雯');
});
