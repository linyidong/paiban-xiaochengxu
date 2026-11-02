// T-067 登录页导入列表/预览按昵称+真实姓名格式显示
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('登录导入显示昵称/真实姓名，绑定输入只自动填昵称', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'login', 'login.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'login', 'login.wxml'), 'utf8');
  assert.ok(js.includes('importMemberLabel'));
  assert.ok(js.includes('昵称「'));
  assert.ok(js.includes('真实姓名「'));
  assert.ok(js.includes('importMemberNickname'));
  assert.ok(wxml.includes('识别结果预览：{{importPreviewLabel'));
});
