// 登录页：微信授权 → 云函数 login → 存 session（新用户需绑定成员）
const app = getApp();
const { getDisplayName } = require('../../utils/shift.js');
const { selectableMembers } = require('../../utils/member.js');
Page({
  data: {
    loading: false,
    needBind: false,
    isAdmin: false,
    memberList: [],
    myBoundName: '',
    myBoundDisplayName: '',
    selectedName: '',
    selectedDisplayName: '',
    showCreateInput: false,
    newName: '',
    // 导入排班
    importLoading: false,
    importPreview: null,
    importTargetName: '',
    importFullPreview: null,
    showMemberSelect: false,
    recognizedMembers: [],
    importBindName: ''
  },
  onShow() {
    const session = wx.getStorageSync('session');
    if (session && session.openid && session.name) {
      wx.switchTab({ url: '/pages/calendar/calendar' });
      return;
    }
    if (session && session.openid && !session.name) {
      this.setData({ needBind: true, isAdmin: session.role === 'admin' });
      this.loadMemberList();
      return;
    }
    this.onLogin();
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
        if (r.needBind) {
          wx.setStorageSync('session', { openid: r.openid, name: '', role: r.role });
          this.setData({ needBind: true, isAdmin: r.role === 'admin', loading: false });
          this.loadMemberList();
          return;
        }
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
  loadMemberList() {
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'list', bindable: true },
      success: (res) => {
        const r = res.result || {};
        if (r.members) {
          let myBoundName = '';
          let myBoundDisplayName = '';
          const list = [];
          selectableMembers(r.members).forEach(function (m) {
            if (!m.name) return;
            // openid 已不再下发；用 isSelf / isBound 判断
            if (m.isSelf) {
              myBoundName = m.name;
              myBoundDisplayName = getDisplayName(m.name);
            } else if (!m.isBound) {
              m.displayName = getDisplayName(m.name);
              list.push(m);
            }
          });
          this.setData({ memberList: list, myBoundName: myBoundName, myBoundDisplayName: myBoundDisplayName });
        }
      },
      fail: () => wx.showToast({ title: '加载成员列表失败', icon: 'none' })
    });
  },
  onSelectName(e) {
    const ds = e.currentTarget.dataset;
    this.setData({ selectedName: ds.name, selectedDisplayName: ds.displayname || ds.name, showCreateInput: false });
  },
  onToggleCreate() {
    if (this.data.myBoundName) {
      const dn = getDisplayName(this.data.myBoundName);
      wx.showModal({ title: '提示', content: '您已绑定成员：' + dn, showCancel: false });
      return;
    }
    this.setData({ showCreateInput: !this.data.showCreateInput, selectedName: '', selectedDisplayName: '' });
  },
  onNewNameInput(e) {
    this.setData({ newName: e.detail.value });
  },
  onConfirmBind() {
    const name = this.data.selectedName;
    if (!name) { wx.showToast({ title: '请先选择成员', icon: 'none' }); return; }
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'bindWechat', name: name },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          this._saveSessionAndEnter(r);
        } else {
          wx.showToast({ title: r.msg || '绑定失败', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '绑定失败，请重试', icon: 'none' }),
      complete: () => this.setData({ loading: false })
    });
  },
  onCreateAndBind() {
    const name = (this.data.newName || '').trim();
    if (!name) { wx.showToast({ title: '请输入成员昵称', icon: 'none' }); return; }
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'createAndBind', name: name },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          this._saveSessionAndEnter(r);
        } else if (r.msg === 'alreadyBound') {
          const dn = getDisplayName(r.boundName);
          wx.showModal({ title: '提示', content: '您已绑定成员：' + dn, showCancel: false });
        } else {
          wx.showToast({ title: r.msg || '创建失败', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '创建失败，请重试', icon: 'none' }),
      complete: () => this.setData({ loading: false })
    });
  },
  onSkipBind() {
    const session = wx.getStorageSync('session');
    app.globalData.openid = session.openid;
    app.globalData.role = session.role;
    app.globalData.name = '';
    wx.switchTab({ url: '/pages/calendar/calendar' });
  },
  onEnterCalendar() {
    const session = wx.getStorageSync('session');
    const name = this.data.myBoundName;
    const displayName = getDisplayName(name);
    wx.setStorageSync('session', { openid: session.openid, role: session.role || 'member', name: name });
    app.globalData.openid = session.openid;
    app.globalData.role = session.role || 'member';
    app.globalData.name = name;
    wx.switchTab({ url: '/pages/calendar/calendar' });
  },
  // ===== 导入排班功能 =====
  onImportShift() {
    if (this.data.myBoundName) {
      const dn = getDisplayName(this.data.myBoundName);
      wx.showModal({ title: '提示', content: '您已绑定成员：' + dn + '，请直接进入日历查看排班', showCancel: false });
      return;
    }
    if (this.data.importLoading) return;
    wx.showActionSheet({
      itemList: ['从相册选择', '从聊天图片选择', '从聊天文件选择', 'Excel 表格（.xlsx/.xls）'],
      success: (res) => {
        if (res.tapIndex === 0) this.importFromAlbum();
        else if (res.tapIndex === 1) this.importFromChatImage();
        else if (res.tapIndex === 2) this.importFromChat();
        else this.importFromExcel();
      }
    });
  },
  importFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => this.importUploadAndRecognize(res.tempFiles[0].tempFilePath, 'image')
    });
  },
  importFromChat() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['jpg', 'jpeg', 'png', 'jfif', 'webp', 'gif', 'bmp'],
      success: (res) => {
        const f = res.tempFiles[0];
        if (f.size > 10 * 1024 * 1024) { wx.showToast({ title: '文件过大（限10MB）', icon: 'none' }); return; }
        wx.compressImage({
          src: f.path,
          quality: 70,
          compressedWidth: 1000,
          success: (c) => { this.importUploadAndRecognize(c.tempFilePath, 'image'); },
          fail: () => { this.importUploadAndRecognize(f.path, 'image'); }
        });
      }
    });
  },
  importFromChatImage() {
    wx.chooseMessageFile({
      count: 1,
      type: 'image',
      success: (res) => {
        const f = res.tempFiles[0];
        if (f.size > 10 * 1024 * 1024) { wx.showToast({ title: '图片过大（限10MB）', icon: 'none' }); return; }
        wx.compressImage({
          src: f.path,
          quality: 70,
          compressedWidth: 1000,
          success: (c) => { this.importUploadAndRecognize(c.tempFilePath, 'image'); },
          fail: () => { this.importUploadAndRecognize(f.path, 'image'); }
        });
      }
    });
  },
  importFromExcel() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls'],
      success: (res) => {
        const f = res.tempFiles[0];
        if (f.size > 10 * 1024 * 1024) { wx.showToast({ title: '文件过大（限10MB）', icon: 'none' }); return; }
        this.importUploadAndRecognize(f.path, 'excel');
      }
    });
  },
  importUploadAndRecognize(filePath, type) {
    this.setData({ importLoading: true });
    let ext = '.jpg';
    if (type === 'image') {
      const m = filePath.match(/\.([a-zA-Z0-9]+)$/);
      ext = '.' + (m ? m[1].toLowerCase() : 'jpg');
      if (ext === '.jfif') ext = '.jpg';
      if (!/^\.(jpg|jpeg|png|webp|gif|bmp)$/.test(ext)) ext = '.jpg';
    } else {
      const m = filePath.match(/\.(xlsx|xls)$/i);
      ext = m ? '.' + m[1].toLowerCase() : '.xlsx';
    }
    const cloudPath = 'shift-import/' + Date.now() + ext;
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: (up) => {
        wx.cloud.callFunction({
          name: 'importShift',
          data: { fileID: up.fileID, sourceType: type, targetName: '' },
          success: (res) => {
            const r = res.result || {};
            if (r.ok && r.preview && r.preview.length) {
              const fullPreview = r.preview.map(function (p) {
                p.displayName = getDisplayName(p.name);
                return p;
              });
              const members = fullPreview.map(function (p) { return { name: p.name, displayName: p.displayName }; });
              if (members.length === 1) {
                this.setData({
                  importPreview: fullPreview,
                  importFullPreview: fullPreview,
                  importTargetName: members[0].name,
                  importBindName: members[0].displayName
                });
                wx.showToast({ title: '识别成功', icon: 'success' });
              } else {
                this.setData({
                  showMemberSelect: true,
                  recognizedMembers: members,
                  importFullPreview: fullPreview
                });
              }
            } else {
              wx.showModal({ title: '未识别到内容', content: r.msg || '请检查图片/表格格式', showCancel: false });
            }
          },
          fail: (err) => wx.showModal({
            title: '识别失败',
            content: (err && err.errMsg) ? err.errMsg : '云函数调用失败，请检查网络或稍后重试',
            showCancel: false
          }),
          complete: () => this.setData({ importLoading: false })
        });
      },
      fail: () => {
        wx.showToast({ title: '上传失败', icon: 'none' });
        this.setData({ importLoading: false });
      }
    });
  },
  onSelectImportMember(e) {
    const name = e.currentTarget.dataset.name;
    const filtered = (this.data.importFullPreview || []).filter(function (p) { return p.name === name; });
    const dn = getDisplayName(name);
    this.setData({
      showMemberSelect: false,
      importPreview: filtered,
      importTargetName: name,
      importBindName: dn,
      recognizedMembers: [],
      importFullPreview: null
    });
    if (filtered.length) wx.showToast({ title: '已选择 ' + dn, icon: 'success' });
  },
  onCancelSelect() {
    this.setData({ showMemberSelect: false, recognizedMembers: [], importFullPreview: null });
  },
  onFixImportShift(e) {
    const { idx, date } = e.currentTarget.dataset;
    const preview = this.data.importPreview;
    const row = preview[idx].rows.find(function (r) { return r.date === date; });
    if (!row) return;
    const SHIFT_TYPES = require('../../utils/shift.js').SHIFT_TYPES;
    const list = SHIFT_TYPES.concat(['取消']);
    const cur = list.indexOf(row.shift);
    row.shift = list[(cur + 1) % list.length];
    this.setData({ importPreview: preview });
  },
  onImportBindNameInput(e) {
    this.setData({ importBindName: e.detail.value });
  },
  onConfirmImport() {
    const preview = this.data.importPreview;
    if (!preview || !preview.length) return;
    const bindName = (this.data.importBindName || '').trim();
    if (!bindName) { wx.showToast({ title: '请输入成员昵称', icon: 'none' }); return; }
    this.setData({ importLoading: true });
    wx.showLoading({ title: '导入中...' });
    // 先创建/绑定成员，再导入排班
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'createAndBind', name: bindName },
      success: (bindRes) => {
        const br = bindRes.result || {};
        // alreadyBound → 使用已绑定的成员继续导入
        if (!br.ok && br.msg === 'alreadyBound') {
          br.ok = true;
          br.name = br.boundName;
          br.role = 'member';
        }
        if (!br.ok) {
          wx.hideLoading();
          wx.showToast({ title: br.msg || '绑定失败', icon: 'none' });
          this.setData({ importLoading: false });
          return;
        }
        // 把预览中的成员名替换为用户确认的绑定名
        const finalName = br.name || bindName;
        const adjustedPreview = preview.map(function (p) {
          return { name: finalName, rows: p.rows };
        });
        wx.cloud.callFunction({
          name: 'importShift',
          // 不再传当前年月：由识别结果显示的 year/month 决定，避免跨月导入被误判
          data: { commit: true, preview: adjustedPreview },
          success: (res) => {
            wx.hideLoading();
            const r2 = res.result || {};
            if (r2.ok) {
              const session = { openid: br.openid || wx.getStorageSync('session').openid, role: br.role || 'member', name: finalName };
              wx.setStorageSync('session', session);
              app.globalData.openid = session.openid;
              app.globalData.role = session.role;
              app.globalData.name = finalName;
              wx.setStorageSync('importTargetMember', finalName);
              const firstRow = adjustedPreview[0] && adjustedPreview[0].rows && adjustedPreview[0].rows[0];
              const target = { name: finalName };
              if (firstRow && firstRow.date) {
                target.year = Number(firstRow.date.slice(0, 4));
                target.month = Number(firstRow.date.slice(5, 7));
              }
              wx.setStorageSync('importTarget', target);
              wx.showToast({ title: '导入成功', icon: 'success' });
              this.setData({ importPreview: null, importTargetName: '', importBindName: '' });
              setTimeout(function () { wx.switchTab({ url: '/pages/calendar/calendar' }); }, 800);
            } else {
              wx.showToast({ title: r2.msg || '导入失败', icon: 'none' });
            }
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '导入失败', icon: 'none' }); },
          complete: () => this.setData({ importLoading: false })
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '绑定失败，请重试', icon: 'none' });
        this.setData({ importLoading: false });
      }
    });
  },
  onCancelImport() {
    this.setData({ importPreview: null, importTargetName: '', importBindName: '', showMemberSelect: false, recognizedMembers: [], importFullPreview: null });
  },
  _saveSessionAndEnter(r) {
    wx.showToast({ title: '绑定成功：' + r.name, icon: 'success' });
    const session = { openid: r.openid || wx.getStorageSync('session').openid, role: r.role, name: r.name };
    wx.setStorageSync('session', session);
    app.globalData.openid = session.openid;
    app.globalData.role = r.role;
    app.globalData.name = r.name;
    setTimeout(function () { wx.switchTab({ url: '/pages/calendar/calendar' }); }, 800);
  }
});
