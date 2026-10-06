// 日历组件：渲染月历网格（props: cells，事件: selectday）
Component({
  properties: {
    cells: { type: Array, value: [] }
  },
  methods: {
    onTap(e) {
      this.triggerEvent('selectday', {
        date: e.currentTarget.dataset.date,
        shift: e.currentTarget.dataset.shift || ''
      });
    },
    onLongPress(e) {
      // 长按 → 进入多选模式（由父页面处理）
      this.triggerEvent('longpressday', {
        date: e.currentTarget.dataset.date
      });
    }
  }
});
