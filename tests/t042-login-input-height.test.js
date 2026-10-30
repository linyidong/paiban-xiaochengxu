// T-042 登录页成员昵称输入框高度：不能只剩一条细线。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('bind-input 有 88rpx 高度和行高', function () {
  const css = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'login', 'login.wxss'), 'utf8');
  const block = css.match(/\.bind-input\s*\{[^}]*\}/);
  assert.ok(block, 'bind-input 规则存在');
  assert.match(block[0], /height:\s*88rpx/);
  assert.match(block[0], /min-height:\s*88rpx/);
  assert.match(block[0], /line-height:\s*88rpx/);
});

test('创建成员表单使用 bind-input', function () {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'login', 'login.wxml'), 'utf8');
  assert.ok(wxml.includes('class="bind-input"'));
  assert.ok(wxml.includes('placeholder="输入成员昵称"'));
});
