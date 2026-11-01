// T-049 管理员按真实姓名归位到已绑定昵称；直接导入默认当前月。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const IMPORT = path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js');

test('排班表只有真实姓名时归到已绑定昵称，不重复建档', async function () {
  const state = createState();
  state.openid = 'o-admin';
  state.users[0].name = '菓菓';
  state.users[0].realName = '吴义芳';
  const main = loadWithMock(IMPORT, state);
  const r = await main({
    commit: true, year: 2026, month: 11,
    preview: [{ name: '吴义芳', realName: '吴义芳', rows: [{ date: '2026-11-01', shift: '休' }] }]
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(state.shifts.length, 1);
  assert.strictEqual(state.shifts[0].userId, 'u1');
  assert.strictEqual(state.users.filter(function (u) { return u.name === '吴义芳'; }).length, 0);
  assert.strictEqual(state.users.length, 3);
});

test('直接点底部导入默认当前月', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(js.includes('_currentMonth'));
  assert.ok(js.includes("this.setData({ targetMonth: this._currentMonth() })"));
});
