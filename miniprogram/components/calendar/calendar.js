// 日历组件：渲染月历网格 + 批量/导入按钮格（props: cells，事件: selectday / longpressday / batch / import）
Component({
  properties: {
    cells: { type: Array, value: [] }
  },
  methods: {
    onTap(e) {
      if (e.currentTarget.dataset.batch) {
        this.triggerEvent('batch');
        return;
      }
      if (e.currentTarget.dataset.import) {
        this.triggerEvent('import');
        return;
      }
      this.triggerEvent('selectday', {
        date: e.currentTarget.dataset.date,
        shift: e.currentTarget.dataset.shift || '',
        inMonth: e.currentTarget.dataset.inmonth
      });
    },
    onLongPress(e) {
      if (e.currentTarget.dataset.batch || e.currentTarget.dataset.import) return;
      // 长按 → 进入多选模式（由父页面处理）
      this.triggerEvent('longpressday', {
        date: e.currentTarget.dataset.date,
        inMonth: e.currentTarget.dataset.inmonth
      });
    }
  }
});
