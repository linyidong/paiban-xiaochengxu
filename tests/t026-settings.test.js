// T-026 设置页：管理员读写主/备模型；页面入口与技术栈页存在。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const FN = path.join(ROOT, 'cloudfunctions', 'manageSettings', 'index.js');

function setup(openid) {
  const state = createState();
  state.openid = openid;
  return { state: state, main: loadWithMock(FN, state) };
}

test('管理员读取默认模型与 API Key（config）', async function () {
  const ctx = setup('o-admin');
  const r = await ctx.main({ action: 'get' });
  assert.strictEqual(r.ok, true);
  assert.ok(r.primaryModel);
  assert.ok(r.primaryApiKey);
  assert.strictEqual(r.source, 'config');
});

test('管理员保存主/备模型与各自 Key 后可读回', async function () {
  const ctx = setup('o-admin');
  const r = await ctx.main({
    action: 'save',
    primaryModel: 'model-a', primaryApiKey: 'key-primary-123',
    fallbackModel: 'model-b', fallbackApiKey: 'key-fallback-456'
  });
  assert.strictEqual(r.ok, true);
  const g = await ctx.main({ action: 'get' });
  assert.strictEqual(g.primaryModel, 'model-a');
  assert.strictEqual(g.primaryApiKey, 'key-primary-123');
  assert.strictEqual(g.fallbackModel, 'model-b');
  assert.strictEqual(g.fallbackApiKey, 'key-fallback-456');
  assert.strictEqual(g.source, 'db');
});

test('非法模型名/备用与主相同/缺主 Key 被拒绝', async function () {
  const ctx = setup('o-admin');
  assert.strictEqual((await ctx.main({ action: 'save', primaryModel: 'bad model', primaryApiKey: 'key-primary-123' })).ok, false);
  assert.strictEqual((await ctx.main({ action: 'save', primaryModel: 'm', primaryApiKey: 'key-primary-123', fallbackModel: 'm' })).ok, false);
  assert.strictEqual((await ctx.main({ action: 'save', primaryModel: 'm' })).ok, false);
});

test('非管理员不能读取或保存设置', async function () {
  const ctx = setup('o-member-1');
  assert.strictEqual((await ctx.main({ action: 'get' })).ok, false);
  assert.strictEqual((await ctx.main({ action: 'save', primaryModel: 'm' })).ok, false);
});

test('我的页有设置/技术栈入口，app.json 注册页面', function () {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'miniprogram', 'app.json'), 'utf8'));
  assert.ok(app.pages.includes('pages/settings/settings'));
  assert.ok(app.pages.includes('pages/techstack/techstack'));
  const mine = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'mine', 'mine.wxml'), 'utf8');
  assert.ok(mine.includes('goSettings'));
  assert.ok(mine.includes('goTechstack'));
});
