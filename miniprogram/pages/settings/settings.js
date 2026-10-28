// 设置页（仅管理员）：主/备模型名称与 API Key 在线修改，保存到云数据库 settings/ai
Page({
  data: {
    primaryModel: '',
    primaryApiKey: '',
    fallbackModel: '',
    fallbackApiKey: '',
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
          primaryApiKey: r.primaryApiKey || '',
          fallbackModel: r.fallbackModel || '',
          fallbackApiKey: r.fallbackApiKey || '',
          endpoint: r.endpoint || ''
        });
      },
      fail: () => wx.showToast({ title: '读取失败', icon: 'none' })
    });
  },
  onPrimaryInput(e) { this.setData({ primaryModel: e.detail.value }); },
  onPrimaryKeyInput(e) { this.setData({ primaryApiKey: e.detail.value }); },
  onFallbackInput(e) { this.setData({ fallbackModel: e.detail.value }); },
  onFallbackKeyInput(e) { this.setData({ fallbackApiKey: e.detail.value }); },
  onSave() {
    if (this.data.saving) return;
    const primary = String(this.data.primaryModel || '').trim();
    const primaryKey = String(this.data.primaryApiKey || '').trim();
    const fallback = String(this.data.fallbackModel || '').trim();
    const fallbackKey = String(this.data.fallbackApiKey || '').trim();
    const re = /^[A-Za-z0-9._:-]{1,100}$/;
    if (!re.test(primary)) { wx.showToast({ title: '主模型格式不正确', icon: 'none' }); return; }
    if (!primaryKey || primaryKey.length < 8 || /\s/.test(primaryKey)) {
      wx.showToast({ title: '请填写有效的主 Key', icon: 'none' }); return;
    }
    if (fallback && !re.test(fallback)) { wx.showToast({ title: '备用模型格式不正确', icon: 'none' }); return; }
    if (fallback && fallback === primary) { wx.showToast({ title: '备用模型不能与主模型相同', icon: 'none' }); return; }
    if (fallbackKey && (fallbackKey.length < 8 || /\s/.test(fallbackKey))) {
      wx.showToast({ title: '备用 Key 格式不正确', icon: 'none' }); return;
    }
    this.setData({ saving: true });
    wx.cloud.callFunction({
      name: 'manageSettings',
      data: {
        action: 'save',
        primaryModel: primary,
        primaryApiKey: primaryKey,
        fallbackModel: fallback,
        fallbackApiKey: fallbackKey
      },
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
  }
});
