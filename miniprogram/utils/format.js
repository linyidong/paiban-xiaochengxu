// 格式化工具
function fmtMonthCn(year, month) {
  return year + '年' + month + '月';
}
function maskName(name) {
  if (!name) return '';
  if (name.length <= 1) return name;
  return name[0] + '**';
}
module.exports = { fmtMonthCn, maskName };
