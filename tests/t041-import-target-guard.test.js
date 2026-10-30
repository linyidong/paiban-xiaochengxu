// T-041 导入目标成员锁定：目标东子时，绝不能把吴义芳的预览写进去。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const IMPORT = path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js');

test('目标成员不在预览中时，云函数拒绝导入', async function () {
  const state = createState();
  state.openid = 'o-admin';
  const main = loadWithMock(IMPORT, state);
  const r = await main({
    commit: true, year: 2026, month: 11, targetName: '东子',
    preview: [{ name: '吴义芳', rows: [{ date: '2026-11-01', shift: '休' }] }]
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /目标成员/);
  assert.strictEqual(state.shifts.length, 0);
});

test('目标成员匹配时只写目标成员', async function () {
  const state = createState();
  state.openid = 'o-admin';
  state.users.push({ _id: 'u5', openid: '', name: '东子', role: 'member' });
  const main = loadWithMock(IMPORT, state);
  const r = await main({
    commit: true, year: 2026, month: 11, targetName: '东子',
    preview: [
      { name: '东子', rows: [{ date: '2026-11-01', shift: '休' }] },
      { name: '吴义芳', rows: [{ date: '2026-11-01', shift: '正A' }] }
    ]
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(state.shifts.length, 1);
  assert.strictEqual(state.shifts[0].userId, 'u5');
});

test('导入页不再回退到其他成员，并提交 targetName', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(js.includes('未识别到目标成员'));
  assert.ok(js.includes('payload.targetName'));
  assert.ok(!/if \(hit\.length\) matched = hit;/.test(js));
});

test('切换成员时先同步 hasData 再 applyShifts（空月导入按钮）', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'calendar', 'calendar.js'), 'utf8');
  const hasPos = js.indexOf('hasData: hasData');
  const applyPos = js.indexOf('this.applyShifts()', hasPos);
  assert.ok(hasPos > -1);
  assert.ok(applyPos > hasPos);
});
