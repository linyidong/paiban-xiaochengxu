// 排班导入页：上传截图/表格 → 识别 → 单人自动导入 / 多人询问选谁 → 预览校对 → 确认入库
const { getDisplayName } = require('../../utils/shift.js');
Page({
  data: {
    preview: null,  // [{name, rows:[{date, shift}]}]
    loading: false,
    sourceType: '',
    targetName: '',
    // 多人选择
    showMemberSelect: false,
    recognizedMembers: [],  // 识别到的成员列表 [{name}]
    fullPreview: null,       // 首次识别的完整结果（用于本地过滤，避免重复调用 AI）
    // 非管理员强制绑定
    isAdmin: false,
    boundMemberName: '',
    boundMemberDisplayName: '',
    // 非管理员绑定确认弹窗
    showBindConfirm: false,
    bindConfirmRecognizedName: '',
    bindConfirmRecognizedDisplayName: ''
  },
  onShow() {
    const session = wx.getStorageSync('session');
    if (!session || !session.openid) wx.reLaunch({ url: '/pages/login/login' });
    const isAdmin = session.role === 'admin';
    const boundMemberName = session.name || '';
    const boundMemberDisplayName = getDisplayName(boundMemberName);
    this.setData({ isAdmin: isAdmin, boundMemberName: boundMemberName, boundMemberDisplayName: boundMemberDisplayName });
  },
  onChooseImage() {
    if (this.data.loading) return;
    wx.showActionSheet({
      itemList: ['从相册选择', '从聊天图片选择', '从聊天文件选择'],
      success: (res) => {
        if (res.tapIndex === 0) this.chooseFromAlbum();
        else if (res.tapIndex === 1) this.chooseFromChatImage();
        else this.chooseFromChat();
      }
    });
  },
  chooseFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => this.uploadAndRecognize(res.tempFiles[0].tempFilePath, 'image')
    });
  },
  // 从微信聊天文件里选排班截图（支持 jpg/jpeg/png/jfif/webp/gif/bmp 等）
  chooseFromChat() {
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
          success: (c) => { this.uploadAndRecognize(c.tempFilePath, 'image'); },
          fail: () => { this.uploadAndRecognize(f.path, 'image'); }
        });
      }
    });
  },
  // 从微信聊天里直接选图片（type: 'image' 可获取聊天中直接发送的图片）
  chooseFromChatImage() {
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
          success: (c) => { this.uploadAndRecognize(c.tempFilePath, 'image'); },
          fail: () => { this.uploadAndRecognize(f.path, 'image'); }
        });
      }
    });
  },
  // 上传并识别（始终识别所有人，不传 targetName）
  uploadAndRecognize(filePath, type) {
    this.setData({ loading: true, sourceType: type });
    let ext = '.xlsx';
    if (type === 'image') {
      const m = filePath.match(/\.([a-zA-Z0-9]+)$/);
      ext = '.' + (m ? m[1].toLowerCase() : 'jpg');
      if (ext === '.jfif') ext = '.jpg';
      if (!/^\.(jpg|jpeg|png|webp|gif|bmp)$/.test(ext)) ext = '.jpg';
    }
    const cloudPath = 'shift-import/' + Date.now() + ext;
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: (up) => {
        wx.cloud.callFunction({
          name: 'importShift',
          data: {
            fileID: up.fileID,
            sourceType: type,
            // 成员只识别自己那一行（省 token、防串列）；管理员识别整表，后续可选人或全部
            targetName: this.data.isAdmin ? '' : (this.data.boundMemberName || '')
          },
          success: (res) => {
            const r = res.result || {};
            if (r.ok && r.preview && r.preview.length) {
              // 为每个成员添加 displayName
              const fullPreview = r.preview.map(function (p) {
                p.displayName = getDisplayName(p.name);
                return p;
              });
              const members = fullPreview.map(function (p) { return { name: p.name, displayName: p.displayName }; });
              // 非管理员且有已绑定成员 → 弹出绑定确认
              if (!this.data.isAdmin && this.data.boundMemberName && members.length === 1) {
                const recognized = members[0];
                this.setData({
                  fullPreview: fullPreview,
                  showBindConfirm: true,
                  bindConfirmRecognizedName: recognized.name,
                  bindConfirmRecognizedDisplayName: recognized.displayName
                });
                return;
              }
              if (members.length === 1) {
                // 只有一人 → 直接显示该人预览
                this.setData({
                  preview: fullPreview,
                  fullPreview: fullPreview,
                  targetName: members[0].name
                });
                wx.showToast({ title: '识别成功', icon: 'success' });
                setTimeout(function () { wx.pageScrollTo({ scrollTop: 99999, duration: 300 }); }, 400);
              } else {
                // 多人 → 弹出选择器
                this.setData({
                  showMemberSelect: true,
                  recognizedMembers: members,
                  fullPreview: fullPreview
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
          complete: () => this.setData({ loading: false })
        });
      },
      fail: () => {
        wx.showToast({ title: '上传失败', icon: 'none' });
        this.setData({ loading: false });
      }
    });
  },
  // 选择成员（多人识别时，从已识别结果中过滤，不重复调用 AI）
  onSelectMember(e) {
    const name = e.currentTarget.dataset.name;
    const filtered = (this.data.fullPreview || []).filter(function (p) { return p.name === name; });
    this.setData({
      showMemberSelect: false,
      preview: filtered,
      targetName: name,
      recognizedMembers: [],
      fullPreview: null
    });
    if (filtered.length) {
      wx.showToast({ title: '已选择 ' + name, icon: 'success' });
      setTimeout(function () { wx.pageScrollTo({ scrollTop: 99999, duration: 300 }); }, 400);
    }
  },
  onCancelSelect() {
    this.setData({ showMemberSelect: false, recognizedMembers: [], fullPreview: null });
  },
  // 非管理员绑定确认：确定 → 把识别到的成员替换为已绑定成员名，直接显示预览
  onConfirmBindRecognized() {
    const boundName = this.data.boundMemberName;
    const fullPreview = this.data.fullPreview;
    // 把识别到的成员名替换为用户已绑定的成员名
    const adjustedPreview = fullPreview.map(function (p) {
      return { name: boundName, displayName: getDisplayName(boundName), rows: p.rows };
    });
    this.setData({
      showBindConfirm: false,
      bindConfirmRecognizedName: '',
      bindConfirmRecognizedDisplayName: '',
      preview: adjustedPreview,
      fullPreview: adjustedPreview,
      targetName: boundName
    });
    wx.showToast({ title: '已绑定到「' + getDisplayName(boundName) + '」', icon: 'success' });
    setTimeout(function () { wx.pageScrollTo({ scrollTop: 99999, duration: 300 }); }, 400);
  },
  // 非管理员绑定确认：取消 → 显示完整预览，让用户自行决定
  onCancelBindConfirm() {
    const fullPreview = this.data.fullPreview;
    const members = fullPreview.map(function (p) { return { name: p.name, displayName: p.displayName }; });
    this.setData({
      showBindConfirm: false,
      bindConfirmRecognizedName: '',
      bindConfirmRecognizedDisplayName: '',
      fullPreview: null
    });
    if (members.length === 1) {
      this.setData({ preview: fullPreview, targetName: members[0].name });
      setTimeout(function () { wx.pageScrollTo({ scrollTop: 99999, duration: 300 }); }, 400);
    } else {
      this.setData({ showMemberSelect: true, recognizedMembers: members, fullPreview: fullPreview });
    }
  },
  // 人工校对：点按循环切换班次（按班次列表顺序循环，如 休→正A→正B→售A→售B→休）
  onFixShift(e) {
    const { idx, date } = e.currentTarget.dataset;
    const preview = this.data.preview;
    const row = preview[idx].rows.find(function (r) { return r.date === date; });
    if (!row) return;
    const SHIFT_TYPES = require('../../utils/shift.js').SHIFT_TYPES;
    const list = SHIFT_TYPES;
    const cur = list.indexOf(row.shift);
    row.shift = list[(cur + 1) % list.length];
    this.setData({ preview: preview });
  },
  onConfirm() {
    const preview = this.data.preview;
    if (!preview || !preview.length) return;
    const targetName = this.data.targetName;
    const who = (targetName && targetName !== '全部') ? '「' + targetName + '」' : preview.length + ' 位成员';
    wx.showModal({
      title: '确认导入',
      content: '将覆盖 ' + who + ' 的当月排班，是否继续？',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '导入中...' });
        const now = new Date();
        wx.cloud.callFunction({
          name: 'importShift',
          data: { commit: true, preview: preview, year: now.getFullYear(), month: now.getMonth() + 1 },
          success: (res) => {
            wx.hideLoading();
            const r2 = res.result || {};
            if (r2.ok) {
              wx.showToast({ title: '导入成功', icon: 'success' });
              this.setData({ preview: null, targetName: '' });
              // 告诉日历页切换到导入的成员
              let switchTo = targetName && targetName !== '全部' ? targetName : (preview[0] && preview[0].name || '');
              if (switchTo) wx.setStorageSync('importTargetMember', switchTo);
              setTimeout(function () { wx.switchTab({ url: '/pages/calendar/calendar' }); }, 600);
            } else {
              wx.showToast({ title: r2.msg || '导入失败', icon: 'none' });
            }
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '导入失败', icon: 'none' }); }
        });
      }
    });
  },
  onCancel() { this.setData({ preview: null, targetName: '', showMemberSelect: false, recognizedMembers: [], fullPreview: null }); }
});
