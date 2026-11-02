// 登录页：微信授权 → 云函数 login → 存 session（新用户需绑定成员）
const app = getApp();
const { getDisplayName } = require('../../utils/shift.js');
const { selectableMembers } = require('../../utils/member.js');
const { ensurePrivacy } = require('../../utils/privacy.js');

function importMemberLabel(p) {
  const nick = String(p.nickname || '').trim();
  const real = String(p.realName || '').trim();
  if (nick && real && nick !== real) return '昵称「' + nick + '」-真实姓名「' + real + '」';
  if (real) return '真实姓名「' + real + '」';
  if (nick) return '昵称「' + nick + '」';
  return p.name;
}
function importMemberNickname(p) {
  const nick = String(p.nickname || '').trim();
  const real = String(p.realName || '').trim();
  // 只有“昵称和真实姓名不同”才认为是独立昵称；只有真实姓名/两者相同时不自动填
  if (nick && real && nick !== real) return nick;
  if (nick && !real) return nick;
  return '';
}
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
    newRealName: '',
    forceNewIdentity: false,
    // 导入排班
    importLoading: false,
    importPreview: null,
    importPreviewLabel: '',
    importTargetName: '',
    importFullPreview: null,
    showMemberSelect: false,
    recognizedMembers: [],
    importBindName: '',
    importRecognizeSeconds: 0,
    importLastSeconds: 0,
    importLastStatus: ''
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
  onNewRealNameInput(e) {
    this.setData({ newRealName: e.detail.value });
  },
  onCreateAndBind() {
    const name = (this.data.newName || "").trim();
    const realName = (this.data.newRealName || "").trim();
    if (!name) { wx.showToast({ title: "请输入成员昵称", icon: "none" }); return; }
    if (this.data.forceNewIdentity && !realName) {
      wx.showToast({ title: "请填写新的真实姓名", icon: "none" });
      return;
    }
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: "manageMember",
      data: { action: "checkName", name: name },
      success: (res) => {
        const r = res.result || {};
        if (r.ok && r.exists) {
          this.setData({ loading: false });
          const m = r.member;
          wx.showModal({
            title: "成员已存在",
            content: "系统已有成员「" + m.name + "」" +
              (m.realName ? "，真实姓名「" + m.realName + "」" : "，还没有真实姓名") +
              "。你是这位成员吗？",
            confirmText: "是我",
            cancelText: "不是我",
            success: (x) => {
              if (x.confirm) {
                if (m.isBound && !m.isSelf) {
                  wx.showModal({
                    title: "已被绑定",
                    content: "该成员已被其他微信绑定，请联系管理员解绑或转移后再登录。",
                    showCancel: false
                  });
                  return;
                }
                this._bindExisting(m.name);
                return;
              }
              this.setData({
                forceNewIdentity: true,
                showCreateInput: true,
                newName: "",
                newRealName: ""
              });
              wx.showToast({ title: "请换新昵称并填写真实姓名", icon: "none" });
            }
          });
          return;
        }
        this._createAndBind(name, realName);
      },
      fail: () => this._createAndBind(name, realName)
    });
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
  _bindExisting(name) {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: "manageMember",
      data: { action: "bindWechat", name: name },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) this._saveSessionAndEnter(r);
        else wx.showToast({ title: r.msg || "绑定失败", icon: "none" });
      },
      fail: () => wx.showToast({ title: "绑定失败，请重试", icon: "none" }),
      complete: () => this.setData({ loading: false })
    });
  },
  _createAndBind(name, realName) {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: "manageMember",
      data: { action: "createAndBind", name: name, realName: realName },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          this._saveSessionAndEnter(r);
        } else if (r.msg === "alreadyBound") {
          const dn = getDisplayName(r.boundName);
          wx.showModal({ title: "提示", content: "您已绑定成员：" + dn, showCancel: false });
        } else {
          wx.showToast({ title: r.msg || "创建失败", icon: "none" });
        }
      },
      fail: () => wx.showToast({ title: "创建失败，请重试", icon: "none" }),
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
  _startImportTimer() {
    this._importStart = Date.now();
    this._importOutcome = '';
    this._importTimer = setInterval(() => {
      if (!this._importStart) return;
      const sec = Math.max(0, Math.floor((Date.now() - this._importStart) / 1000));
      this.setData({ importRecognizeSeconds: sec });
      try { wx.showLoading({ title: '识别中... ' + sec + 's', mask: true }); } catch (e) {}
    }, 1000);
  },
  _stopImportTimer(status) {
    if (!this._importStart && !this._importTimer) return;
    if (this._importTimer) { clearInterval(this._importTimer); this._importTimer = null; }
    const sec = this._importStart ? Math.max(1, Math.round((Date.now() - this._importStart) / 1000)) : 0;
    this._importStart = 0;
    wx.hideLoading();
    this.setData({ importLoading: false, importRecognizeSeconds: sec, importLastSeconds: sec, importLastStatus: status || '结束' });
  },
  onImportShift() {
    if (this.data.myBoundName) {
      const dn = getDisplayName(this.data.myBoundName);
      wx.showModal({ title: '提示', content: '您已绑定成员：' + dn + '，请直接进入日历查看排班', showCancel: false });
      return;
    }
    if (this.data.importLoading) {
      wx.showToast({ title: '正在识别，请稍候', icon: 'none' });
      return;
    }
    ensurePrivacy(() => {
      wx.showActionSheet({
        itemList: ['从相册选择', '从聊天图片选择', '从聊天文件选择', 'Excel 表格（.xlsx/.xls）'],
        success: (res) => {
          if (res.tapIndex === 0) this.importFromAlbum();
          else if (res.tapIndex === 1) this.importFromChatImage();
          else if (res.tapIndex === 2) this.importFromChat();
          else this.importFromExcel();
        }
      });
    }, () => {
      wx.showToast({ title: '需要同意隐私保护指引后才能导入', icon: 'none' });
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
    this._startImportTimer();
    wx.showLoading({ title: '识别中... 0s', mask: true });
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
            const outcome = (r.ok && r.preview && r.preview.length)
              ? ('成功，' + r.preview.length + ' 人')
              : ('失败：' + (r.msg || '未识别到内容'));
            this._importOutcome = outcome;
            this._stopImportTimer(outcome);
            if (r.ok && r.preview && r.preview.length) {
              const fullPreview = r.preview.map(function (p) {
                p.displayName = getDisplayName(p.name);
                p.label = importMemberLabel(p);
                return p;
              });
              const members = fullPreview.map(function (p) {
                return { name: p.name, displayName: p.displayName, nickname: p.nickname || '', realName: p.realName || '', label: p.label };
              });
              if (members.length === 1) {
                this.setData({
                  importPreview: fullPreview,
                  importFullPreview: fullPreview,
                  importPreviewLabel: fullPreview[0].label,
                  importTargetName: members[0].name,
                  // 有昵称才自动填；只有真实姓名的表保持为空
                  importBindName: importMemberNickname(fullPreview[0])
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
          fail: (err) => {
            this._stopImportTimer('请求失败');
            wx.showModal({
              title: '识别失败',
              content: (err && err.errMsg) ? err.errMsg : '云函数调用失败，请检查网络或稍后重试',
              showCancel: false
            });
          },
          complete: () => this._stopImportTimer(this._importOutcome || '结束')
        });
      },
      fail: () => {
        this._stopImportTimer('上传失败');
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
  },
  onSelectImportMember(e) {
    const name = e.currentTarget.dataset.name;
    const filtered = (this.data.importFullPreview || []).filter(function (p) { return p.name === name; });
    const dn = getDisplayName(name);
    const selected = filtered[0] || {};
    this.setData({
      showMemberSelect: false,
      importPreview: filtered,
      importPreviewLabel: selected.label || dn,
      importTargetName: name,
      // 有昵称才自动填；只有真实姓名时为空
      importBindName: importMemberNickname(selected),
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
    const selectedRealName = String((preview[0] && preview[0].realName) || '').trim();
    // 先创建/绑定成员，再导入排班
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'createAndBind', name: bindName, realName: selectedRealName },
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
