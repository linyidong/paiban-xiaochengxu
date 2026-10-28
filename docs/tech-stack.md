# 技术栈与选型记录

> 阶段 3 产出。**只描述现状**，不写目标选型（目标见 `target-architecture.md`，阶段 6）。
> 版本以配置文件为准，逐项给证据。

## 1. 当前技术栈

| 层次 | 技术 | 版本 | 证据（文件/命令） | 备注 |
|---|---|---|---|---|
| 前端 | 微信小程序原生（WXML + WXSS + JavaScript） | 基础库 `3.17.3` | `project.config.json:7`、`project.private.config.json:2` | 无框架、无构建链、无前端 npm 依赖 |
| 前端 | 微信小程序 API | `wx.cloud`、`chooseMedia`、`chooseMessageFile`、`compressImage` | 源码多处 | 需基础库 2.2.3+ |
| 后端 | 微信云开发云函数（Node.js） | `wx-server-sdk ~2.6.3` | `cloudfunctions/*/package.json` | 云端运行时版本 `[未知]`（控制台可见） |
| 后端 | 云函数 HTTP 客户端 | Node 内置 `https` | `cloudfunctions/importShift/index.js:5` | 零依赖调用视觉 API |
| 数据库 | 微信云数据库 | 云开发内置 | `cloud.init` + `db.collection(...)` | 集合：`users`、`shifts`、`memos`、`changeLog` |
| 外部服务 | 火山方舟 chat/completions（视觉） | 端点 `ark.cn-beijing.volces.com`；模型名见清单 | `cloudfunctions/importShift/config.json`（不入库） | 超时/配额由平台决定 |
| 部署 | 微信开发者工具（上传小程序 + 上传云函数） | 本机安装包 `2.02.2608080_win32_x64` | `D:\Software\weixin-kaifagongju\` | 当前未登录 |
| 参数分发 | Python 脚本 | 本机 Python `3.12.9` | `sync-config.py`、`同步参数.bat` | 需本机 Python |
| 测试 | **无** | — | 全项目 0 个测试文件 | 无 CI、无 lint 配置 |

## 2. 关键依赖

| 依赖 | 版本 | 用途 | 是否关键 | 维护状态/风险 |
|---|---|---|---|---|
| `wx-server-sdk` | `~2.6.3` | 云函数访问云数据库/存储 | 是 | 版本较旧；无 lock 文件，云端安装可能漂移 |
| `xlsx` | `^0.18.5` | 原计划解析 Excel | 否 | **完全未使用**（`parseExcel` 空实现），增加包体/部署时间 |
| 微信基础库 | `3.17.3` | 小程序运行环境 | 是 | 随用户微信版本，需真机验证 |
| Node.js（本地） | `v22.14.0` | 仅本地脚本/工具 | 否 | 云函数运行时以云端为准 |
| Python | `3.12.9` | 运行 `sync-config.py` | 是（改参数时） | 仅 Windows 本机脚本 |

> 无 `package-lock.json` / `yarn.lock`，云函数依赖版本只由 `package.json` 的 `~`/`^` 约束，存在不可复现风险。

## 3. 本地开发环境

- 语言/运行时版本：小程序 JS（ES6，开发者工具编译）；云函数 Node.js 云端运行；本机 Node v22.14.0（非必需）
- 包管理器：无（云函数依赖由开发者工具「云端安装依赖」）
- 安装命令：无（导入项目即可）
- 开发命令：微信开发者工具打开项目根目录 → 编译
- 测试命令：无
- 构建命令：无（上传即发布）
- 详细步骤：见 `docs/setup-and-run.md`

## 4. 现有选型的背景（只记录事实）

- 为什么用这套栈：初始设计稿的 v0.1 设计写明「微信小程序原生 + 云开发云函数 + 云数据库」，目标是小团队、免服务器运维。`[已确认]`（文档）
- 哪些选择明显是历史遗留：
  - `pages/edit`、`components/shift-tag`、`utils/format.js` 已被删除（基线提交前的工作区改动），说明从「独立编辑页」改为「日历内联弹窗」；
  - `xlsx` 依赖随「Excel 导入」设想加入，但功能未实现；
  - `DEFAULT_SHIFTS`（白班/晚班/取消）是早期三班制遗留，与现在的 11 种班次配置并存。
- 哪些依赖已过时/无人维护：`wx-server-sdk ~2.6.3` 是否仍受支持 `[未知]`，需对照官方文档；其余为平台内置能力。

## 5. 风险与限制

| 风险 | 证据 | 影响 | 建议 |
|---|---|---|---|
| 无 lock 文件 | `cloudfunctions/*/` 无 lock | 云端依赖版本漂移，行为不可复现 | 生成并提交 lock（或固定精确版本） |
| 视觉模型非确定 | `importShift/index.js` 提示词 + 温度 0 | 识别结果可能错列/少天 | 预览校对 + 回归样例集 |
| 云函数超时未知 | 识别实测 10–36s；默认 3s | 导入失败 | 控制台确认 ≥60s |
| 参数双源 | `config.js` 由清单生成，页面又硬编码 `DEFAULT_SHIFTS` | 改配置页面不生效 | 统一到 `config.js`（阶段 7） |
| 基础库版本 | `3.17.3` | 低版本微信可能不支持 `compressImage` 参数 | 真机兼容性测试 |

## 6. 与目标架构的关系

- 目标架构见：`docs/target-architecture.md`（阶段 6 产出）
- 本文件只描述“现在是什么”。

## 7. 证据来源

- 配置文件：`project.config.json`、`project.private.config.json`、`cloudfunctions/*/package.json`、`miniprogram/config.js`
- 源码：`cloudfunctions/importShift/index.js`、`miniprogram/**`
- 命令：`node -v`（v22.14.0）、`python --version`（3.12.9）、`Get-CimInstance Win32_OperatingSystem`（Windows 10 19045）
- 统计：全项目 142 文件 / 202.8 KB；17 个 js（2180 行）、7 wxml、8 wxss、22 json（脚本输出）

## 8. 待确认事项

1. 云函数 Node.js 运行时版本与控制台超时/内存配置（Q-006）。
2. `wx-server-sdk 2.6.3` 是否仍在官方支持范围。
3. 是否允许引入自动化测试工具（阶段 6 计划）。
