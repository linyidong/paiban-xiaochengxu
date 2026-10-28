// T-032 回归：调休使用紫色，白字对比度达标。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const shift = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'shift.js'));

function lum(hex) {
  const c = hex.replace('#', '').match(/../g).map(function (x) { return parseInt(x, 16) / 255; })
    .map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

test('调休颜色为紫色 #7C3AED', function () {
  assert.strictEqual(shift.getShiftColor('调休'), '#7C3AED');
});

test('调休白字对比度 ≥4.5:1', function () {
  assert.ok(ratio('#FFFFFF', '#7C3AED') >= 4.5);
});
