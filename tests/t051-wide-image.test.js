// T-051 宽表上传不降采样过度
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('上传前保留 1600px 宽度和质量 85', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(js.includes('compressedWidth: 1600'));
  assert.ok(js.includes('quality: 85'));
  assert.ok(!js.includes('compressedWidth: 1000'));
});
