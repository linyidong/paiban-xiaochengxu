// T-046 成员真实姓名：管理员可见可改，Excel 昵称/真实姓名双列解析，导入双重匹配。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createState, loadWithMock, loadModuleWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const MANAGE = path.join(ROOT, 'cloudfunctions', 'manageMember', 'index.js');
const IMPORT = path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js');

test('管理员列表返回真实姓名，并可修改昵称+真实姓名', async function () {
  const state = createState();
  state.openid = 'o-admin';
  const main = loadWithMock(MANAGE, state);
  const list = await main({ action: 'list' });
  const one = list.members[0];
  assert.ok('realName' in one);
  const r = await main({ action: 'rename', id: one._id, newName: '菓菓', newRealName: '吴义芳' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.realName, '吴义芳');
});

test('Excel 三列（分组/昵称/人员）解析出昵称和真实姓名', function () {
  const mod = loadModuleWithMock(IMPORT, createState());
  const rows = [
    ['2026年11月排班表'],
    ['分组', '昵称', '人员', '1号', '2号', '3号', '4号', '5号'],
    ['VC组', '菓菓', '吴义芳', '休', '正', '', '', ''],
    ['草本组', '芳芳', '王玲芳', '售后', '', '休', '', '']
  ];
  const out = mod._parseSheetRows(rows);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].name, '菓菓');
  assert.strictEqual(out[0].nickname, '菓菓');
  assert.strictEqual(out[0].realName, '吴义芳');
  assert.strictEqual(out[0].name, '菓菓'); // 不能是“VC组”
});

test('导入页提供昵称/真实姓名双重匹配与已绑定排除', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(js.includes('_isBoundToOther'));
  assert.ok(js.includes('targetRealName'));
  assert.ok(js.includes('_useMatchedRows'));
});
