// 日历工具：生成某月网格（周一~周日，含上月/下月补位）
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
module.exports = { getMonthGrid, fmtDate, getToday };
