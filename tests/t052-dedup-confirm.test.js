// T-052 同名成员注册去重 + 命中确认 + 持久绑定
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const MANAGE = path.join(ROOT, 'cloudfunctions', 'manageMember', 'index.js');

test('checkName 返回已有成员的昵称/真实姓名/绑定状态', async function () {
  const state = createState();
  state.openid = 'o-new';
  state.users[0].realName = '吴义芳';
  const main = loadWithMock(MANAGE, state);
  const r = await main({ action: 'checkName', name: '甲' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.exists, true);
  assert.strictEqual(r.member.name, '甲');
  assert.strictEqual(r.member.realName, '吴义芳');
  assert.strictEqual(r.member.isBound, true);
});

test('createAndBind 新成员可同时写真实姓名', async function () {
  const state = createState();
  state.openid = 'o-new';
  const main = loadWithMock(MANAGE, state);
  const r = await main({ action: 'createAndBind', name: '新成员', realName: '新真名' });
  assert.strictEqual(r.ok, true);
  const u = state.users.find(function (x) { return x.name === '新成员'; });
  assert.strictEqual(u.realName, '新真名');
});

test('登录页先查重，命中导入先确认对应关系', function () {
  const login = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'login', 'login.js'), 'utf8');
  const imp = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.match(login, /action:\s*['"]checkName['"]/);
  assert.ok(login.includes('forceNewIdentity'));
  assert.ok(imp.includes('确认成员对应关系'));
  assert.ok(imp.includes('_showCandidatesForTarget'));
  assert.ok(imp.includes("action: 'setRealName'"));
});
