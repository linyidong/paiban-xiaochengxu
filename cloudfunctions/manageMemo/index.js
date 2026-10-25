// 云函数 manageMemo：个人备忘录 add / update / remove / list
// 年份规则：文本含“YYYY年”则用该年；否则用当前年；旧数据无 year 字段时回退 createdAt 的年份
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function pad2(n) { return n < 10 ? '0' + n : String(n); }

// 从文本解析年份（支持“2026年10月1号”），非法/缺省时返回当前年
function parseYear(text) {
  const m = String(text || '').match(/(20\d{2})\s*年/);
  if (m) {
    const y = parseInt(m[1], 10);
    if (y >= 2000 && y <= 2100) return y;
  }
  return new Date().getFullYear();
}

// 兼容旧数据：无 year 字段时用 createdAt 的年份
function yearOf(memo) {
  if (typeof memo.year === 'number' && memo.year >= 2000) return memo.year;
  const d = memo.createdAt;
  if (d instanceof Date) return d.getFullYear();
  if (typeof d === 'string') {
    const y = parseInt(d.slice(0, 4), 10);
    if (y >= 2000 && y <= 2100) return y;
  }
  return 0;
}

// 统一时间展示，避免依赖运行环境的 locale 差异
function formatTime(d) {
  if (d instanceof Date) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  if (typeof d === 'string') return d.replace('T', ' ').slice(0, 16);
  return '';
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '未登录' };

  const { action } = event;

  if (action === 'list') {
    const res = await db.collection('memos')
      .where({ openid: OPENID })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    return {
      ok: true,
      memos: res.data.map(function (m) {
        return { _id: m._id, text: m.text, year: yearOf(m), createdAtStr: formatTime(m.createdAt) };
      })
    };
  }

  if (action === 'add') {
    const text = (event.text || '').trim();
    if (!text) return { ok: false, msg: '内容为空' };
    const year = parseYear(text);
    await db.collection('memos').add({
      data: { openid: OPENID, text: text, year: year, createdAt: db.serverDate() }
    });
    return { ok: true, year: year };
  }

  if (action === 'update') {
    const id = event.id;
    const text = (event.text || '').trim();
    if (!id) return { ok: false, msg: '缺少id' };
    if (!text) return { ok: false, msg: '内容为空' };
    // 只能修改自己的备忘录
    const target = await db.collection('memos').doc(id).get().catch(function () { return { data: null }; });
    if (!target.data) return { ok: false, msg: '备忘录不存在' };
    if (target.data.openid !== OPENID) return { ok: false, msg: '无权限修改' };
    await db.collection('memos').doc(id).update({ data: { text: text, year: parseYear(text) } });
    return { ok: true, year: parseYear(text) };
  }

  if (action === 'remove') {
    const id = event.id;
    if (!id) return { ok: false, msg: '缺少id' };
    // 只能删除自己的备忘录
    const target = await db.collection('memos').doc(id).get().catch(function () { return { data: null }; });
    if (!target.data) return { ok: false, msg: '备忘录不存在' };
    if (target.data.openid !== OPENID) return { ok: false, msg: '无权限删除' };
    await db.collection('memos').doc(id).remove();
    return { ok: true };
  }

  return { ok: false, msg: '未知操作' };
};
