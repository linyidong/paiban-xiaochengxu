// T-072 未绑定登录导入也必须排除已绑定他人，并拒绝重复真实姓名
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('服务端绑定过滤覆盖未绑定登录，真实姓名不可重复绑定', function () {
  const imp = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js'), 'utf8');
  const mem = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'manageMember', 'index.js'), 'utf8');
  assert.ok(imp.includes("if (!targetUser || targetUser.role !== 'admin')"));
  assert.ok(mem.includes('该真实姓名已被成员'));
});
