// T-065 已绑定人员不在表内时，返回整表并允许重新选择绑定
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('boundMissing 保留整表预览并允许重新绑定', function () {
  const server = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js'), 'utf8');
  const client = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(server.includes('boundMissing = true'));
  assert.ok(!server.includes('boundMissing = true; preview = [];'));
  assert.ok(client.includes('this._allowRebind = true'));
  assert.ok(client.includes('!this._allowRebind'));
});
