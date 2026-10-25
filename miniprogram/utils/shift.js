// 班次常量与样式（参数来源：人工必填参数清单.json → miniprogram/config.js，由《同步参数.bat》分发）
// ⚠️ 勿在此直接改颜色/班次数值，改清单后运行同步脚本
const cfg = require('../config.js');
const SHIFT_TYPES = cfg.SHIFT_TYPES || ['休', '正A', '正B', '售A', '售B'];
const SHIFT_COLOR = cfg.SHIFT_COLOR || {};
const SHIFT_LABEL = { '休': '休息' };
const MEMBER_ALIAS = cfg.MEMBER_ALIAS || {};
// 两套手动排班状态：基础 4 状态 / 细分 6 状态
const BASIC_SHIFTS = cfg.BASIC_SHIFTS || ['休', '白班', '晚班', '年假'];
const SPECIAL_SHIFTS = cfg.SPECIAL_SHIFTS || ['休', '正A', '正B', '售A', '售B', '年假'];
const SPECIAL_ONLY = SPECIAL_SHIFTS.filter(function (t) { return BASIC_SHIFTS.indexOf(t) === -1; });
// “取消”是清空动作，不是班次；单独追加，避免写进数据库
const CANCEL = '取消';
// 取班次颜色（未配置的班次显示灰色兜底）
function getShiftColor(type) {
  return SHIFT_COLOR[type] || '#9CA3AF';
}
// 班次选项：
// - mode: basic(4 状态) / special(6 状态)
// - usedTypes: 该成员本月实际出现过的班次（可选追加，保证能编辑历史数据）
// - includeUsed: 管理员自己的日历传 false，严格只有 4 状态
function getShiftOptions(mode, usedTypes, includeUsed) {
  const base = (mode === 'special' ? SPECIAL_SHIFTS : BASIC_SHIFTS).slice();
  const list = base.slice();
  // 4 状态严格只给 4 项；6 状态可追加该成员本月已出现的其他班次（如 正/售后/A/B）
  if (mode === 'special' && includeUsed) {
    (usedTypes || []).forEach(function (t) {
      if (t && t !== CANCEL && list.indexOf(t) === -1) list.push(t);
    });
  }
  list.push(CANCEL);
  return list.map(function (t) { return { type: t, color: SHIFT_COLOR[t] || '#9CA3AF' }; });
}
// 默认状态模式：管理员固定 4 状态；成员只要出现“非基础 4 状态”的班次，就默认 6 状态
function detectShiftMode(usedTypes, isAdmin) {
  if (isAdmin) return 'basic';
  const used = usedTypes || [];
  const hasNonBasic = used.some(function (t) {
    return t && t !== CANCEL && BASIC_SHIFTS.indexOf(t) === -1;
  });
  return hasNonBasic ? 'special' : 'basic';
}
// 取成员显示名（优先用别名表中的第一个昵称，否则用正式名）
function getDisplayName(formalName) {
  if (!formalName || !MEMBER_ALIAS) return formalName;
  for (const formal in MEMBER_ALIAS) {
    if (formal === formalName) {
      const aliases = MEMBER_ALIAS[formal];
      return (aliases && aliases.length) ? aliases[0] : formal;
    }
  }
  return formalName;
}
module.exports = {
  SHIFT_TYPES, SHIFT_COLOR, SHIFT_LABEL, MEMBER_ALIAS,
  BASIC_SHIFTS, SPECIAL_SHIFTS, SPECIAL_ONLY, CANCEL,
  getShiftColor, getShiftOptions, detectShiftMode, getDisplayName
};
