// 设置页（仅管理员）：主模型 / 备用模型在线修改，保存到云数据库 settings/ai
Page({
  data: {
    primaryModel: '',
    fallbackModel: '',
    endpoint: '',
    saving: false,
    isAdmin: false
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
        if (!r.ok) {
          wx.showToast({ title: r.msg || '读取失败', icon: 'none' });
          return;
        }
        this.setData({
          primaryModel: r.primaryModel || '',
          fallbackModel: r.fallbackModel || '',
          endpoint: r.endpoint || ''
        });
      },
      fail: () => wx.showToast({ title: '读取失败', icon: 'none' })
    });
  },
  onPrimaryInput(e) { this.setData({ primaryModel: e.detail.value }); },
  onFallbackInput(e) { this.setData({ fallbackModel: e.detail.value }); },
  onSave() {
    if (this.data.saving) return;
    const primary = String(this.data.primaryModel || '').trim();
    const fallback = String(this.data.fallbackModel || '').trim();
    const re = /^[A-Za-z0-9._:-]{1,100}$/;
    if (!re.test(primary)) { wx.showToast({ title: '主模型格式不正确', icon: 'none' }); return; }
    if (fallback && !re.test(fallback)) { wx.showToast({ title: '备用模型格式不正确', icon: 'none' }); return; }
    if (fallback && fallback === primary) { wx.showToast({ title: '备用模型不能与主模型相同', icon: 'none' }); return; }
    this.setData({ saving: true });
    wx.cloud.callFunction({
      name: 'manageSettings',
      data: { action: 'save', primaryModel: primary, fallbackModel: fallback },
      success: (res) => {
        const r = res.result || {};
        this.setData({ saving: false });
        if (!r.ok) { wx.showToast({ title: r.msg || '保存失败', icon: 'none' }); return; }
        wx.showToast({ title: '已保存', icon: 'success' });
      },
      fail: () => {
        this.setData({ saving: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },
  goTechstack() { wx.navigateTo({ url: '/pages/techstack/techstack' }); }
});
