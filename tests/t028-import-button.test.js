// T-028 空月“导入”按钮：只在无排班时出现，位置在批量右侧，点击带成员+年月到导入页。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cal = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'calendar.js'));

function monthCells(days) {
  const cells = [];
  for (let d = 1; d <= days; d++) cells.push({ day: d, fullDate: '2026-11-' + String(d).padStart(2, '0'), inMonth: true });
  return cells;
}

test('无排班时批量右侧追加导入格', function () {
  const out = cal.withBatchCell(monthCells(30), '批量', false, true);
  assert.strictEqual(out.length, 32);
  assert.strictEqual(out[30].isBatch, true);
  assert.strictEqual(out[31].isImport, true);
  assert.strictEqual(out[31].importLabel, '导入');
});

test('有排班/多选时不追加导入格', function () {
  assert.strictEqual(cal.withBatchCell(monthCells(30), '批量', false, false).length, 31);
  assert.strictEqual(cal.withBatchCell(monthCells(30), '完成', true, false).length, 31);
});

test('组件注册 import 事件并渲染导入按钮', function () {
  const root = path.join(__dirname, '..', 'miniprogram');
  const js = fs.readFileSync(path.join(root, 'components', 'calendar', 'calendar.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(root, 'components', 'calendar', 'calendar.wxml'), 'utf8');
  assert.ok(js.includes("triggerEvent('import')"));
  assert.ok(wxml.includes('data-import'));
  assert.ok(wxml.includes('import-btn'));
});

test('日历页点击导入时写入成员+年月并跳到导入页', function () {
  const root = path.join(__dirname, '..', 'miniprogram');
  const js = fs.readFileSync(path.join(root, 'pages', 'calendar', 'calendar.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(root, 'pages', 'calendar', 'calendar.wxml'), 'utf8');
  assert.ok(js.includes('importPrefill'));
  assert.ok(js.includes("'importPrefill'"));
  assert.ok(js.includes("url: '/pages/import/import'"));
  assert.ok(wxml.includes('bind:import="onImportTap"'));
});

test('导入页读取 prefill 并只保留目标成员', function () {
  const root = path.join(__dirname, '..', 'miniprogram');
  const js = fs.readFileSync(path.join(root, 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(js.includes("wx.getStorageSync('importPrefill')"));
  assert.ok(js.includes('prefillName'));
  assert.ok(js.includes('matched = hit'));
});
