// 我的页：身份 + 当月我的排班摘要 + 管理员入口 + 成员自助修改显示名称
const { getDisplayName } = require('../../utils/shift.js');
Page({
  data: {
    role: '', name: '', displayName: '', summary: null, isAdmin: false, hasBound: false,
    editingName: false, newName: '', savingName: false
  },
  onShow() {
    const session = wx.getStorageSync('session');
    if (!session || !session.openid) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    const hasBound = !!session.name;
    this.setData({
      role: session.role === 'admin' ? '管理员' : '成员',
      name: session.name || '',
      displayName: hasBound ? getDisplayName(session.name) : '',
      isAdmin: session.role === 'admin',
      hasBound: hasBound
    });
    if (hasBound) {
      this.loadMySummary(session.name);
      this._maybeAskName(session);
    }
  },
  _maybeAskName(session) {
    if (session.role === 'admin' || !session.name) return;
    const displayName = getDisplayName(session.name);
    if (displayName !== session.name) return; // 已有导入昵称，不打扰
    const key = 'namePrompted_' + session.openid;
    if (wx.getStorageSync(key)) return;
    wx.showModal({
      title: '显示名称',
      content: '当前显示的是导入姓名「' + session.name + '」。如果这是真实姓名，是否改成昵称？',
      confirmText: '去修改',
      cancelText: '暂不',
      success: (r) => {
        wx.setStorageSync(key, true);
        if (r.confirm) this.onStartRename();
      },
      fail: () => wx.setStorageSync(key, true)
    });
  },
  loadMySummary(name) {
    const now = new Date();
    wx.cloud.callFunction({
      name: 'getShifts',
      data: { year: now.getFullYear(), month: now.getMonth() + 1 },
      success: (res) => {
        const r = res.result || {};
        const shiftsMap = r.shiftsMap || {};
        const myMap = shiftsMap[name] || {};
        // 统计归类：休=休；正A/正B=白班；售A/售B=晚班（售=晚班状态）
        const cnt = { '休': 0, '白': 0, '晚': 0 };
        Object.keys(myMap).forEach(function (d) {
          const t = myMap[d];
          if (t === '休') cnt['休'] += 1;
          else if (t.indexOf('正') > -1) cnt['白'] += 1;
          else if (t.indexOf('售') > -1) cnt['晚'] += 1;
        });
        this.setData({ summary: cnt });
      },
      fail: () => {}
    });
  },
  onStartRename() {
    this.setData({ editingName: true, newName: this.data.name || '' });
  },
  onNameInput(e) {
    this.setData({ newName: e.detail.value });
  },
  onCancelRename() {
    this.setData({ editingName: false, newName: '', savingName: false });
  },
  onSaveName() {
    const name = String(this.data.newName || '').trim();
    if (!name) { wx.showToast({ title: '请输入新名字', icon: 'none' }); return; }
    if (this.data.savingName) return;
    this.setData({ savingName: true });
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'renameSelf', newName: name },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          const session = wx.getStorageSync('session') || {};
          const next = Object.assign({}, session, { name: r.name || name });
          wx.setStorageSync('session', next);
          this.setData({
            name: next.name,
            displayName: getDisplayName(next.name),
            editingName: false,
            newName: '',
            savingName: false
          });
          wx.showToast({ title: r.unchanged ? '名字未变化' : '已修改', icon: 'success' });
          this.loadMySummary(next.name);
        } else {
          wx.showToast({ title: r.msg || '修改失败', icon: 'none' });
          this.setData({ savingName: false });
        }
      },
      fail: () => {
        wx.showToast({ title: '修改失败，请重试', icon: 'none' });
        this.setData({ savingName: false });
      }
    });
  },
  goMembers() { wx.navigateTo({ url: '/pages/members/members' }); },
  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); },
  goTechstack() { wx.navigateTo({ url: '/pages/techstack/techstack' }); },
  goData() { wx.navigateTo({ url: '/pages/data/data' }); },
  goMemo() { wx.navigateTo({ url: '/pages/memo/memo' }); },
  goBind() { wx.reLaunch({ url: '/pages/login/login' }); },
  onLogout() {
    const session = wx.getStorageSync('session');
    wx.setStorageSync('session', { openid: session.openid || '', name: '', role: session.role || '' });
    wx.reLaunch({ url: '/pages/login/login' });
  }
});
