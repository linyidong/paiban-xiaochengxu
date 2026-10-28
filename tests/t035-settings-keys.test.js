// T-035 设置页主/备 API Key：页面字段、云函数候选 Key 继承、移除技术栈入口。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createState, loadModuleWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const WXML = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'settings', 'settings.wxml'), 'utf8');

test('设置页包含主/备模型与 Key 四个字段，且不再有查看技术栈', function () {
  assert.ok(WXML.includes('主模型名称'));
  assert.ok(WXML.includes('主模型 API Key'));
  assert.ok(WXML.includes('备用模型名称'));
  assert.ok(WXML.includes('备用模型 API Key'));
  assert.strictEqual(WXML.includes('查看技术栈'), false);
});

test('备用 Key 为空时复用主 Key，重复模型去重', function () {
  const state = createState();
  const mod = loadModuleWithMock(path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js'), state);
  const list = mod._modelCandidates('m1', 'k1', 'm2', '');
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[1].apiKey, 'k1');
  const dup = mod._modelCandidates('m1', 'k1', 'm1', 'k2');
  assert.strictEqual(dup.length, 1);
});
