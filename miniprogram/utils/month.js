// 导入预览月份归一化：把预览日期重写到目标月份（保留“日”），丢弃目标月不存在的日期。
// 用途：截图识别出 2025-12（31 天），用户选择 2026-11（30 天）时，11-31 不应存在。
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
    const rows = (p.rows || []).map(function (r) {
      const day = parseInt(String(r.date || '').slice(8, 10), 10);
      if (!day || day > maxDay) { dropped += 1; return null; }
      const nd = targetMonth + '-' + String(day).padStart(2, '0');
      if (nd !== r.date) rewritten = true;
      return Object.assign({}, r, { date: nd });
    }).filter(Boolean);
    return Object.assign({}, p, { rows: rows });
  });
  return { preview: out, dropped: dropped, rewritten: rewritten };
}

module.exports = { normalizePreviewToMonth };
