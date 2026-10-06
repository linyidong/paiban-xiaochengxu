// 登录页：微信授权 → 云函数 login → 存 session（新用户需绑定昵称）
const app = getApp();
Page({
  data: { loading: false, needBind: false, memberList: [], selectedName: '' },
  onShow() {
    const session = wx.getStorageSync('session');
    if (session && session.openid && session.name && session.name !== '新成员') {
      wx.switchTab({ url: '/pages/calendar/calendar' });
      return;
    }
    // 有 openid 但还没绑定昵称 → 直接显示绑定界面
    if (session && session.openid && session.name === '新成员') {
      this.setData({ needBind: true });
      this.loadMemberList();
    }
  },
  onLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'login',
      success: (res) => {
        const r = res.result || {};
        if (!r.ok) {
          wx.showToast({ title: r.msg || '登录失败', icon: 'none' });
          return;
        }
        // 需要绑定昵称
        if (r.needBind) {
          // 先保存 openid 到 session，下次进来直接显示绑定界面
          wx.setStorageSync('session', { openid: r.openid, name: '新成员', role: r.role });
          this.setData({ needBind: true, loading: false });
          this.loadMemberList();
          return;
        }
        // 已绑定，直接进入
        const session = { openid: r.openid, role: r.role, name: r.name };
        wx.setStorageSync('session', session);
        app.globalData.openid = r.openid;
        app.globalData.role = r.role;
        app.globalData.name = r.name;
        wx.switchTab({ url: '/pages/calendar/calendar' });
      },
      fail: (err) => {
        console.error('login fail', err);
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      },
      complete: () => {
        if (!this.data.needBind) this.setData({ loading: false });
      }
    });
  },
  // 加载成员列表（排除"新成员"和已绑定的）
  loadMemberList() {
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'list' },
      success: (res) => {
        const r = res.result || {};
        if (r.members) {
          // 过滤：排除"新成员"和已有 openid 绑定的
          const list = r.members.filter(function (m) {
            return m.name !== '新成员' && !m.openid;
          });
          this.setData({ memberList: list });
        }
      },
      fail: () => wx.showToast({ title: '加载成员列表失败', icon: 'none' })
    });
  },
  onSelectName(e) {
    this.setData({ selectedName: e.currentTarget.dataset.name });
  },
  onConfirmBind() {
    const name = this.data.selectedName;
    if (!name) { wx.showToast({ title: '请先选择昵称', icon: 'none' }); return; }
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'bindWechat', name: name },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          wx.showToast({ title: '绑定成功：' + r.name, icon: 'success' });
          const session = { openid: r.openid || wx.getStorageSync('session').openid, role: r.role, name: r.name };
          wx.setStorageSync('session', session);
          app.globalData.openid = session.openid;
          app.globalData.role = r.role;
          app.globalData.name = r.name;
          setTimeout(function () { wx.switchTab({ url: '/pages/calendar/calendar' }); }, 800);
        } else {
          wx.showToast({ title: r.msg || '绑定失败', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '绑定失败，请重试', icon: 'none' }),
      complete: () => this.setData({ loading: false })
    });
  }
});
