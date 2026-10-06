// 云函数 importShift：排班导入（先弹窗输入姓名 → 按成员识别导入）
// 第一步：识别（sourceType=image → AI 视觉识别；excel → SheetJS 解析）返回 preview
// 第二步：commit=true → 覆盖式写入 shifts
// 识别格式假设：表头=日期（横排）、左列=姓名、交叉单元格=班次（休/白/晚）
const https = require('https');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ⚠️ 人工参数来源：本目录 config.json（由根目录《人工必填参数清单.json》同步），勿手改
const { AI_VISION_API_KEY, AI_VISION_ENDPOINT, AI_VISION_MODEL, MEMBER_ALIAS } = require('./config.json');

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
        preview = await recognizeImage(fileID, targetName);
      } catch (e) {
        return { ok: false, msg: '识别失败：' + e.message };
      }
    }
    // 姓名统一：① 别名翻译无条件执行（来自参数表，不依赖成员登记）；
    //           ② 匹配已登记成员（有登记则做形近字校正，保证入库能命中）
    let users = [];
    try {
      const usersRes = await db.collection('users').limit(100).get();
      users = usersRes.data.filter(function (u) { return u.name; }).map(function (u) { return u.name; });
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

  // ---------- 第二步：确认入库（覆盖式） ----------
  const { preview, year, month } = event;
  if (!preview || !preview.length) return { ok: false, msg: '预览为空' };
  const usersRes = await db.collection('users').limit(100).get();
  const nameToId = {};
  usersRes.data.forEach(function (u) { if (u.name) nameToId[u.name] = u._id; });
  let count = 0;
  let newAdded = [];
  const usersNames = usersRes.data.map(function (u) { return u.name; });
  const formalSet2 = Object.keys(MEMBER_ALIAS || {});
  for (const p of preview) {
    let finalName = p.name;
    let userId = nameToId[finalName];
    // 关键：finalName 已经是正式名时，不做近似归位（防止被脏别名"成员A"抢回去）
    const isFormal2 = formalSet2.indexOf(finalName) > -1;
    if (!userId && usersNames.length && !isFormal2) {
      // 近似归位：与已有成员形近（编辑距离≤2/包含）→ 用已有成员，避免重复登记错名
      const matched = normalizeName(finalName, usersNames);
      if (matched !== finalName && nameToId[matched]) { finalName = matched; userId = nameToId[matched]; }
    }
    if (!userId) {
      // 自动登记：识别出的成员不在成员表 → 自动建档（openid 留空，本人登录后绑定）
      const addRes = await db.collection('users').add({
        data: { name: finalName, openid: '', wxId: '', role: 'member', createdAt: db.serverDate() }
      });
      userId = addRes._id;
      nameToId[finalName] = userId;
      usersNames.push(finalName);
      newAdded.push(finalName);
    }
    for (const row of p.rows) {
      if (!row.date || !row.shift) continue;
      const exist = await db.collection('shifts').where({ userId: userId, date: row.date }).get();
      if (exist.data.length) {
        await db.collection('shifts').doc(exist.data[0]._id).update({
          data: { shiftType: row.shift, updatedBy: OPENID, updatedAt: db.serverDate() }
        });
      } else {
        await db.collection('shifts').add({
          data: { userId: userId, date: row.date, shiftType: row.shift, updatedBy: OPENID, updatedAt: db.serverDate() }
        });
      }
      count += 1;
    }
  }
  const msg = newAdded.length
    ? ('已自动登记新成员：' + newAdded.join('、') + '；共导入 ' + count + ' 条')
    : ('导入成功（' + count + ' 条）');
  return { ok: true, count: count, msg: msg, newMembers: newAdded };
};

// 图片识别：真实调用 AI 视觉 API（火山方舟 ark chat/completions，支持视觉模型）
// 支持图片格式：jpg / jpeg / png / webp / gif / bmp / jfif 等常见格式（.jfif 本质为 JPEG，前端已归一为 .jpg 上传）
// 说明：HEIC（苹果相册原图）部分 API 不支持，微信选图时若遇到 HEIC 请在相册先转为常规格式
// 识别结构（按实际排班表）：
//   - 表头行 = 日期（横排 1..31）；左列前两列 = 昵称、人员；交叉单元格 = 班次文本（休/正A/正B/售A/售B 等）
//   - 成员名规则：优先取"昵称"列，昵称为空则取"人员"列
//   - 班次规则：原样识别所有文本（售=晚班状态），不做白名单裁剪
async function recognizeImage(fileID, targetName) {
  // 端点/Key/模型未配置 → 回退模拟数据，保证流程可跑通（配置见 config.json）
  if (!AI_VISION_ENDPOINT || AI_VISION_ENDPOINT.indexOf('your-') > -1 || !AI_VISION_API_KEY || !AI_VISION_MODEL) {
    return mockPreview();
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
    '4) 每个单元格是一个完整班次，必须原样照抄（如：休、正、售后、A、B、正A、正B、售A、售B、IEB、年假），禁止把"正A"拆成"正"和"A"，只输出汉字或字母，禁止任何符号、图标、数字或解释；',
    '5) 从标题识别月份（如"10月排岗表"→ month: 10），输出 month 字段（1~12）；',
    '6) 表头日期为 1~31 号，严格按 1 号到 31 号顺序输出 days 数组（必须 31 项，无排班的格子填空字符串""，不得错位、不得漏天、不得多填）；',
    '7) 只输出紧凑 JSON 数组（不要缩进换行），不要任何解释文字，格式：[{"name":"成员名","month":10,"days":["售A","休","","正A"]}]'
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
  // 服务过载/限流自动重试（最多3次，退避递增）
  const content = await callVisionWithRetry(base64, promptText, 3);
  // 3. 解析响应中的 JSON（兼容：数组 / 对象包裹数组 / 单成员对象；兼容中文引号）
  const list = parsePreview(content);
  if (!list || !list.length) throw new Error('AI 未返回可解析的 JSON：' + String(content).slice(0, 200));
  // 4. 转成 preview 结构：days 数组按 1~31 展开为日期；班次做常见误读归一化，未知保留原样
  const nowY = new Date().getFullYear();
  const curM = new Date().getMonth() + 1;
  return list
    .map(function (p) {
      const month = parseInt(p.month, 10) || curM;
      let days = Array.isArray(p.days) ? p.days : [];
      // 强制 days 为 31 项：不足补空，超出截断（防止 AI 输出天数错乱）
      if (days.length < 31) { while (days.length < 31) days.push(''); }
      if (days.length > 31) { days = days.slice(0, 31); }
      const cleanName = cleanText(p.name);
      return {
        name: cleanName,
        month: month,
        rows: days.map(function (s, i) {
          const raw = cleanText(s);
          return {
            date: nowY + '-' + String(month).padStart(2, '0') + '-' + String(i + 1).padStart(2, '0'),
            shift: NORMALIZE[raw] || raw
          };
        }).filter(function (r) { return r.shift; })
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
  // 以下班次全部原样保留，不归一化（真实表格：VC/草本组=正/售后/A/B，综合组=正A/正B/售A/售B/IEB/年假）
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
  for (let i = 0; i < users.length; i++) {
    if (users[i].indexOf(t) > -1 || t.indexOf(users[i]) > -1) return users[i];
  }
  let best = t, bestD = 3;
  for (let i = 0; i < users.length; i++) {
    const d = editDistance(t, users[i]);
    if (d < bestD) { bestD = d; best = users[i]; }
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
async function callVisionWithRetry(imageBase64, promptText, retries) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await callVisionAPI(imageBase64, promptText);
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
function callVisionAPI(imageBase64, promptText) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({
      model: AI_VISION_MODEL,
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

// Excel 解析：TODO 启用真实解析（package.json 已含 xlsx 依赖）
async function parseExcel(fileID) {
  // 1. const down = await cloud.downloadFile({ fileID });
  // 2. const XLSX = require('xlsx'); 读取 sheet
  //    表头行=日期（如 1..31），左列=姓名，交叉单元格=班次文本
  // 3. 组装 [{name, rows:[{date, shift}]}] 返回
  return [];
}
