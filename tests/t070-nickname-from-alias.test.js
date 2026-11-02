// T-070 昵称缺失时从别名表反推昵称
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('服务端从真实姓名反推昵称', function () {
  const js = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js'), 'utf8');
  assert.ok(js.includes('function nicknameFromAlias'));
  assert.ok(js.includes('filledNickname'));
  assert.ok(js.includes('nicknameFromAlias(realName)'));
});
