// 班次常量与样式（参数来源：人工必填参数清单.json → miniprogram/config.js，由《同步参数.bat》分发）
// ⚠️ 勿在此直接改颜色/班次数值，改清单后运行同步脚本
const cfg = require('../config.js');
const SHIFT_TYPES = cfg.SHIFT_TYPES || ['休', '正A', '正B', '售A', '售B'];
const SHIFT_COLOR = cfg.SHIFT_COLOR || {};
const STYLE = cfg.STYLE || {};
const SHIFT_LABEL = { '休': '休息' };
const MEMBER_ALIAS = cfg.MEMBER_ALIAS || {};
// 取班次颜色（未配置的班次显示灰色兜底）
function getShiftColor(type) {
  return SHIFT_COLOR[type] || '#9CA3AF';
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
module.exports = { SHIFT_TYPES, SHIFT_COLOR, SHIFT_LABEL, STYLE, MEMBER_ALIAS, getShiftColor, getDisplayName };
