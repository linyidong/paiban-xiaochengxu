// 排班导入页：上传截图/表格 → 识别 → 单人自动导入 / 多人询问选谁 → 预览校对 → 确认入库
const { getDisplayName } = require('../../utils/shift.js');
const { normalizePreviewToMonth } = require('../../utils/month.js');
Page({
  data: {
    preview: null,  // [{name, rows:[{date, shift}]}]
    loading: false,
    sourceType: '',
    targetName: '',
    // 从日历空月“导入”按钮带过来的目标成员/月份
    prefillName: '',
    // 目标月份（提前导入用）：'YYYY-MM'，空 = 按截图识别结果入库
    targetMonth: '',
    // 预览按目标月份重写后的提示（如忽略 12-31）
    previewNote: '',
    monthRange: { start: '', end: '' },
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
    // 月份选择范围：当前月往前 12 个月 ~ 往后 24 个月（提前排下个月班表用）
    const now = new Date();
    const fmt = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    const rangeStart = fmt(new Date(now.getFullYear(), now.getMonth() - 12, 1));
    const rangeEnd = fmt(new Date(now.getFullYear(), now.getMonth() + 24, 1));
    this.setData({
      isAdmin: isAdmin,
      boundMemberName: boundMemberName,
      boundMemberDisplayName: boundMemberDisplayName,
      monthRange: { start: rangeStart, end: rangeEnd }
    });
    // 从日历页带入：成员 + 年月；导入后自动回到该成员/月份
    const prefill = wx.getStorageSync('importPrefill');
    if (prefill && prefill.name) {
      wx.removeStorageSync('importPrefill');
      const tm = prefill.year + '-' + String(prefill.month).padStart(2, '0');
      this.setData({
        prefillName: prefill.name,
        targetName: prefill.name,
        targetMonth: tm
      });
    }
  },
  // 选择目标月份（提前导入未来月份 / 补录过去月份）
  onTargetMonthChange(e) {
    const tm = e.detail.value || '';
    if (tm && this.data.preview) {
      const n = normalizePreviewToMonth(this.data.preview, tm);
      const full = this.data.fullPreview ? normalizePreviewToMonth(this.data.fullPreview, tm) : null;
      this.setData({
        targetMonth: tm,
        preview: n.preview,
        fullPreview: full ? full.preview : this.data.fullPreview,
        previewNote: n.dropped ? ('已按 ' + tm + ' 重写日期；忽略 ' + n.dropped + ' 天（该月不存在）') : ''
      });
      return;
    }
    this.setData({ targetMonth: tm });
  },
  onClearTargetMonth() {
    this.setData({ targetMonth: '', previewNote: '' });
  },
  onChooseImage() {
    if (this.data.loading) return;
    wx.showActionSheet({
      itemList: ['从相册选择', '从聊天图片选择', '从聊天文件选择', 'Excel 表格（.xlsx/.xls）'],
      success: (res) => {
        if (res.tapIndex === 0) this.chooseFromAlbum();
        else if (res.tapIndex === 1) this.chooseFromChatImage();
        else if (res.tapIndex === 2) this.chooseFromChat();
        else this.chooseFromExcel();
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
  // Excel：从聊天文件里选 .xlsx/.xls，走 sourceType='excel'（不调用视觉 API）
  chooseFromExcel() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls'],
      success: (res) => {
        const f = res.tempFiles[0];
        if (f.size > 10 * 1024 * 1024) { wx.showToast({ title: '文件过大（限10MB）', icon: 'none' }); return; }
        this.uploadAndRecognize(f.path, 'excel');
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
    } else {
      const m = filePath.match(/\.(xlsx|xls)$/i);
      ext = m ? '.' + m[1].toLowerCase() : '.xlsx';
    }
    const cloudPath = 'shift-import/' + Date.now() + ext;
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: (up) => {
        const data = {
          fileID: up.fileID,
          sourceType: type,
          // 成员只识别自己那一行（省 token、防串列）；管理员识别整表，后续可选人或全部
          targetName: this.data.isAdmin ? '' : (this.data.boundMemberName || '')
        };
        // 目标月份也传给识别阶段：让 AI 直接按该月天数输出，避免识别成别的年月
        const tm = this.data.targetMonth || '';
        if (tm) {
          const parts = tm.split('-');
          data.year = Number(parts[0]);
          data.month = Number(parts[1]);
          data.overrideMonth = true;
        }
        wx.cloud.callFunction({
          name: 'importShift',
          data: data,
          success: (res) => {
            const r = res.result || {};
            if (r.ok && r.preview && r.preview.length) {
              // 为每个成员添加 displayName
              const fullPreview = r.preview.map(function (p) {
                p.displayName = getDisplayName(p.name);
                return p;
              });
              // 从日历带入成员时，只保留该成员，避免导入到其他人；
              // 未命中必须中止，绝不能回退到「识别到的第一个人」。
              let matched = fullPreview;
              if (this.data.prefillName) {
                const wanted = this.data.prefillName;
                const hit = fullPreview.filter(function (p) {
                  return p.name === wanted || p.displayName === wanted;
                });
                if (!hit.length) {
                  // 目标昵称与排班表里的真实姓名可能不同（如「东子」vs「吴义芳」）。
                  // 只有识别结果恰好一人时才让用户显式确认“把这行导入到目标成员”，
                  // 绝不自动猜，也不回退到其他人。
                  const only = fullPreview.length === 1 ? fullPreview[0] : null;
                  if (!only) {
                    this.setData({ preview: null, fullPreview: null, showMemberSelect: false, previewNote: '', targetName: '' });
                    wx.showModal({
                      title: '未识别到目标成员',
                      content: '目标成员是「' + wanted + '」，识别结果里没有该成员，且识别到多人。请重新上传或先选择正确成员。',
                      showCancel: false
                    });
                    return;
                  }
                  const onlyName = only.displayName || only.name;
                  wx.showModal({
                    title: '成员名不一致',
                    content: '目标成员是「' + wanted + '」，排班表识别到的是「' + onlyName + '」。' +
                      '如果这是同一个人，可以把「' + onlyName + '」的排班导入到「' + wanted + '」。',
                    confirmText: '按' + wanted + '导入',
                    cancelText: '取消',
                    success: (r) => {
                      if (!r.confirm) {
                        this.setData({ preview: null, fullPreview: null, showMemberSelect: false, previewNote: '', targetName: '' });
                        return;
                      }
                      const mapped = Object.assign({}, only, {
                        name: wanted,
                        displayName: getDisplayName(wanted)
                      });
                      const adjusted = normalizePreviewToMonth([mapped], tm);
                      const note = '识别到「' + onlyName + '」，已按「' + wanted + '」导入' +
                        (adjusted.dropped ? '；忽略 ' + adjusted.dropped + ' 天（该月不存在）' : '');
                      this.setData({
                        preview: adjusted.preview,
                        fullPreview: adjusted.preview,
                        targetName: wanted,
                        previewNote: note
                      });
                      wx.showToast({ title: '已按目标成员导入', icon: 'success' });
                      setTimeout(function () { wx.pageScrollTo({ scrollTop: 99999, duration: 300 }); }, 400);
                    }
                  });
                  return;
                }
                matched = hit;
              }
              // 先锁定成员，再按目标月归一化；避免把其他人的日期也计入“忽略天数”
              const monthAdjusted = normalizePreviewToMonth(matched, tm);
              const previewAll = monthAdjusted.preview;
              const previewNote = monthAdjusted.dropped
                ? ('已按 ' + tm + ' 重写日期；忽略 ' + monthAdjusted.dropped + ' 天（该月不存在）')
                : '';
              const members = matched.map(function (p) { return { name: p.name, displayName: p.displayName }; });
              // 非管理员且有已绑定成员 → 弹出绑定确认
              if (!this.data.isAdmin && this.data.boundMemberName && members.length === 1) {
                const recognized = members[0];
                this.setData({
                  fullPreview: previewAll,
                  previewNote: previewNote,
                  showBindConfirm: true,
                  bindConfirmRecognizedName: recognized.name,
                  bindConfirmRecognizedDisplayName: recognized.displayName
                });
                return;
              }
              if (members.length === 1) {
                // 只有一人 → 直接显示该人预览
                this.setData({
                  preview: matched,
                  fullPreview: matched,
                  previewNote: previewNote,
                  targetName: members[0].name
                });
                wx.showToast({ title: '识别成功', icon: 'success' });
                setTimeout(function () { wx.pageScrollTo({ scrollTop: 99999, duration: 300 }); }, 400);
              } else {
                // 多人 → 弹出选择器
                this.setData({
                  showMemberSelect: true,
                  recognizedMembers: members,
                  fullPreview: previewAll,
                  previewNote: previewNote
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
  // 管理员：整表导入（一次识别、一次提交写入全部成员）
  onSelectAllMembers() {
    const full = this.data.fullPreview || [];
    if (!full.length) return;
    this.setData({
      showMemberSelect: false,
      recognizedMembers: [],
      preview: full,
      fullPreview: full,
      targetName: '全部'
    });
    wx.showToast({ title: '将导入 ' + full.length + ' 位成员', icon: 'none' });
    setTimeout(function () { wx.pageScrollTo({ scrollTop: 99999, duration: 300 }); }, 400);
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
    const list = SHIFT_TYPES.concat(['取消']);
    const cur = list.indexOf(row.shift);
    row.shift = list[(cur + 1) % list.length];
    this.setData({ preview: preview });
  },
  onConfirm() {
    let preview = this.data.preview;
    if (!preview || !preview.length) return;
    const targetName = this.data.targetName;
    const tm = this.data.targetMonth || '';   // 'YYYY-MM'；空 = 按截图识别结果
    // 防御：目标成员与预览成员不一致时禁止提交，避免覆盖错人
    if (targetName && targetName !== '全部' && preview.length === 1 && preview[0].name !== targetName) {
      wx.showModal({
        title: '成员不一致',
        content: '目标是「' + targetName + '」，但预览是「' + preview[0].name + '」。请重新识别，不能覆盖其他成员。',
        showCancel: false
      });
      return;
    }
    // 提交前再按目标月份归一化一次（兜底旧预览/手动改月份）
    if (tm) {
      const n = normalizePreviewToMonth(preview, tm);
      if (n.rewritten || n.dropped) {
        preview = n.preview;
        this.setData({
          preview: preview,
          previewNote: n.dropped ? ('已按 ' + tm + ' 重写日期；忽略 ' + n.dropped + ' 天（该月不存在）') : this.data.previewNote
        });
      }
    }
    const who = (targetName && targetName !== '全部') ? '「' + targetName + '」' : preview.length + ' 位成员';
    const monthLabel = tm ? (tm.slice(0, 4) + ' 年 ' + Number(tm.slice(5, 7)) + ' 月') : '截图识别的月份';
    wx.showModal({
      title: '确认导入',
      content: '将覆盖 ' + who + ' 的 ' + monthLabel + ' 排班，是否继续？' + (tm ? '\n（已选月份：入库日期以所选月份为准）' : ''),
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '导入中...' });
        const payload = { commit: true, preview: preview };
        if (targetName && targetName !== '全部') payload.targetName = targetName;
        if (tm) {
          const parts = tm.split('-');
          payload.year = Number(parts[0]);
          payload.month = Number(parts[1]);
          payload.overrideMonth = true;   // 以所选月份为准：识别出的月份会被重写为本月
        }
        wx.cloud.callFunction({
          name: 'importShift',
          // 未选月份时不传年月：由识别结果里的 year/month 决定（保持旧行为）
          data: payload,
          success: (res) => {
            wx.hideLoading();
            const r2 = res.result || {};
            if (r2.ok) {
              wx.showToast({ title: '导入成功', icon: 'success' });
              this.setData({ preview: null, targetName: '', targetMonth: '', prefillName: '' });
              // 告诉日历页切换到导入的成员与月份
              let switchTo = targetName && targetName !== '全部' ? targetName : (preview[0] && preview[0].name || '');
              if (switchTo) {
                wx.setStorageSync('importTargetMember', switchTo);
                const firstRow = preview[0] && preview[0].rows && preview[0].rows[0];
                const target = { name: switchTo };
                if (tm) {
                  // 已选目标月份：以所选月份为准（云函数按此重写过日期）
                  target.year = Number(tm.slice(0, 4));
                  target.month = Number(tm.slice(5, 7));
                } else if (firstRow && firstRow.date) {
                  target.year = Number(firstRow.date.slice(0, 4));
                  target.month = Number(firstRow.date.slice(5, 7));
                }
                wx.setStorageSync('importTarget', target);
              }
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
