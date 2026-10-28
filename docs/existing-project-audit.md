# 接管审计报告（Existing Project Audit）

> 阶段 1 产出。本阶段只读：不写代码、不装依赖、不跑迁移。
> 每条结论标 `[已确认]` / `[高度可能]` / `[未知]` / `[风险]`；`[已确认]` 必带文件路径或命令输出。

- 项目名称：日历排班小程序（calendar-shift-miniapp）
- 项目路径：`G:\AI编程结构定义\日历排班小程序`
- 审计时间：2026-10-25 15:10–16:20
- 审计执行：DeepSeek Harness（本机，只读）
- 审计范围：只读（源码、配置、Git、静态脚本校验）；未启动微信开发者工具、未访问云环境

## 1. 结论摘要

- 是否具备安全接手条件：**是**（备份与 Git 基线已完成，工作区干净）
- 阻断项（上线前必须先解决）：
  1. `updateShift` / `importShift` 后端无权限校验，普通成员可改任意人排班（安全 + 数据完整性）；
  2. AI API Key 存在于 **已被 Git 跟踪** 的 `人工必填参数清单.json`（含 `HEAD` 版本），需轮换并移出跟踪；
  3. 导入并非“覆盖”，改班后重导会残留旧班次，且导入年份写死；
  4. 普通成员无法清空某天排班、无法设置本月未出现过的班次。
- 一句话现状：一个可运行、已上线的微信云开发小程序（6 云函数 + 6 页面），核心链路（登录绑定 → 导入识别 → 日历查看/改班 → 备忘录）齐全；但**权限边界、数据覆盖语义、跨年/跨月处理**存在系统性缺陷，且无任何自动化测试与项目文档。
- 建议的下一步：阶段 2 出模块地图（CodeGraph 降级）→ 阶段 3 固化技术栈/启动方式/已知问题 → 阶段 4 重建文档并问 UI 决策 → 阶段 5 就权限与导入范围做产品决策。

## 2. Git 与备份

| 项 | 实际值 | 证据 |
|---|---|---|
| 是否 Git 仓库 | 是 | `git rev-parse --is-inside-work-tree` |
| 当前分支 | `master`（无 remote） | `git status --short --branch`、`git remote -v` 为空 |
| HEAD commit | `6baa8f7 接手前基线：确认的线上版本快照（2026-10-25）` | `git log -1 --oneline` |
| 接手前 commit | `63c2d12 Initial Commit`（唯一历史提交） | `git log` |
| remote | 无 | `git remote -v` |
| 接手时未提交文件数 | 34（23 修改 / 9 删除 / 2 新增目录） | `git status --short` |
| 基线 tag | `baseline-before-takeover-20261025` | `git tag` |
| 备份位置 | `D:\Backup\日历排班小程序-backup-20261025` | 本机 |
| 备份校验 | 142 文件 / 202.8 KB；robocopy 回查 0 差异；SHA256 142/142 一致 | 本机脚本输出 |

## 3. 未提交改动

| 文件/目录 | 类型 | 处置 |
|---|---|---|
| `cloudfunctions/{login,manageMember,updateShift}/index.js`、`miniprogram/{app.json,config.js}`、`pages/{calendar,login,import,members,mine}/*`、`utils/shift.js` | 修改（23） | 用户 2026-10-25 确认「工作区=线上版本」，已提交为基线 `6baa8f7` |
| `miniprogram/pages/edit/*`、`miniprogram/components/shift-tag/*`、`miniprogram/utils/format.js` | 删除（9） | 同上；代码已改用日历内联弹窗与自有样式 |
| `cloudfunctions/manageMemo/`、`miniprogram/pages/memo/` | 新增（2 目录 / 6 文件） | 同上；备忘录功能 |
| `cloudfunctions/*/config.json`、`project.private.config.json` | 被 `.gitignore` 忽略，未入库 | 保持不入库；部署时由 `同步参数.bat` 生成 |

> 处置结论：用户已明确授权提交基线，工作区现已干净；**AI 未擅自清理或改写任何未提交内容**。

## 4. 敏感文件（只写路径与类型，不写内容）

| 路径 | 类型 | 是否已入库 | 处置建议 |
|---|---|---|---|
| `人工必填参数清单.json` | 含云环境 ID、管理员 openid、**AI Vision API Key 明文** | **是**（`HEAD` 与基线均含） | 立即轮换 Key；`git rm --cached` + 加入 `.gitignore`；历史清理需用户单独授权 |
| `人工必填参数清单.md` | 含 API Key 片段 | 是 | 改为只写变量名与占位符 |
| `cloudfunctions/{login,manageMember,updateShift,importShift}/config.json` | 管理员 openid / AI Key | 否（已被 `.gitignore`） | 保持；仅在本机与云端控制台保存 |
| `project.private.config.json` | 本机 AppID/编译配置 | 否 | 保持忽略 |
| `miniprogram/config.js` | 云环境 ID、班次配置、成员别名 | 是（无密钥） | 可保留；注意 `MEMBER_ALIAS` 属成员昵称，非敏感但可考虑收口 |
| `project.config.json` | AppID `wxac709a2b3a7c6700` | 是 | AppID 非密钥，可保留 |

补充：`[已确认]` `git ls-files` 输出包含 `人工必填参数清单.json`，且 `git show HEAD:...` 中存在 `AI识别API_KEY` 字段与 46 字符的 `ark-` 开头的值（未打印内容）。

补充（2026-10-25 复核）：对本轮新增的 `docs/` 全部文件做了密钥/身份扫描——`ark-` 密钥模式命中 0 个文件、管理员 openid 命中 0 个文件、无 UTF-8 BOM。敏感值仍只存在于根目录两份《人工必填参数清单》中。

## 5. AI 实际访问范围

| 范围 | 内容 | 说明 |
|---|---|---|
| 可读目录 | 整个项目（含 `.git`、`miniprogram/`、`cloudfunctions/`、根目录配置） | 当前文件策略为 danger-full-access |
| 不可读/被忽略 | 无 | 项目无 `node_modules`；`cloudfunctions/*/config.json` 可读但属敏感，仅在必要处引用变量名 |
| 大体量/二进制 | 无 | 项目共 142 个文件、202.8 KB（不含 `.git` 时更小） |
| 未访问 | 微信云开发控制台、云数据库、线上云函数配置 | 需用户授权或提供截图 |

## 6. CodeGraph 状态

| 项 | 结果 |
|---|---|
| CLI 是否可用 | **否**：`codegraph` 不是可识别的命令 |
| `.codegraph/` 是否存在 | 否 |
| 索引是否覆盖本项目 | 不适用 |
| 真实查询样例 | 无（不伪造） |
| 若不可用，原因与降级方案 | 未安装。按流程 5.4 降级：脚本统计 + 逐文件源码阅读 + 检索；阶段 2 报告中明确写“未使用 CodeGraph” |

## 7. 初步风险（按“先修哪个”排序）

| # | 风险 | 证据 | 影响 | 优先级 |
|---|---|---|---|---|
| 1 | 排班修改零权限校验 | `cloudfunctions/updateShift/index.js:21` 注释明写“所有登录用户均可修改排班（权限由前端控制入口）” | 任意成员可改任意人排班；与最初设计第七节冲突 | 高 |
| 2 | 导入写入零权限校验 + 可自动建成员 | `cloudfunctions/importShift/index.js:73-99`；`miniprogram/pages/import/import.js:160-173` | 普通成员可覆盖同事整月排班、批量制造成员记录 | 高 |
| 3 | AI Key 入库 | `人工必填参数清单.json:47`；`git ls-files` | 密钥永久留在 Git 历史，可被任何拿到仓库的人使用 | 高 |
| 4 | 导入“假覆盖” | `importShift/index.js:100-113`（只 upsert 不删除）；`:183`（预览过滤空班次）；`import.js:233` 文案“将覆盖” | 改班后重导残留旧班次，排班错误且难发现 | 高 |
| 5 | 导入年份/月份写死 | `importShift/index.js:164-180` 用当前年 + AI 月；前端 `year/month` 被忽略（`import.js:240`） | 跨年/上月排班写入错误日期 | 高 |
| 6 | 成员无法取消/新增班次 | `calendar.js:156-179`：非管理员选项 = 已用班次 + 年假 | 设错清不掉；新班次选不到 | 高 |
| 7 | 角色可被数据放大 | `login/index.js:39`、`manageMember/index.js:44-48,60-64` 信任/保留 `doc.role` | 存在未绑定 admin 记录时可被绑定成管理员（当前 UI 不可达） | 中 |
| 8 | openid 全员可见 | `manageMember/index.js:28-35`、`members.wxml:13-16` | 隐私暴露（无直接提权路径） | 中 |
| 9 | 静默截断 | `getShifts/index.js:45` `limit(1000)`；`:23` `limit(2000)` | 约 32 人×31 天即丢数据 | 中 |
| 10 | 姓名归位误判 | `importShift/index.js:60,241-265`（包含匹配、编辑距离≤2、同姓唯一归位） | 可能把 A 的表写进 B | 中 |
| 11 | 配置缺失回退假数据 | `importShift/index.js:130-132` → `mockPreview()` | 生产环境写入假排班且提示“识别成功” | 中 |
| 12 | 备忘录忽略年份 / 时间戳空 | `calendar.js:16-23,209-211`；`memo.js:12-16,53-65`；`manageMemo/index.js:23-25` | 备忘录跨年重复；时间显示为空 | 中 |
| 13 | 云函数超时未知 | 识别实测 10–36s；默认超时 3s | 超时则导入失败或被平台杀掉 | 未知→待确认 |
| 14 | 无频率/额度限制 | 所有云函数入口 | 可刷付费视觉 API | 中 |
| 15 | 无测试/无文档/无 CI | 0 个测试文件；无 `docs/` | 回归无保障，接手成本高 | 中 |

> 完整功能级问题清单在阶段 3 写入 `docs/known-issues.md`；本表只列接管阶段的高危项。

## 8. 阶段 1 四问回答

- **A. 是否处于安全、可检查的状态**：是。Git 可回退（基线 `6baa8f7` + tag），整包备份已校验；工作区干净；无未保护的他人改动。唯一例外是密钥已入库（见第 4 节）。
- **B. 实际能访问哪些目录和文件**：全项目 142 个文件均可读；无 `node_modules`；云环境不可访问；`cloudfunctions/*/config.json` 可读但按敏感信息处理。
- **C. CodeGraph MCP 是否已连接且可调用**：否，未安装；已声明降级，报告中不声称使用图谱。
- **D. 下一步检查计划**：① 阶段 2 用脚本+通读产出 `module-map.md`（入口、模块、调用链、数据流、影响面）；② 阶段 3 固化技术栈、启动方式、已知问题、配置项；③ 阶段 4 反向恢复文档并执行 UI 决策门。

## 9. 审计清单（本阶段已完成/待补）

- [x] 目录结构与项目说明（已确认与代码不一致）
- [x] 依赖清单与锁文件（6 个云函数 `package.json`；无 lock 文件）
- [x] 入口、路由、组件、服务层（`app.json` 6 页面；6 云函数；1 组件）
- [x] 数据模型（`users/shifts/memos/changeLog`）、接口（云函数入参/出参）、部署配置
- [x] Git 状态与已有文档
- [x] 敏感文件与配置项
- [x] 未验证项与未知项（云环境、超时配置、真机行为）
- [ ] （待补）运行时验证：需开发者工具登录与云环境访问，阶段 3/7 完成

## 10. 证据来源

- 命令输出：`git status --short --branch`、`git log`、`git remote -v`、`git tag`、`git ls-files`、`git show HEAD:人工必填参数清单.json`（仅判断字段存在）、`robocopy` 汇总与 SHA256 比对、Node 脚本校验（JSON 22/22、事件处理器 0 缺失、require 0 缺失、6 云函数均被调用）
- 文件路径：`miniprogram/**`、`cloudfunctions/**`、`人工必填参数清单.md/json`、`.gitignore`、`project.config.json`
- 截图/日志：无（本轮未启动开发者工具）

## 11. 待确认事项

1. 权限模型（Q-001/Q-002）：成员是否只能改自己？非管理员能否导入他人/整表？
2. 删除成员时历史排班保留还是删除（Q-003）？
3. 线上云函数超时/内存与数据库实际行数（Q-006）。
4. 开发者工具登录授权，用于编译与真机验证（Q-010）。
