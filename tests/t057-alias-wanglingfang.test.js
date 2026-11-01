// T-057 王铃芳别名归位
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

test('王玲芳归位到正确姓名王铃芳', function () {
  const cfg = require(path.join(__dirname, '..', 'cloudfunctions', 'importShift', 'config.json'));
  assert.ok((cfg.MEMBER_ALIAS['王铃芳'] || []).includes('王玲芳'));
  assert.ok((cfg.MEMBER_ALIAS['王铃芳'] || []).includes('芳芳'));
  assert.ok(!cfg.MEMBER_ALIAS['王玲芳']);
});
