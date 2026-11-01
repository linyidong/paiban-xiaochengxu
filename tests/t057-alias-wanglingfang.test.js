// T-057 王铃芳别名归位
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

test('王铃芳归位到王玲芳', function () {
  const cfg = require(path.join(__dirname, '..', 'cloudfunctions', 'importShift', 'config.json'));
  assert.ok((cfg.MEMBER_ALIAS['王玲芳'] || []).includes('王铃芳'));
});
