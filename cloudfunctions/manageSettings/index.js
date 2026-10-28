// 云函数 manageSettings：管理员读取/保存 AI 模型设置（主/备模型 + 各自 API Key）
// 密钥仅管理员可读；保存后 importShift 读取使用。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ⚠️ 人工参数来源：本目录 config.json（由《同步参数.bat》分发），勿手改
const { ADMIN_OPENIDS, AI_VISION_API_KEY, AI_VISION_MODEL, AI_VISION_FALLBACK_MODEL, AI_VISION_ENDPOINT } = require('./config.json');

function cleanOpenid(s) {
  return String(s || '').replace(/[^a-zA-Z0-9]/g, '');
}

async function checkAdmin(OPENID) {
  const cleanMe = cleanOpenid(OPENID);
  const admins = (ADMIN_OPENIDS || []).map(cleanOpenid);
  if (admins.indexOf(cleanMe) > -1) return true;
  const meRes = await db.collection('users').where({ openid: OPENID }).get();
  const me = meRes.data.filter(function (u) { return !u.isDeleted; })[0];
  return !!(me && me.role === 'admin');
}

async function readSettings() {
  try {
    const r = await db.collection('settings').doc('ai').get();
    return r.data || null;
  } catch (e) {
    return null;
  }
}

function validModel(s) {
  return /^[A-Za-z0-9._:-]{1,100}$/.test(String(s || ''));
}

function validKey(s) {
  const v = String(s || '').trim();
  return v.length >= 8 && v.length <= 300 && !/\s/.test(v);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '未登录' };
  const isAdmin = await checkAdmin(OPENID);
  if (!isAdmin) return { ok: false, msg: '仅管理员可操作' };

  if (event.action === 'get') {
    const d = await readSettings();
    return {
      ok: true,
      primaryModel: (d && d.primaryModel) || AI_VISION_MODEL,
      primaryApiKey: (d && d.primaryApiKey) || AI_VISION_API_KEY,
      fallbackModel: d && d.fallbackModel !== undefined ? d.fallbackModel : (AI_VISION_FALLBACK_MODEL || ''),
      fallbackApiKey: d && d.fallbackApiKey !== undefined ? d.fallbackApiKey : '',
      endpoint: AI_VISION_ENDPOINT,
      source: d ? 'db' : 'config'
    };
  }

  if (event.action === 'save') {
    const primaryModel = String(event.primaryModel || '').trim();
    const primaryApiKey = String(event.primaryApiKey || '').trim();
    const fallbackModel = String(event.fallbackModel || '').trim();
    const fallbackApiKey = String(event.fallbackApiKey || '').trim();
    if (!validModel(primaryModel)) return { ok: false, msg: '主模型格式不正确（1–100 位字母/数字/._:-）' };
    if (!validKey(primaryApiKey)) return { ok: false, msg: '请填写有效的主模型 API Key' };
    if (fallbackModel && !validModel(fallbackModel)) return { ok: false, msg: '备用模型格式不正确（1–100 位字母/数字/._:-）' };
    if (fallbackModel && fallbackModel === primaryModel) return { ok: false, msg: '备用模型不能与主模型相同' };
    if (fallbackApiKey && !validKey(fallbackApiKey)) return { ok: false, msg: '备用模型 API Key 格式不正确' };
    try {
      await db.collection('settings').doc('ai').set({
        data: {
          primaryModel: primaryModel,
          primaryApiKey: primaryApiKey,
          fallbackModel: fallbackModel,
          fallbackApiKey: fallbackApiKey,
          updatedAt: db.serverDate(),
          updatedBy: OPENID
        }
      });
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/not exist|NOT_FOUND|ResourceNotFound/i.test(msg)) {
        return { ok: false, msg: 'settings 集合未创建，请联系管理员在云控制台创建' };
      }
      return { ok: false, msg: '保存失败：' + msg };
    }
    return { ok: true, primaryModel: primaryModel, fallbackModel: fallbackModel };
  }

  return { ok: false, msg: '未知操作' };
};
