# 模块地图（Module Map）

> 阶段 2 产出。**本轮未使用 CodeGraph**：`codegraph` 命令不存在、项目无 `.codegraph/`（已按流程 5.4 声明降级）。
> 数据来源：逐文件源码阅读 + 脚本统计（JSON 解析、事件处理器、`require`、云函数调用关系）。
> 每条结论标 `[已确认]` / `[高度可能]` / `[未知]` / `[风险]`。

## 1. 入口清单

| 类型 | 入口 | 文件:行 | 说明 |
|---|---|---|---|
| 启动 | `App.onLaunch` | `miniprogram/app.js:10` | 初始化 `wx.cloud`（env 来自 `config.js`），从本地 `session` 恢复身份 |
| 路由 | 6 个页面 | `miniprogram/app.json:2-9` | calendar / login / import / members / mine / memo |
| 路由 | tabBar 3 项 | `miniprogram/app.json:16-25` | 日历 / 导入 / 我的 |
| 页面事件 | 各页 `bindtap`/`bindinput` | 7 个 wxml | 脚本校验：事件处理器 **0 缺失** |
| 组件事件 | `selectday`、`longpressday` | `components/calendar/calendar.js:6-19` | 日历格点击/长按，由 `pages/calendar` 接收 |
| 云函数入口 | `exports.main` × 6 | `cloudfunctions/*/index.js` | login / getShifts / updateShift / importShift / manageMember / manageMemo |
| 定时任务 | 无 | — | `[已确认]` 无 timer/触发器配置 |
| CLI | `同步参数.bat` → `sync-config.py` | 根目录 | 把《人工必填参数清单.json》分发到前端/云函数配置 |

## 2. 目录与模块职责

| 目录/模块 | 职责 | 关键文件 | 对外暴露 | 不应负责什么 |
|---|---|---|---|---|
| `miniprogram/app.js` | 云开发初始化、登录态恢复 | 23 行 | `globalData` | 业务逻辑 |
| `miniprogram/config.js` | 自动生成的参数（env/班次/颜色/别名/样式） | 45 行 | `module.exports` | 手改（由脚本生成） |
| `utils/calendar.js` | 月网格生成（周一起始、含上月补位）、日期格式化 | 28 行 | `getMonthGrid`/`fmtDate`/`getToday` | 班次与业务 |
| `utils/shift.js` | 班次常量、颜色、显示名、别名 | 23 行 | `SHIFT_TYPES`/`getShiftColor`/`getDisplayName` | 权限判断 |
| `components/calendar` | 纯展示月历 + 点击/长按事件 | 4 文件 | properties `cells` | 数据请求 |
| `pages/login` | 登录、绑定成员、未绑定用户的导入入口 | 396 行 | 页面 | 长期承载第二套导入流程（重复实现） |
| `pages/calendar` | 首页：成员切换、月历、点选/批量改班、备忘录展示、删除成员 | 401 行 | 页面 | 权限兜底（依赖后端，而后端未校验） |
| `pages/import` | 导入页：选图 → 识别 → 选人 → 校对 → 入库 | 261 行 | 页面 | 直接操作数据库 |
| `pages/members` | 管理员成员列表、解绑、移除 | 83 行 | 页面 | 新增成员（后端有 `add`，前端无入口） |
| `pages/mine` | 身份、当月统计、入口聚合 | 48 行 | 页面 | 复杂统计 |
| `pages/memo` | 个人备忘录取舍改查、按月分组 | 169 行 | 页面 | 年份建模 |
| `cloudfunctions/login` | openid→身份、白名单判定、多记录合并 | 82 行 | 云函数 | 成员管理 |
| `cloudfunctions/getShifts` | 按月/按年读全员排班与成员表 | 57 行 | 云函数 | 权限过滤（全员可读是设计） |
| `cloudfunctions/updateShift` | 单/多日期改班、删除、写 changeLog | 54 行 | 云函数 | **权限校验（缺失）** |
| `cloudfunctions/importShift` | 视觉识别、姓名归位、覆盖入库、自动建成员 | 371 行 | 云函数 | **成员管理职责（越界写入 users）** |
| `cloudfunctions/manageMember` | list/bind/create/add/remove/unbind | 112 行 | 云函数 | 导入业务 |
| `cloudfunctions/manageMemo` | 个人备忘录 CRUD（按 openid 隔离） | 65 行 | 云函数 | 排班业务 |
| 根目录工具 | 参数总分发、人工必填清单、项目说明 | `sync-config.py`、`人工必填参数清单.*`、`初始设计稿.md` | — | 文档已与代码漂移 |

## 3. 关键业务调用链

### 链路 1：登录与成员绑定

```text
小程序启动 app.onLaunch → 读本地 session
  → pages/login.onShow/onLogin → wx.cloud.callFunction('login')
  → login.main：getWXContext().OPENID → 清洗 openid → 比对 ADMIN_OPENIDS
  → db.users 查询（0/1/多条）→ 自动建管理员 / needBind / 合并多记录
  → 返回 {ok, openid, role, name, needBind}
  → 前端写 storage.session → switchTab 日历
  → 未绑定：manageMember.list → 选已有成员 bindWechat / 新建 createAndBind
```

| 跳 | 符号 | 文件:行 | 证据 |
|---|---|---|---|
| 1 | `onLogin` | `miniprogram/pages/login/login.js:38` | 源码 |
| 2 | `login.main` | `cloudfunctions/login/index.js:9` | 源码 |
| 3 | `users.where/add/update` | `cloudfunctions/login/index.js:18,27,40` | 源码 |
| 4 | `bindWechat` / `createAndBind` | `cloudfunctions/manageMember/index.js:38,51` | 源码 |
| 5 | `wx.setStorageSync('session')` | `miniprogram/pages/login/login.js:56,168,390` | 源码 |

- 结论类型：[已确认]
- 未覆盖的分支：同 openid 多条记录的合并（`login/index.js:46-74`）无运行数据，未验证。
- [风险] 角色只由白名单/库内 `role` 决定，库内 `role` 又可被 `bindWechat` 保留（见审计报告第 7 节 #7）。

### 链路 2：排班截图导入（识别 → 校对 → 入库）

```text
pages/import.uploadAndRecognize → wx.cloud.uploadFile
  → importShift.main(commit=false) → recognizeImage
  → cloud.downloadFile → base64 → callVisionWithRetry → callVisionAPI(https POST ark)
  → parsePreview(JSON) → cleanText / NORMALIZE → days[31] → rows
  → translateAlias → surnameFallback → normalizeName（对照 users）
  → 同名合并 → 返回 preview
前端：单人直接用 / 多人弹窗选一人 / 非管理员已绑定则替换为自己
  → onConfirm → importShift.main(commit=true)
  → users 查询/自动建档 → shifts 逐日 upsert
```

| 跳 | 符号 | 文件:行 | 证据 |
|---|---|---|---|
| 1 | `uploadAndRecognize` | `miniprogram/pages/import/import.js:87` | 源码 |
| 2 | `importShift.main` | `cloudfunctions/importShift/index.js:13` | 源码 |
| 3 | `recognizeImage` | `cloudfunctions/importShift/index.js:128` | 源码 |
| 4 | `callVisionWithRetry` / `callVisionAPI` | `cloudfunctions/importShift/index.js:288,303` | 源码 |
| 5 | `parsePreview` | `cloudfunctions/importShift/index.js:206` | 源码 |
| 6 | `translateAlias` / `surnameFallback` / `normalizeName` | `cloudfunctions/importShift/index.js:229,242,252` | 源码 |
| 7 | 入库 `shifts` upsert | `cloudfunctions/importShift/index.js:100-113` | 源码 |
| 8 | `onConfirm` | `miniprogram/pages/import/import.js:226` | 源码 |

- 结论类型：[已确认]（静态）/ [未知]（AI 实际返回形态与耗时）
- 未覆盖的分支：Excel（`parseExcel` 空实现）、`targetName` 过滤（前端不传）、重试链（需真实限流）。
- [风险] 只 upsert 不删除 → “覆盖”语义不成立；年份取服务端当前年。

### 链路 3：日历查看与改班

```text
pages/calendar.onShow（重置为当前年月）→ loadShifts
  → getShifts.main(year, month) → users.limit(100) + shifts 范围查询(limit 1000)
  → idToName 映射 → shiftsMap[name][date] → 返回
  → applyShifts：白名单清洗班次文本 → 上色 → setData
  → updateShiftDisplay：按“该成员已用班次 + 年假”生成选项/图例
点日期 onTapDay → openPicker → onPickShift
  → updateShift.main(name, shift, dates)
  → users.where(openid) / users.where(name) → shifts 查询→update/add/remove + changeLog
  → 重新 loadShifts
```

| 跳 | 符号 | 文件:行 | 证据 |
|---|---|---|---|
| 1 | `onShow` / `loadShifts` | `miniprogram/pages/calendar/calendar.js:53,93` | 源码 |
| 2 | `getShifts.main` | `cloudfunctions/getShifts/index.js:7` | 源码 |
| 3 | `applyShifts` / `updateShiftDisplay` | `miniprogram/pages/calendar/calendar.js:136,151` | 源码 |
| 4 | `onTapDay` / `openPicker` / `onPickShift` | `miniprogram/pages/calendar/calendar.js:272,311,324` | 源码 |
| 5 | `updateShift.main` | `cloudfunctions/updateShift/index.js:6` | 源码 |
| 6 | shifts upsert/remove + changeLog | `cloudfunctions/updateShift/index.js:25-52` | 源码 |

- 结论类型：[已确认]
- 未覆盖的分支：管理员切换成员、批量多选、跨月灰色格（代码允许写入）。
- [风险] `updateShift` 无权限校验；`getShifts` 有 1000 条截断。

### 链路 4：备忘录

```text
pages/memo.onAdd → 前端校验“几月几号” → manageMemo.add
  → memos.add({openid, text, createdAt})
pages/calendar._loadMemosForMonth → manageMemo.list（按 openid）
  → 前端按“月份”过滤 + 按“日”排序 → 展示
```

- 证据：`miniprogram/pages/memo/memo.js:67`、`cloudfunctions/manageMemo/index.js:6`、`miniprogram/pages/calendar/calendar.js:189-224`
- 结论类型：[已确认]；[风险] 无年份字段 → 跨年串月；`createdAt.$date` 取值方式 `[高度可能]` 恒为空。

## 4. 依赖关系与异常

| 类型 | 位置 | 说明 | 风险 |
|---|---|---|---|
| 循环依赖 | — | 脚本校验 `require` 全部可解析；未发现环 | 低 |
| 跨层直连 | `importShift/index.js:90-99` | 导入函数直接创建 `users`，绕过 `manageMember` | 成员表可被任意导入污染 |
| 跨层直连 | `updateShift/index.js:13-19` | 直接按 name 查 users，未复用成员校验 | 姓名重名/改名时行为不确定 |
| 重复实现 | `login.js:174-386` vs `import.js:1-261` | 两套导入流程，行为不一致（绑定名可改、压缩策略不同） | 改一处漏一处 |
| 超大函数/模块 | `importShift/index.js`（371 行）、`calendar.js`（401 行） | 识别、归位、入库、网络全在一个文件 | 可维护性差、测试困难 |
| 高风险耦合 | `config.js` ↔ 各 `config.json` ↔ 清单 | 参数由脚本分发；`SHIFT_TYPES`（11 项）与页面硬编码 `DEFAULT_SHIFTS`（休/白班/晚班/年假/取消）不一致 | 配置改了页面不跟着变 |
| 权限分散 | 仅 `manageMember.checkAdmin` 一处 | `updateShift`、`importShift` 完全未复用 | 权限边界形同虚设 |

## 5. 数据流

| 数据 | 来源 | 处理 | 落点 | 证据 |
|---|---|---|---|---|
| openid / 身份 | `cloud.getWXContext()` | 白名单清洗比对、users 查询 | 前端 `storage.session`、`users.role` | `login/index.js:10-40` |
| 成员 | 管理员绑定/新建、导入自动建档、登录自动建管理员 | 按 name 去重 | `users`（name, openid, role, wxId, createdAt） | `manageMember/index.js:51-87`、`importShift/index.js:90-99` |
| 排班 | 截图 → AI → preview → commit；或日历点选 | 班次文本清洗、按 userId+date upsert | `shifts`（userId, date, shiftType, updatedBy, updatedAt） | `importShift/index.js:100-113`、`updateShift/index.js:25-41` |
| 修改日志 | updateShift | 每日一条（失败忽略） | `changeLog`（userId,date,oldShift,newShift,operator,time） | `updateShift/index.js:43-50` |
| 备忘录 | 手输文本 | 前端校验“几月几号”，不做年份建模 | `memos`（openid, text, createdAt） | `memo.js:67-138`、`manageMemo/index.js:30-37` |
| 参数 | 《人工必填参数清单.json》 | `sync-config.py` 分发 | `miniprogram/config.js` + 云函数 `config.json` | `sync-config.py:9-41` |

## 6. 修改影响面样例

- 符号：`getShifts.main`（`cloudfunctions/getShifts/index.js:7`）
- 直接调用方：
  - `miniprogram/pages/calendar/calendar.js:82`（`loadYearData`，`yearData:true`）
  - `miniprogram/pages/calendar/calendar.js:94`（`loadShifts`，按月）
  - `miniprogram/pages/mine/mine.js:20`（当月统计）
- 间接影响模块：`calendar.applyShifts` / `updateShiftDisplay` / `_loadMemosForMonth` / `hasData` 空态；`mine.summary` 统计。
- 相关测试：无（0 个测试文件）。
- 查询方式：`Select-String -Pattern "name: 'getShifts'" miniprogram -Recurse`（CodeGraph 不可用，降级检索）。
- 结论：[已确认] 返回结构 `{ok, members, shiftsMap}` 或 `{ok, members, memberMonths}` 被 3 处消费；改字段必须同步改 3 处。

## 7. 静态分析盲区

| 盲区 | 位置 | 为什么静态分析看不到 | 建议验证方式 |
|---|---|---|---|
| 云函数运行时 | 6 个 `exports.main` | 依赖云环境、权限、超时、内存 | 云开发控制台 + 真机调用 |
| AI 返回内容 | `callVisionAPI` | 模型输出非确定（列错位、少天、多天） | 用真实截图跑 3–5 次，记录 preview |
| 云数据库索引/条数 | `users`/`shifts` | 线上数据不可见 | 控制台导出或计数 |
| 基础库行为 | 长按后是否仍触发 tap | 依赖基础库实现 | 真机/开发者工具验证 |
| 运行时样式 | WXSS | 机型、字号、安全区差异 | 开发者工具 + 真机截图（阶段 8） |
| 本地缓存被篡改 | `storage.session` | 前端可改 role/name | 后端权限校验必须独立成立 |

## 8. 证据来源

- `codegraph explore`：**未执行（CLI 不存在）**
- `codegraph callers/callees/impact`：**未执行**
- 源码文件：`miniprogram/**`（17 js / 7 wxml / 8 wxss）、`cloudfunctions/**`（6 函数）、根目录配置与脚本
- 脚本校验输出：JSON 22/22 可解析；wxml 事件处理器 0 缺失；`require` 0 缺失；6 个云函数均被前端调用

## 9. 待确认事项

1. `updateShift` / `importShift` 的权限边界（Q-001/Q-002）。
2. 线上 `getShifts` 是否已接近 1000 条上限（Q-006）。
3. 导入是否必须支持 Excel（Q-007）。
