// 日历工具：生成某月网格（周一~周日，含上月补位）+ 批量按钮入格
function getMonthGrid(year, month) {
  // month: 1-12
  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay(); // 0=周日
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  const offset = (startWeekday + 6) % 7; // 周一为一周起始
  for (let i = 0; i < offset; i++) {
    const d = new Date(year, month - 1, -offset + i + 1);
    cells.push({ day: d.getDate(), fullDate: fmtDate(d), inMonth: false, shift: '', color: '' });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const fullDate = fmtDate(new Date(year, month - 1, d));
    cells.push({ day: d, fullDate, inMonth: true, shift: '', color: '' });
  }
  return cells;
}
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function getToday() {
  return fmtDate(new Date());
}
// 在“当月最后一天”之后追加批量按钮格，追加“导入”格：
// - 不替换任何真实日期格，避免 29/30/31 被按钮覆盖；
// - 伪格 fullDate 用唯一值，避免 wx:key 冲突。
function withBatchCell(cells, label, on, showImport) {
  const list = (cells || []).map(function (c) { return Object.assign({}, c); });
  let last = -1;
  for (let i = 0; i < list.length; i++) { if (list[i].inMonth) last = i; }
  if (last < 0) return list;
  list.push({
    day: '',
    fullDate: '__batch__',
    inMonth: false,
    shift: '',
    color: '',
    isBatch: true,
    batchLabel: label || '批量',
    batchOn: !!on
  });
  // 当月无排班时，在批量按钮右侧再加一个“导入”格
  if (showImport) {
    list.push({
      day: '',
      fullDate: '__import__',
      inMonth: false,
      shift: '',
      color: '',
      isImport: true,
      importLabel: '导入'
    });
  }
  return list;
}
module.exports = { getMonthGrid, fmtDate, getToday, withBatchCell };
