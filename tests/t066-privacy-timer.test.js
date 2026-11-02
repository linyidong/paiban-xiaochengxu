// T-066 隐私授权最多询问 3 次；登录页/导入页导入显示计时
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('隐私拒绝后可继续询问，最多 3 次', function () {
  let asks = 0, passed = 0, failed = 0;
  global.wx = {
    getPrivacySetting: function (o) { o.success({ needAuthorization: true }); },
    requirePrivacyAuthorize: function () {},
    showModal: function (o) { asks += 1; o.success({ confirm: false }); }
  };
  const { ensurePrivacy } = require(path.join(ROOT, 'miniprogram', 'utils', 'privacy.js'));
  ensurePrivacy(function () { passed += 1; }, function () { failed += 1; });
  assert.strictEqual(asks, 3);
  assert.strictEqual(passed, 0);
  assert.strictEqual(failed, 1);
});

test('登录页导入与导入页都有识别计时', function () {
  const login = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'login', 'login.js'), 'utf8');
  const imp = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(login.includes('_startImportTimer'));
  assert.ok(login.includes('importRecognizeSeconds'));
  assert.ok(imp.includes('_startRecognizeTimer'));
  assert.ok(imp.includes('recognizeSeconds'));
});
