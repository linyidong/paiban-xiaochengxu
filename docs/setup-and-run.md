# 启动与运行（Setup and Run）

> 阶段 3 产出。**没实际验证过的步骤一律标“待验证”**。本轮未能编译/真机运行（开发者工具未登录），因此除静态检查外均为待验证。

## 1. 环境要求

| 项 | 要求 | 实际版本 | 证据 |
|---|---|---|---|
| 操作系统 | Windows（本项目当前机器） | Windows 10 专业版 10.0.19045 | `Get-CimInstance Win32_OperatingSystem` |
| 小程序 IDE | 微信开发者工具（稳定版） | 安装包 `2.02.2608080_win32_x64`，路径 `D:\Software\weixin-kaifagongju\微信web开发者工具\` | 本机文件 |
| 基础库 | 3.17.3 | `project.config.json:7` | 配置 |
| 云开发 | 已开通环境 `paiban-d3g142gf2cdf1cc02` | `[未知]` 是否仍有效 | 需控制台确认 |
| Node.js | 仅云函数云端运行需要；本地可选 | 本机 v22.14.0 | `node -v` |
| Python | 仅改参数时运行分发脚本 | 3.12.9 | `python --version` |
| 包管理器 | 无（云函数依赖由工具云端安装） | — | 无 lock 文件 |

## 2. 安装

```powershell
# 1) 打开项目（无需 npm install）
#    微信开发者工具 → 导入项目 → 目录选择 G:\AI编程结构定义\日历排班小程序
#    AppID 已在 project.config.json 中配置
# 2) 云函数依赖：上传时勾选「云端安装依赖」
```

- 是否需要系统依赖：需要微信开发者工具；无需本地 Node/Python 才能运行，但改参数需 Python
- 是否需要私有源/代理：否
- 预计耗时：导入 + 首次编译 1–3 分钟（待验证）
- 已实际验证：**否**（工具未登录）

## 3. 启动

```powershell
# GUI：打开 D:\Software\weixin-kaifagongju\微信web开发者工具\，登录后打开项目
# CLI（可选）：D:\Software\weixin-kaifagongju\微信web开发者工具\cli.bat open --project "G:\AI编程结构定义\日历排班小程序"
```

| 项 | 值 |
|---|---|
| 启动命令 | 开发者工具打开项目根目录并编译；`miniprogramRoot=miniprogram/` |
| 默认端口 | 不适用（小程序 IDE 自带模拟器） |
| 访问地址 | 模拟器 / 真机扫码 |
| 必需环境变量 | 无 `.env`；云环境由 `miniprogram/config.js` 的 `env` 指定 |
| 启动成功标志 | 模拟器首屏进入「日历」页；控制台无 `wx.cloud` 初始化错误 |

- 已实际验证：**否**
- 未验证原因：微信开发者工具未登录，无法打开/编译项目（见 Q-010）。

## 4. 构建

```powershell
# 微信开发者工具 → 上传（版本号 + 备注）→ 微信公众平台提交审核/发布
# 云函数：右键函数目录 → 上传并部署（云端安装依赖）
```

- 产物位置：由开发者工具管理，仓库内无构建产物
- 构建耗时：待验证
- 已实际验证：否

## 5. 测试

```powershell
# 单元/静态测试（已建立）
node --test
# 集成测试：需云开发环境（阶段 8）
# 端到端：微信开发者工具/真机（阶段 8）
```

| 测试类型 | 命令 | 数量 | 最近结果 | 证据 |
|---|---|---|---|---|
| 单元/静态 | `node --test` | 86 | 通过 | 2026-10-25 本机输出 |
| 集成 | 云函数 + 云数据库 | — | 未执行 | 需登录/云环境（Q-010/Q-006） |
| 真机手工 | 见 `docs/acceptance-test-plan.md` | — | 未执行 | 阶段 8 |

## 6. 常见启动问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 云函数调用报「env 不存在」 | `config.js` 的 `env` 与控制台环境不一致 | 用《人工必填参数清单.json》改后运行 `同步参数.bat` |
| 云函数启动即报错 `Cannot find module './config.json'` | `cloudfunctions/*/config.json` 被 `.gitignore`，克隆后缺失 | 运行 `同步参数.bat` 生成，再上传 |
| 导入「识别成功」但数据明显是假的 | `importShift` 未配置 Key 时回退 `mockPreview()` | 配置 `AI_VISION_API_KEY/ENDPOINT/MODEL` 并重新部署 |
| 导入长时间无响应/超时 | 视觉识别 10–36s，云函数默认超时 3s | 控制台把 `importShift` 超时调到 60s |
| 换机后登录身份错乱 | `session` 存在本地 storage，含 role/name | 「我的 → 退出登录」重新绑定 |

## 7. 配置项（只写变量名）

| 变量名 | 用途 | 是否必填 | 缺失时行为 |
|---|---|---|---|
| `env`（`miniprogram/config.js`） | 云开发环境 ID | 是 | `wx.cloud.init` 失败/调用失败 |
| `ADMIN_OPENIDS`（云函数 `config.json`） | 管理员白名单 | 是 | `require('./config.json')` 抛错，login/updateShift/manageMember 不可用 |
| `AI_VISION_API_KEY` | 视觉识别鉴权 | 是（生产） | 缺失时 `importShift` 返回**假数据**（危险） |
| `AI_VISION_ENDPOINT` | 识别端点 | 是 | 同上 |
| `AI_VISION_MODEL` | 识别模型名 | 是 | 同上 |
| `MEMBER_ALIAS` | 成员别名映射 | 否（强烈建议） | 昵称/别名无法归位到正式名 |
| `SHIFT_TYPES` / `SHIFT_COLOR` | 班次与颜色 | 是 | 页面回退默认 5 项，颜色灰色 |

> 详细说明见 `docs/人工参数与环境配置.md`；真实值只在本机文件与云端，不写进文档。

## 8. 证据来源

- 命令输出：`node -v`、`python --version`、OS 版本、文件存在性检查
- 配置文件：`project.config.json`、`miniprogram/config.js`、`cloudfunctions/*/package.json`
- 实际访问截图：无（未启动开发者工具）

## 9. 待确认事项

1. 开发者工具登录授权与首次编译（Q-010）。
2. 云开发环境是否仍有效、云函数超时/内存配置（Q-006）。
3. 是否允许我安装/接入自动化测试工具（阶段 6 决定）。
