// T-053 腾讯云表格 OCR V3 单元格解析
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadModuleWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const IMPORT = path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js');

function cell(row, col, text) {
  return { RowTl: row, ColTl: col, RowBr: row, ColBr: col, Text: text };
}

test('腾讯表格单元格还原昵称/真实姓名/班次', function () {
  const mod = loadModuleWithMock(IMPORT, createState());
  const resp = {
    TableDetections: [{
      Cells: [
        cell(0, 0, '昵称'), cell(0, 1, '人员'), cell(0, 2, '1号'), cell(0, 3, '2号'), cell(0, 4, '3号'),
        cell(1, 0, '菓菓'), cell(1, 1, '吴义芳'), cell(1, 2, '休'), cell(1, 3, '正'), cell(1, 4, '售后'),
        cell(2, 0, '芳芳'), cell(2, 1, '王玲芳'), cell(2, 2, '售A'), cell(2, 3, '年假'), cell(2, 4, '休')
      ]
    }]
  };
  const out = mod._parseTencentTable(resp, 2026, 11);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].nickname, '菓菓');
  assert.strictEqual(out[0].realName, '吴义芳');
  assert.strictEqual(out[0].days[0], '休');
  assert.strictEqual(out[0].days[2], '售后');
  assert.strictEqual(out[1].days[1], '年假');
});

test('只有人员列时按真实姓名解析，不把分组当人名', function () {
  const mod = loadModuleWithMock(IMPORT, createState());
  const resp = {
    TableDetections: [{
      Cells: [
        cell(0, 0, '人员'), cell(0, 1, '1号'), cell(0, 2, '2号'),
        cell(1, 0, '吴义芳'), cell(1, 1, '休'), cell(1, 2, '正')
      ]
    }]
  };
  const out = mod._parseTencentTable(resp, 2026, 11);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].nickname, '');
  assert.strictEqual(out[0].realName, '吴义芳');
});
