// 全局入口：初始化云开发、恢复登录态
// ⚠️ 人工参数来源：miniprogram/config.js（由根目录《人工必填参数清单.json》同步），勿在此直接改参数
const cfg = require('./config.js');
App({
  globalData: {
    openid: '',
    role: 'member', // admin / member
    name: ''
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 以上基础库以使用云能力');
    } else {
      wx.cloud.init({ env: cfg.env, traceUser: true });
    }
    const session = wx.getStorageSync('session');
    if (session && session.openid) {
      this.globalData.openid = session.openid;
      this.globalData.role = session.role || 'member';
      this.globalData.name = session.name || '';
    }
    // 使用统计：每次启动记一条（失败不影响使用）
    this.trackUsage();
  },
  trackUsage() {
    if (!wx.cloud) return;
    wx.cloud.callFunction({
      name: 'trackUsage',
      data: { event: 'launch' },
      fail: function () {}
    });
  }
});
