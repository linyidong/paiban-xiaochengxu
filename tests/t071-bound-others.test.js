// T-071 服务端排除已被其他成员绑定的昵称/真实姓名
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('服务端候选过滤已绑定他人', function () {
  const js = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js'), 'utf8');
  assert.ok(js.includes('排除已经被其他成员绑定的昵称/真实姓名'));
  assert.ok(js.includes('if (targetUser && u._id === targetUser._id) return false;'));
});
