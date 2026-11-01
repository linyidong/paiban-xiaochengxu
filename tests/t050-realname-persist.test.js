// T-050 映射确认持久化真实姓名
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const MANAGE = path.join(ROOT, 'cloudfunctions', 'manageMember', 'index.js');

test('成员可把自己的真实姓名设置为表里的姓名', async function () {
  const state = createState();
  state.openid = 'o-member-1';
  const main = loadWithMock(MANAGE, state);
  const r = await main({ action: 'setRealName', id: 'u1', realName: '罗小雯' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(state.users.find(function (u) { return u._id === 'u1'; }).realName, '罗小雯');
});

test('成员不能设置别人的真实姓名', async function () {
  const state = createState();
  state.openid = 'o-member-1';
  const main = loadWithMock(MANAGE, state);
  const r = await main({ action: 'setRealName', id: 'u2', realName: '罗小雯' });
  assert.strictEqual(r.ok, false);
});

test('导入页映射时持久化真实姓名', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(js.includes("action: 'setRealName'"));
  assert.ok(js.includes('绑定真实姓名'));
});
