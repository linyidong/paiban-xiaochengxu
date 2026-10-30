// T-038 成员自助改名：只能按自己的 openid 改自己，不能借 id 改别人。
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

test('成员改自己的名字成功，别人的记录不变', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ action: 'renameSelf', newName: '甲昵称' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.oldName, '甲');
  assert.strictEqual(ctx.state.users.find(function (u) { return u._id === 'u1'; }).name, '甲昵称');
  assert.strictEqual(ctx.state.users.find(function (u) { return u._id === 'u2'; }).name, '乙');
});

test('自助改名不能重名/空名，未绑定拒绝', async function () {
  const ctx = setup('o-member-1');
  assert.strictEqual((await ctx.main({ action: 'renameSelf', newName: '乙' })).ok, false);
  assert.strictEqual((await ctx.main({ action: 'renameSelf', newName: '  ' })).ok, false);
  const ctx2 = setup('o-not-bound');
  assert.strictEqual((await ctx2.main({ action: 'renameSelf', newName: '新名' })).ok, false);
});

test('我的页提供自助改名入口', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'mine', 'mine.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'mine', 'mine.wxml'), 'utf8');
  assert.ok(js.includes("action: 'renameSelf'"));
  assert.ok(wxml.includes('onStartRename'));
  assert.ok(wxml.includes('onSaveName'));
});
