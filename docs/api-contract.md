# 接口契约

> 阶段 4 产出。本项目**没有 HTTP API**，接口 = 6 个微信云函数（`wx.cloud.callFunction`）。
> 入参/出参以真实代码为准；未实现的返回分支标 `[未知]`。错误码是业务字段 `{ok:false,msg}`，不是 HTTP 状态码。

## 1. 接口清单

| 方法 | 名称 | 用途 | 鉴权（现状） | 版本 | 证据 |
|---|---|---|---|---|---|
| callFunction | `login` | 登录、身份判定、管理员自动建档 | 任意微信用户 | 无版本 | `cloudfunctions/login/index.js:9` |
| callFunction | `getShifts` | 按月/按年读全员排班与成员 | 已登录（仅校验 OPENID） | 无 | `getShifts/index.js:7` |
| callFunction | `updateShift` | 单人/多日期改班或清空 | 已登录（**无成员级校验**） | 无 | `updateShift/index.js:6` |
| callFunction | `importShift` | 识别（不落库）/ 确认入库 | 已登录（**无成员级校验**） | 无 | `importShift/index.js:13` |
| callFunction | `manageMember` | 成员列表/绑定/新建/新增/移除/解绑 | 部分动作仅管理员 | 无 | `manageMember/index.js:21` |
| callFunction | `manageMemo` | 个人备忘录取舍改查 | 已登录 + openid 归属 | 无 | `manageMemo/index.js:6` |

## 2. 接口详情

### `login`

- 请求参数：无
- 成功响应：

```json
{ "ok": true, "openid": "<OPENID>", "role": "admin|member", "name": "<成员名或空>", "needBind": false }
```

- 错误：`{ ok:false, msg:'无法获取用户身份' }`
- 鉴权：任意小程序用户；管理员由 `ADMIN_OPENIDS` 白名单或库内 `role==='admin'` 判定
- 幂等性：基本幂等，但每次调用都会 `users.update({role})`（写放大）
- 限流：无
- 副作用：0 条记录且在白名单 → 自动建 `name:'管理员'` 的 user（`index.js:25-31`）；同 openid 多条记录 → 解绑其余（`:46-74`）

### `getShifts`

- 请求参数：

| 名称 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `year` | number | 是 | 4 位年份 |
| `month` | number | 按月查询时是 | 1–12 |
| `yearData` | boolean | 否 | true 时返回该年各成员有数据的月份 |
| `monthOnly` | boolean | 否 | true 时只返回成员列表 |

- 成功响应（按月）：`{ ok:true, members:[{_id,name,role}], shiftsMap:{ "<name>": {"YYYY-MM-DD":"<班次>"} } }`
- 成功响应（yearData）：`{ ok:true, members:[...], memberMonths:{ "<name>":[1,2,3] } }`
- 错误：`未登录`、`缺少月份参数`
- 鉴权：仅登录；**全员可读全员排班**（设计如此）
- 幂等性：只读
- 已知限制：`users.limit(100)`、`shifts.limit(1000)`、yearData `limit(2000)`（`index.js:12,23,45`）

### `updateShift`

- 请求参数：

| 名称 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 目标成员**正式名**（按 `users.name` 查） |
| `shift` | string | 否 | 班次文本；`''`/空表示清空 |
| `dates` | string[] | 二选一 | `YYYY-MM-DD` 列表 |
| `date` | string | 二选一 | 单日期兼容字段 |

- 成功响应：`{ ok:true, count:<处理天数> }`
- 错误：`未登录`、`参数不完整`、`用户不存在，请先登录`、`目标成员不存在`
- 鉴权：**只校验登录，不校验“是否本人/管理员”**（`index.js:21` 注释自述）
- 幂等性：upsert；`shift=''` 删除记录 → 重复调用结果一致
- 副作用：每个日期写一条 `changeLog`（失败忽略）
- 无频率限制；无日期格式校验

### `importShift`

- 第一步（识别，`commit` 不为 true）：

| 名称 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `fileID` | string | 是 | 云存储 fileID |
| `sourceType` | string | 否 | `image`（默认）/ `excel`（空实现） |
| `targetName` | string | 否 | 只保留该成员（`全部`/空 = 整表） |

- 第一步成功：`{ ok:true, preview:[{ name, month, rows:[{date, shift}] }] }`
- 第二步（入库，`commit:true`）：

| 名称 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `preview` | array | 是 | 第一步结果（前端可改） |
| `year` / `month` | number | 否 | **当前服务端完全忽略**，年份取 `new Date().getFullYear()` |

- 第二步成功：`{ ok:true, count, msg, newMembers:[name] }`
- 错误：`缺少文件`、`识别失败：…`、`未识别到「X」的排班。本表识别到成员：…`、`未识别到排班内容…`、`预览为空`
- 鉴权：**只校验登录**；可写任意成员、可自动建成员
- 幂等性：按 `userId+date` upsert；**不清空未出现的日期**（不是真正覆盖）
- 外部依赖：火山方舟；重试 3 次（仅 429/5xx/繁忙），单次超时 60s
- 已知实现差异：`parseExcel` 返回 `[]`；配置缺失回退 `mockPreview()`

### `manageMember`

- 请求参数：

| 名称 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | string | 是 | `list` / `bindWechat` / `createAndBind` / `add` / `remove` / `unbind` |
| `name` | string | 视动作 | 成员名（bind/create/add） |
| `id` | string | 视动作 | 成员 `_id`（remove/unbind） |
| `wxId` | string | 否 | `add` 时写入，当前未使用 |

- 响应：
  - `list`：`{ ok:true, members:[{_id,name,wxId,role,openid,createdAt}] }`（**含 openid**）
  - `bindWechat`：`{ ok:true, openid, name, role }`；失败 `成员不存在` / `该成员已被其他用户绑定，请联系管理员解绑`
  - `createAndBind`：`{ ok:true, openid, name, role, _id }`；失败 `alreadyBound` / `请输入成员昵称` / `该昵称已被使用`
  - `add`：`{ ok:true }`；失败 `缺少姓名` / `该姓名已存在`（仅管理员）
  - `remove`：`{ ok:true }`；失败 `缺少id` / `成员不存在` / `不能移除管理员`（仅管理员；**级联删除 shifts**）
  - `unbind`：`{ ok:true, name }`；失败 `缺少成员id` / `成员不存在`（仅管理员）
- 鉴权：`list`/`bindWechat`/`createAndBind` 全员；其余 `checkAdmin`
- 幂等性：`bindWechat` 对已绑定同一 openid 幂等；`createAndBind` 第二次返回 `alreadyBound`

### `manageMemo`

- 请求参数：

| 名称 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | string | 是 | `list` / `add` / `update` / `remove` |
| `text` | string | add/update 必填 | 备忘录原文 |
| `id` | string | update/remove 必填 | 备忘录 `_id` |

- 响应：
  - `list`：`{ ok:true, memos:[{_id,text,createdAtStr}] }`（按 `createdAt` 倒序，上限 100）
  - `add`：`{ ok:true }`；失败 `内容为空`
  - `update` / `remove`：`{ ok:true }`；失败 `缺少id` / `备忘录不存在` / `无权限修改|删除`
- 鉴权：仅登录；`update`/`remove` 校验 `memo.openid === OPENID`
- 幂等性：`add` 每次新增；`update` 幂等
- 已知问题：`createdAtStr` 取 `createdAt.$date`（`index.js:23-25`），云函数中通常是 Date 对象 → 可能恒为空

## 3. 兼容性约定

- 响应字段为业务约定，**无版本号**；已知消费方：
  - `getShifts` 的 `members/shiftsMap/memberMonths` 被 `calendar.js`、`mine.js` 共 3 处消费；
  - `manageMember` 的 `members[].openid` 被登录页用来判断“哪些成员未绑定”。
- 新增字段向后兼容；**重命名/删除字段必须同时改 3 处前端**。
- 破坏性变更（如补权限校验）需要与现有前端调用参数保持一致，否则线上旧版小程序会直接失败。

## 4. 证据来源

- 6 个云函数源码（逐分支阅读）
- 前端调用点：`calendar.js:82,94,204,247,336`、`login.js:41,74,119,139,330,353`、`import.js:101,238`、`memo.js:36,100,121,151`、`mine.js:20`、`members.js:16,42,66`

## 5. 待确认事项

1. 是否为 `updateShift`/`importShift` 增加成员级权限（Q-001/Q-002）。
2. 旧版本小程序兼容策略：加校验后，旧前端是否仍能正常使用（阶段 6 评估）。
3. 是否需要给 `importShift` 增加频率/额度限制（阶段 6）。
