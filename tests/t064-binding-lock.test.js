// T-064 已绑定真实姓名的成员禁止在导入时改绑其他人
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('已有真实姓名时拦截不同人员映射', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(js.includes('boundRealName && realName && boundRealName !== realName'));
  assert.ok(js.includes('不能改绑'));
});
