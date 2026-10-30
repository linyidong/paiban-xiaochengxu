// 导入预览月份归一化：把预览日期重写到目标月份（保留“日”），
// 丢弃目标月不存在的日期（如 11-31、2-30），并按“日”去重，最多保留该月天数。
function normalizePreviewToMonth(preview, targetMonth) {
  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    return { preview: preview, dropped: 0, rewritten: false };
  }
  const y = Number(targetMonth.slice(0, 4));
  const m = Number(targetMonth.slice(5, 7));
  const maxDay = new Date(y, m, 0).getDate();
  let dropped = 0;
  let rewritten = false;
  const out = (preview || []).map(function (p) {
    const byDay = {};
    (p.rows || []).forEach(function (r) {
      const day = parseInt(String(r.date || '').slice(8, 10), 10);
      if (!day || day > maxDay) { dropped += 1; return; }
      const nd = targetMonth + '-' + String(day).padStart(2, '0');
      if (nd !== r.date) rewritten = true;
      if (byDay[day]) dropped += 1; // 同一天重复，后出现的覆盖前一条
      byDay[day] = Object.assign({}, r, { date: nd });
    });
    const rows = Object.keys(byDay)
      .map(Number)
      .sort(function (a, b) { return a - b; })
      .map(function (d) { return byDay[d]; });
    return Object.assign({}, p, { rows: rows });
  });
  return { preview: out, dropped: dropped, rewritten: rewritten };
}

module.exports = { normalizePreviewToMonth };
