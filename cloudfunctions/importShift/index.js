// 云函数 importShift：排班导入（先弹窗输入姓名 → 按成员识别导入）
// 第一步：识别（sourceType=image → AI 视觉识别；excel → SheetJS 解析）返回 preview
// 第二步：commit=true → 按“成员 + 月份”全量替换（新增/更新/清空）
// 权限：成员只能导入自己；管理员可导入任意成员（整表在 T-009 开放）
const https = require('https');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ⚠️ 人工参数来源：本目录 config.json（由根目录《人工必填参数清单.json》同步），勿手改
const { AI_VISION_API_KEY, AI_VISION_ENDPOINT, AI_VISION_MODEL, AI_VISION_FALLBACK_MODEL, MEMBER_ALIAS, ADMIN_OPENIDS } = require('./config.json');

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  if (m < 1 || m > 12) return 0;
  return m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m];
}

// 校验 YYYY-MM-DD 是否存在（含闰年）
function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const max = daysInMonth(y, m);
  return max > 0 && d >= 1 && d <= max;
}

// 视觉识别是否已配置（缺 Key/端点/模型时必须报错，禁止回退假数据）
function isVisionConfigured(apiKey, endpoint, model) {
  return !!(apiKey && model && endpoint && endpoint.indexOf('your-') === -1);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '未登录' };

  // ---------- 第一步：识别（不落库） ----------
  if (!event.commit) {
    const { fileID, sourceType, targetName } = event;
    if (!fileID) return { ok: false, msg: '缺少文件' };
    let preview = [];
    if (sourceType === 'excel') {
      preview = await parseExcel(fileID);
    } else {
      try {
        preview = await recognizeImage(fileID, targetName, event.year, event.month);
      } catch (e) {
        return { ok: false, msg: '识别失败：' + e.message };
      }
    }
    // 姓名统一：① 别名翻译无条件执行（来自参数表，不依赖成员登记）；
    //           ② 匹配已登记成员（有登记则做形近字校正，保证入库能命中）
    let users = [];
    try {
      const usersRes = await db.collection('users').limit(100).get();
      users = usersRes.data.filter(function (u) { return u.name && !u.isDeleted; }).map(function (u) { return u.name; });
    } catch (e) { /* users 查询失败不阻塞识别 */ }
    const formalNames = Object.keys(MEMBER_ALIAS || {}).concat(users);
    const formalSet = Object.keys(MEMBER_ALIAS || {});
    preview = preview.map(function (p) {
      let t = translateAlias(p.name);
      t = surnameFallback(t, formalNames);
      // 关键：t 已经是正式名（别名表的标准名）时，不再做近似校正
      // 防止 users 表里的脏别名（如"成员A"）把正式名"成员A"又改回去
      const isFormal = formalSet.indexOf(t) > -1;
      return { name: (users.length && !isFormal) ? normalizeName(t, users) : t, month: p.month, rows: p.rows };
    });
    // 翻译/校正后同名合并去重（防止 AI 把同一人拆成多行，如"成员A"×3 → 成员A×1）
    const merged = {};
    preview.forEach(function (p) {
      if (!p.name) return;
      if (merged[p.name]) { merged[p.name].rows = merged[p.name].rows.concat(p.rows); }
      else { merged[p.name] = { name: p.name, month: p.month, rows: p.rows }; }
    });
    preview = Object.keys(merged).map(function (k) { return merged[k]; });
    // 按导入对象过滤：输入姓名 → 只取该成员的排班；填"全部"/留空 → 整表
    if (targetName && targetName.trim() !== '全部') {
      const allNames = preview.map(function (p) { return p.name; });
      const t = translateAlias(targetName.trim());
      preview = preview.filter(function (p) { return p.name === t || p.name.indexOf(t) > -1 || t.indexOf(p.name) > -1; });
      if (!preview.length) {
        const hint = allNames.length ? '本表识别到成员：' + allNames.join('、') : '本表未识别到任何成员（图片过模糊或未识别出）';
        return { ok: false, msg: '未识别到「' + t + '」的排班。' + hint, preview: preview };
      }
    }
    if (!preview.length) return { ok: false, msg: '未识别到排班内容，请检查图片/表格格式', preview: preview };
    return { ok: true, preview: preview };
  }

  // ---------- 第二步：确认入库（按成员 + 月份全量替换） ----------
  const { preview } = event;
  const eventYear = parseInt(event.year, 10) || 0;
  const eventMonth = parseInt(event.month, 10) || 0;
  if (!preview || !preview.length) return { ok: false, msg: '预览为空' };
  if (preview.length > 100) return { ok: false, msg: '一次最多导入 100 位成员' };
  const usersRes = await db.collection('users').limit(100).get();
  // 软删除成员不参与匹配/自动登记；同名已删除成员必须由管理员先恢复
  const activeUsers = usersRes.data.filter(function (u) { return !u.isDeleted; });
  const deletedNames = {};
  usersRes.data.forEach(function (u) { if (u.isDeleted && u.name) deletedNames[u.name] = true; });
  for (const p of preview) {
    const raw = translateAlias(p.name || '');
    if (deletedNames[p.name] || deletedNames[raw]) {
      return { ok: false, msg: '成员「' + (p.name || raw) + '」已删除，请先恢复' };
    }
  }

  // 调用者身份：成员只能导入自己，管理员可导入任意成员
  const meRes = await db.collection('users').where({ openid: OPENID }).get();
  const me = meRes.data.filter(function (u) { return !u.isDeleted; })[0];
  if (!me) return { ok: false, msg: '用户不存在，请先登录' };
  const cleanMe = String(OPENID || '').replace(/[^a-zA-Z0-9]/g, '');
  const adminList = (ADMIN_OPENIDS || []).map(function (s) { return String(s || '').replace(/[^a-zA-Z0-9]/g, ''); });
  const isAdmin = adminList.indexOf(cleanMe) > -1 || me.role === 'admin';

  const nameToId = {};
  activeUsers.forEach(function (u) { if (u.name) nameToId[u.name] = u._id; });
  const usersNames = activeUsers.map(function (u) { return u.name; });
  const formalSet2 = Object.keys(MEMBER_ALIAS || {});

  let monthRewritten = false;
  // 先整体校验（姓名/权限/月份/日期），全部通过后再写库，避免部分写入
  const plans = [];
  for (const p of preview) {
    if (!p.rows || !p.rows.length) continue;
    const rawName = translateAlias(p.name || '');
    let finalName;
    let userId;
    if (!isAdmin) {
      // 成员导入：先按原文（别名翻译后）精确比对本人，命中后强制锁定本人；
      // 不做形近归位，避免把他人的表静默写到自己名下
      if (rawName !== me.name) return { ok: false, msg: '只能导入自己的排班' };
      finalName = me.name;
      userId = me._id;
    } else {
      finalName = p.name;
      userId = nameToId[finalName];
      // 关键：finalName 已经是正式名时，不做近似归位（防止被脏别名"成员A"抢回去）
      const isFormal2 = formalSet2.indexOf(finalName) > -1;
      if (!userId && usersNames.length && !isFormal2) {
        // 近似归位：与已有成员形近（编辑距离≤2/包含）→ 用已有成员，避免重复登记错名
        const matched = normalizeName(finalName, usersNames);
        if (matched !== finalName && nameToId[matched]) { finalName = matched; userId = nameToId[matched]; }
      }
    }
    const allRows = p.rows.filter(function (r) { return r.date; });
    if (!allRows.length) continue;
    let monthKey = allRows[0].date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return { ok: false, msg: '日期格式不合法：' + allRows[0].date };
    for (const r of allRows) {
      if (r.date.slice(0, 7) !== monthKey) {
        return { ok: false, msg: '预览包含多个月份，请重新识别或按月份分别导入' };
      }
      if (!isValidDate(r.date)) return { ok: false, msg: '日期不合法：' + r.date };
    }
    if (eventYear && eventMonth) {
      const want = eventYear + '-' + String(eventMonth).padStart(2, '0');
      if (monthKey !== want) {
        // 用户已在导入页显式选择目标月份 → 以所选月份为准。
        // 不再要求 overrideMonth：兼容 1.2.x 旧客户端（它们会选月份但不带该标记）。
        // 只保留「日」，把年月重写到目标月，并校验当月天数（2 月/30 天月会自动拦住 31 号）
        const maxDay = daysInMonth(eventYear, eventMonth);
        for (const r of allRows) {
          const day = parseInt(r.date.slice(8, 10), 10);
          if (!day || day > maxDay) {
            return {
              ok: false,
              msg: '截图里的日期 ' + r.date + ' 无法落到 ' + want + '（该月只有 ' + maxDay + ' 天），请先在校对区改掉'
            };
          }
          r.date = want + '-' + String(day).padStart(2, '0');
        }
        monthKey = want;
        monthRewritten = true;
      }
    }
    // “取消”是清空动作：不写入班次，但该日期仍属于本月替换范围
    const rows = allRows.filter(function (r) { return r.shift && r.shift !== '取消' && r.shift !== 'IEB'; });
    plans.push({ name: finalName, userId: userId, rows: rows, monthKey: monthKey });
  }
  if (!plans.length) return { ok: false, msg: '预览为空' };

  let added = 0;
  let updated = 0;
  let removed = 0;
  const newAdded = [];
  for (const plan of plans) {
    let userId = plan.userId;
    if (!userId) {
      // 自动登记：识别出的成员不在成员表 → 自动建档（openid 留空，本人登录后绑定）
      const addRes = await db.collection('users').add({
        data: { name: plan.name, openid: '', wxId: '', role: 'member', createdAt: db.serverDate() }
      });
      userId = addRes._id;
      nameToId[plan.name] = userId;
      usersNames.push(plan.name);
      newAdded.push(plan.name);
    }

    // 该成员该月已有记录（按日期分组，兼容历史重复记录）
    const monthStart = plan.monthKey + '-01';
    const monthEnd = plan.monthKey + '-31';
    const existRes = await db.collection('shifts')
      .where({ userId: userId, date: _.gte(monthStart).and(_.lte(monthEnd)) })
      .get();
    const byDate = {};
    existRes.data.forEach(function (s) {
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    });

    const newDates = {};
    for (const row of plan.rows) {
      newDates[row.date] = true;
      const list = byDate[row.date] || [];
      if (list.length) {
        // 同一天有多条历史记录时保留一条，其余删除
        await db.collection('shifts').doc(list[0]._id).update({
          data: { shiftType: row.shift, updatedBy: OPENID, updatedAt: db.serverDate() }
        });
        for (let i = 1; i < list.length; i++) {
          await db.collection('shifts').doc(list[i]._id).remove();
          removed += 1;
        }
        updated += 1;
      } else {
        await db.collection('shifts').add({
          data: { userId: userId, date: row.date, shiftType: row.shift, updatedBy: OPENID, updatedAt: db.serverDate() }
        });
        added += 1;
      }
    }

    // 全量替换：删除该月未出现在新表中的旧记录
    for (const d of Object.keys(byDate)) {
      if (newDates[d]) continue;
      for (const s of byDate[d]) {
        await db.collection('shifts').doc(s._id).remove();
        removed += 1;
      }
    }
  }

  const count = added + updated;
  const summary = '新增 ' + added + '、更新 ' + updated + '、清空 ' + removed;
  const msg = newAdded.length
    ? ('已自动登记新成员：' + newAdded.join('、') + '；' + summary)
    : ('导入完成：' + summary);
  return {
    ok: true,
    count: count,
    added: added,
    updated: updated,
    removed: removed,
    monthRewritten: monthRewritten,
    msg: msg,
    newMembers: newAdded
  };
};

// 图片识别：真实调用 AI 视觉 API（火山方舟 ark chat/completions，支持视觉模型）
// 支持图片格式：jpg / jpeg / png / webp / gif / bmp / jfif 等常见格式（.jfif 本质为 JPEG，前端已归一为 .jpg 上传）
// 说明：HEIC（苹果相册原图）部分 API 不支持，微信选图时若遇到 HEIC 请在相册先转为常规格式
// 识别结构（按实际排班表）：
//   - 表头行 = 日期（横排 1..31）；左列前两列 = 昵称、人员；交叉单元格 = 班次文本（休/正A/正B/售A/售B 等）
//   - 成员名规则：优先取"昵称"列，昵称为空则取"人员"列
//   - 班次规则：原样识别所有文本（售=晚班状态），不做白名单裁剪
// 读取管理员在“设置”里保存的模型（settings/ai）；读取失败则回退 config 默认值
async function getModelSettings() {
  let primaryModel = AI_VISION_MODEL;
  let fallbackModel = AI_VISION_FALLBACK_MODEL || '';
  try {
    const r = await db.collection('settings').doc('ai').get();
    const d = r.data || {};
    if (d.primaryModel) primaryModel = d.primaryModel;
    if (d.fallbackModel !== undefined) fallbackModel = d.fallbackModel || '';
  } catch (e) { /* settings 未创建/读取失败：用 config 默认 */ }
  return { primaryModel: primaryModel, fallbackModel: fallbackModel };
}

// 模型候选：主模型优先，备用模型去重后追加
function modelCandidates(primaryModel, fallbackModel) {
  const list = [];
  [primaryModel, fallbackModel].forEach(function (m) {
    const v = String(m || '').trim();
    if (v && list.indexOf(v) === -1) list.push(v);
  });
  return list;
}

async function recognizeImage(fileID, targetName, yearOverride, monthOverride) {
  // 端点/Key/模型未配置 → 直接报错（禁止回退假数据，避免污染排班）
  const modelCfg = await getModelSettings();
  const candidates = modelCandidates(modelCfg.primaryModel, modelCfg.fallbackModel);
  if (!candidates.length || !isVisionConfigured(AI_VISION_API_KEY, AI_VISION_ENDPOINT, candidates[0])) {
    throw new Error('识别服务未配置（API Key/端点/模型），请联系管理员');
  }
  // 1. 下载图片
  const down = await cloud.downloadFile({ fileID });
  const base64 = Buffer.from(down.fileContent).toString('base64');
  // 2. 调用视觉 API
  const promptLines = [
    '你是排班表识别助手。识别图片中的排班表格：',
    '1) 只识别表格主体区域：表头日期（横排 1~31 号）+ 左侧"分组/昵称/人员"列 + 交叉单元格班次；',
    '2) 忽略表格右侧的"小提示"说明区域，不要读取任何说明文字；',
    '3) 成员名优先取"昵称"列，昵称为空则取"人员"列；姓名只输出汉字，不要输出任何符号或字母；',
    '4) 每个单元格是一个完整班次，必须原样照抄（如：休、正、售后、A、B、正A、正B、售A、售B、年假），禁止把"正A"拆成"正"和"A"，只输出汉字或字母，禁止任何符号、图标、数字或解释；',
    '5) 从标题识别年份与月份（如"2025年12月排岗表"→ year:2025, month:12）；标题没有年份时 year 输出当前年份；month 输出 1~12；',
    '6) 按当月实际天数输出 days 数组（如 2 月 28/29 项、4 月 30 项），无排班的格子填空字符串""，不得错位、不得漏天；',
    '7) 只输出紧凑 JSON 数组（不要缩进换行），不要任何解释文字，格式：[{"name":"成员名","year":2025,"month":10,"days":["售A","休","","正A"]}]'
  ];
  // 关键：如果指定了目标成员，只锁定那一行，忽略其他所有人（防止串列/错乱）
  if (targetName && targetName.trim() && targetName.trim() !== '全部') {
    const tn = targetName.trim();
    const formal = translateAlias(tn);
    if (formal !== tn) {
      promptLines.push('⚠️ 极其重要：只识别昵称为「' + tn + '」（人员名「' + formal + '」）的这一行，忽略表格中其他所有成员的行。只输出这一个人的数据。');
    } else {
      promptLines.push('⚠️ 极其重要：只识别「' + tn + '」这一行（昵称或人员名匹配即可），忽略表格中其他所有成员的行。只输出这一个人的数据。');
    }
  }
  const promptText = promptLines.join('');
  // 服务过载/限流自动重试（最多3次，退避递增）；主模型失败后自动尝试备用模型
  let content = '';
  let lastErr = null;
  for (let mi = 0; mi < candidates.length; mi++) {
    try {
      content = await callVisionWithRetry(base64, promptText, 3, candidates[mi]);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw new Error('主/备模型均识别失败：' + lastErr.message);
  // 3. 解析响应中的 JSON（兼容：数组 / 对象包裹数组 / 单成员对象；兼容中文引号）
  const list = parsePreview(content);
  if (!list || !list.length) throw new Error('AI 未返回可解析的 JSON：' + String(content).slice(0, 200));
  // 4. 转成 preview 结构：days 按当月天数展开为日期；班次做常见误读归一化
  const nowY = new Date().getFullYear();
  const curM = new Date().getMonth() + 1;
  const yOverride = parseInt(yearOverride, 10) || 0;
  const mOverride = parseInt(monthOverride, 10) || 0;
  return list
    .map(function (p) {
      let year = parseInt(p.year, 10) || yOverride || nowY;
      if (year < 2000 || year > 2100) year = yOverride || nowY;
      let month = mOverride || parseInt(p.month, 10) || curM;
      if (month < 1 || month > 12) month = curM;
      let days = Array.isArray(p.days) ? p.days : [];
      // 按当月实际天数补空/截断，避免写入 2 月 30、31 日之类非法日期
      const maxDay = daysInMonth(year, month);
      if (days.length < maxDay) { while (days.length < maxDay) days.push(''); }
      if (days.length > maxDay) { days = days.slice(0, maxDay); }
      const cleanName = cleanText(p.name);
      return {
        name: cleanName,
        year: year,
        month: month,
        rows: days.map(function (s, i) {
          const raw = cleanText(s);
          return {
            date: year + '-' + String(month).padStart(2, '0') + '-' + String(i + 1).padStart(2, '0'),
            shift: NORMALIZE[raw] || raw
          };
        }).filter(function (r) { return r.shift && r.shift !== 'IEB'; })
      };
    })
    .filter(function (p) { return p.name && p.rows.length; });
}

// 清理识别文本中的乱码/特殊符号（白名单：只保留中文、字母、数字，其他一律过滤）
function cleanText(s) {
  return String(s || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').trim();
}

// 常见误读归一化：识别文本 → 标准班次（售A 常被读成"售后"、正A 被读成"正"/"A"等）；未列出则保留原样
const NORMALIZE = {
  '休': '休', '休息': '休', '休班': '休',
  // 以下班次全部原样保留，不归一化（真实表格：VC/草本组=正/售后/A/B，综合组=正A/正B/售A/售B/年假）
  '正': '正', '售后': '售后', 'A': 'A', 'B': 'B',
  '正A': '正A', '正B': '正B', '售A': '售A', '售B': '售B',
  'IEB': 'IEB', '年假': '年假',
  // 空占位符 → 空字符串（过滤掉）
  '': '', '无': '', '·': '', '-': '', '—': ''
};

// 健壮解析：优先提取数组；其次对象（results/data 包裹的数组、或单成员 {name,shifts}）；兼容中文引号
function parsePreview(content) {
  let text = String(content || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
  let m = text.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) return arr;
    } catch (e) {}
  }
  m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      if (Array.isArray(obj.results)) return obj.results;
      if (Array.isArray(obj.data)) return obj.data;
      if (obj.name && obj.shifts) return [obj];
    } catch (e) {}
  }
  return null;
}

// 别名翻译：把昵称/人员名等所有叫法统一到正式名（映射表来自人工必填参数清单）
// 例：MEMBER_ALIAS = {"成员A": ["成员A", "别名A"], "成员B": ["成员B"]} → 成员A/别名A → 成员A
function translateAlias(name) {
  const t = String(name || '').trim();
  if (!t) return t;
  if (!MEMBER_ALIAS) return t;
  for (const formal in MEMBER_ALIAS) {
    if (t === formal) return formal;
    const list = MEMBER_ALIAS[formal] || [];
    if (list.indexOf(t) > -1) return formal;
  }
  return t;
}

// 姓氏兜底：识别名与某个正式名同姓、且该姓在正式名集合中唯一 → 归位（如"成员A"→"成员A"）
function surnameFallback(name, formalNames) {
  const t = String(name || '').trim();
  if (!t || !formalNames || !formalNames.length) return t;
  const first = t.charAt(0);
  const same = formalNames.filter(function (f) { return f && f.charAt(0) === first; });
  if (same.length === 1) return same[0];
  return t;
}

// 姓名校正：识别名 → users 正式名（依次尝试：精确 → 包含 → 编辑距离≤2 形近字/漏字）
function normalizeName(name, users) {
  const t = String(name || '').trim();
  if (!t) return t;
  for (let i = 0; i < users.length; i++) { if (users[i] === t) return users[i]; }
  // 单字姓名不做包含/形近归位，避免把“丙”这类新成员映射到“甲”
  if (t.length < 2) return t;
  for (let i = 0; i < users.length; i++) {
    if (!users[i]) continue;
    if (users[i].indexOf(t) > -1 || t.indexOf(users[i]) > -1) return users[i];
  }
  let best = t, bestD = 99;
  for (let i = 0; i < users.length; i++) {
    const c = users[i];
    if (!c || c.length <= 1) continue;
    // 长度差超过 1 不做形近归位；2 字名最多容错 1，3 字及以上最多容错 2
    if (Math.abs(t.length - c.length) > 1) continue;
    const maxD = Math.min(t.length, c.length) >= 3 ? 2 : 1;
    const d = editDistance(t, c);
    if (d <= maxD && d < bestD) { bestD = d; best = c; }
  }
  return bestD <= 2 ? best : t;
}

// 编辑距离（Levenshtein），用于形近字/漏字匹配
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = [];
  for (let i = 0; i <= m; i++) dp[i] = [i];
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

// 带重试的视觉识别调用：服务过载/限流（429/5xx）自动退避重试，其他错误直接抛出
async function callVisionWithRetry(imageBase64, promptText, retries, model) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await callVisionAPI(imageBase64, promptText, model);
    } catch (e) {
      const msg = String(e.message || '');
      const retriable = /overload|too many|rate limit|busy|繁忙|过载|限流|429|503/i.test(msg);
      if (!retriable) throw e;
      if (i >= retries) throw new Error('AI 服务繁忙，已自动重试' + retries + '次仍失败，请稍后再试（RequestId 见上）');
      await new Promise(function (r) { setTimeout(r, i * 3000); }); // 第1次失败等3秒，第2次等6秒
    }
  }
}

// 调用火山方舟 ark chat/completions（Node https 实现，零依赖）
function callVisionAPI(imageBase64, promptText, model) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageBase64 } }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0,
      // 关闭深度思考：该模型思考模式会导致识别超时（60秒上限），实测关闭后从120秒降到36秒
      thinking: { "type": "disabled" }
    });
    let u;
    try { u = new URL(AI_VISION_ENDPOINT); } catch (e) { return reject(new Error('识别端点格式错误，请检查 config')); }
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_VISION_API_KEY,
        'Content-Length': Buffer.byteLength(body)
      }
    }, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          const j = JSON.parse(data);
          if (j.error) return reject(new Error('API 错误：' + (j.error.message || JSON.stringify(j.error))));
          if (!j.choices || !j.choices.length) return reject(new Error('API 无返回内容'));
          resolve(j.choices[0].message.content);
        } catch (e) {
          reject(new Error('API 响应解析失败（HTTP ' + res.statusCode + '）：' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', function (e) { reject(new Error('网络错误：' + e.message)); });
    req.setTimeout(60000, function () { req.destroy(); reject(new Error('识别超时（60秒）')); });
    req.write(body);
    req.end();
  });
}

// 模拟数据（仅当识别服务未配置时回退使用，演示流程用）
function mockPreview() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return [
    { name: '阿辉', rows: [{ date: y + '-' + m + '-01', shift: '正A' }, { date: y + '-' + m + '-02', shift: '售B' }, { date: y + '-' + m + '-03', shift: '休' }] },
    { name: '王小明', rows: [{ date: y + '-' + m + '-01', shift: '售A' }, { date: y + '-' + m + '-02', shift: '正B' }, { date: y + '-' + m + '-03', shift: '休' }] }
  ];
}

// Excel 解析（纯函数部分）：二维表 → preview
// 约定：表头行含 1~31 日期列；左侧前两列为“昵称/人员”；交叉单元格为班次文本
function parseSheetRows(rows, yearOverride, monthOverride) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const now = new Date();
  let year = parseInt(yearOverride, 10) || now.getFullYear();
  let month = parseInt(monthOverride, 10) || now.getMonth() + 1;

  // 从标题行提取“YYYY年M月”或“M月”
  let foundYm = false;
  for (const r of rows) {
    if (foundYm) break;
    for (const cell of r) {
      const s = String(cell == null ? '' : cell);
      const ym = s.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
      if (ym) {
        year = parseInt(ym[1], 10);
        month = parseInt(ym[2], 10);
        foundYm = true;
        break;
      }
      if (!monthOverride) {
        const m = s.match(/^(\d{1,2})\s*月/);
        if (m) {
          const mm = parseInt(m[1], 10);
          if (mm >= 1 && mm <= 12) month = mm;
        }
      }
    }
  }
  if (month < 1 || month > 12) month = now.getMonth() + 1;
  const maxDay = daysInMonth(year, month);

  // 找表头行：至少 5 个 1~31 的日期单元格
  let headerIdx = -1;
  let dayCols = {};
  for (let i = 0; i < rows.length; i++) {
    const map = {};
    (rows[i] || []).forEach(function (cell, idx) {
      const s = String(cell == null ? '' : cell).replace(/\s+/g, '');
      let m = s.match(/^(\d{1,2})\s*[号日]?$/);
      if (!m) m = s.match(/月\s*(\d{1,2})\s*[号日]?$/);
      if (!m) return;
      const d = parseInt(m[1], 10);
      if (d >= 1 && d <= 31) map[idx] = d;
    });
    if (Object.keys(map).length >= 5) { headerIdx = i; dayCols = map; break; }
  }
  if (headerIdx < 0) return [];

  const dateCols = Object.keys(dayCols).map(Number).sort(function (a, b) { return a - b; });
  const firstDateCol = dateCols[0];
  const nameCols = [0, 1].filter(function (c) { return c < firstDateCol; });
  if (!nameCols.length) nameCols.push(0);

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    let name = '';
    for (const c of nameCols) {
      const v = String(r[c] == null ? '' : r[c]).replace(/\s+/g, '').trim();
      if (v && !/^\d+$/.test(v)) { name = v; break; }
    }
    if (!name) continue;
    if (/^(合计|总计|备注|说明|分组)/.test(name)) continue;
    const shiftRows = [];
    for (const c of dateCols) {
      const day = dayCols[c];
      if (day < 1 || day > maxDay) continue;
      const raw = cleanText(r[c]);
      const shift = NORMALIZE[raw] || raw;
      if (!shift || shift === 'IEB') continue;
      shiftRows.push({
        date: year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
        shift: shift
      });
    }
    if (shiftRows.length) out.push({ name: name, year: year, month: month, rows: shiftRows });
  }
  return out;
}

// Excel 解析：下载 xlsx → 取第一个 sheet → parseSheetRows
async function parseExcel(fileID) {
  const XLSX = require('xlsx');
  const down = await cloud.downloadFile({ fileID });
  const wb = XLSX.read(down.fileContent, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  return parseSheetRows(rows);
}

// 暴露纯函数给单元测试（不影响云函数入口）
exports._parseSheetRows = parseSheetRows;
exports._isVisionConfigured = isVisionConfigured;
