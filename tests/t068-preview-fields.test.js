// T-068 服务端 preview 必须保留 nickname/realName，登录导入才能显示完整格式
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('importShift 归一化 preview 时保留昵称和真实姓名', function () {
  const js = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js'), 'utf8');
  assert.ok(js.includes('nickname: translateAlias(cleanText(p.nickname'));
  assert.ok(js.includes('realName: translateAlias(cleanText(p.realName'));
});
