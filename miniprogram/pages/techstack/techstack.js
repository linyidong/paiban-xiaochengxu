// 技术栈页（仅管理员）：展示当前技术栈与 AI 模型配置，可跳转设置
Page({
  data: {
    isAdmin: false,
    primaryModel: '',
    fallbackModel: '',
    endpoint: '',
    stack: [
      { name: '前端', value: '微信小程序原生（WXML / WXSS / JavaScript，基础库 3.17.3）' },
      { name: '后端', value: '微信云开发 · 云函数（Node.js 16.13）' },
      { name: '数据', value: '云数据库 users / shifts / memos / changeLog / settings' },
      { name: 'AI 识别', value: '火山方舟 Ark · Chat Completions（主/备模型自动切换）' },
      { name: '图片识别', value: 'Base64 视觉调用，单次 60s 超时，失败自动重试' },
      { name: '测试', value: 'Node.js 内置 node:test（109 条）' },
      { name: '当前版本', value: '体验版 1.2.0（以小程序后台版本管理为准）' }
    ]
  },
  onShow() {
    const session = wx.getStorageSync('session') || {};
    if (session.role !== 'admin') {
      wx.showToast({ title: '仅管理员可访问', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }
    this.setData({ isAdmin: true });
    this.load();
  },
  load() {
    wx.cloud.callFunction({
      name: 'manageSettings',
      data: { action: 'get' },
      success: (res) => {
        const r = res.result || {};
        if (!r.ok) return;
        this.setData({
          primaryModel: r.primaryModel || '',
          fallbackModel: r.fallbackModel || '',
          endpoint: r.endpoint || ''
        });
      },
      fail: () => {}
    });
  },
  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); }
});
