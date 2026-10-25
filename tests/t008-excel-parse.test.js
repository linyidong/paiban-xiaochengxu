// T-008 回归测试：Excel 二维表解析（纯函数）。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadModuleWithMock } = require('./helpers/mock-cloud');

const FN = path.join(__dirname, '..', 'cloudfunctions', 'importShift', 'index.js');
const mod = loadModuleWithMock(FN, createState());
const parse = mod._parseSheetRows;

function fixture() {
  return [
    ['2026年10月排班表', '', '', '', '', '', ''],
    ['昵称', '人员', '1号', '2号', '3号', '4号', '5号'],
    ['成员A', '成员A', '休', '正A', '', '', ''],
    ['', '成员B', '售B', '', '年假', '', ''],
    ['合计', '', '', '', '', '', '']
  ];
}

test('识别标题年月与 5 个日期列，返回 2 行成员', function () {
  const out = parse(fixture());
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].name, '成员A');
  assert.deepStrictEqual(out[0].rows, [
    { date: '2026-10-01', shift: '休' },
    { date: '2026-10-02', shift: '正A' }
  ]);
});

test('昵称为空时回退“人员”列', function () {
  const out = parse(fixture());
  assert.strictEqual(out[1].name, '成员B');
});

test('空单元格被跳过，行数等于有班次的天数', function () {
  const out = parse(fixture());
  assert.strictEqual(out[1].rows.length, 2);
  assert.deepStrictEqual(out[1].rows.map(function (r) { return r.shift; }), ['售B', '年假']);
});

test('无日期表头返回空数组', function () {
  const out = parse([['姓名', '备注'], ['甲', '无']]);
  assert.deepStrictEqual(out, []);
});

test('非法日期 32 被忽略', function () {
  const rows = [
    ['2026年10月', '', '', '', '', '', ''],
    ['昵称', '人员', '1', '2', '3', '4', '5', '32'],
    ['甲', '', '休', '', '', '', '', '正A']
  ];
  const out = parse(rows);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].rows.length, 1);
  assert.strictEqual(out[0].rows[0].date, '2026-10-01');
});

test('标题只有月份时使用当前年', function () {
  const rows = [
    ['10月排班表', '', '', '', '', '', ''],
    ['昵称', '人员', '1', '2', '3', '4', '5'],
    ['甲', '', '休', '', '', '', '']
  ];
  const out = parse(rows);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].rows[0].date.slice(0, 7), new Date().getFullYear() + '-10');
});
