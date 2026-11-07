# dsh-worklog · 工作台账

从 DeepSeek Harness 的会话日志里，还原你**真正做了什么**，按工作目录分组写成 Markdown 台账——日报、周报、月报同一套逻辑。

## 安装

```sh
dsh plugin --profile desktop add dsh-worklog
```

桌面版请用应用内的 **设置 → 插件** 安装（桌面应用的 profile 归它自己的插件管理器管，命令行改不了）。装完刷新页面，设置里会多出「工作台账」一页。

要求 DeepSeek Harness ≥ 0.2.1-rc.5。

## 它解决什么

一天开五六个会话、跨三四个项目，晚上想写周报时已经想不起"今天到底推进了什么"。这个插件不问你，直接读会话日志：

- 按 **工作目录** 分组（跨项目汇总到同一份台账）
- 每个会话给出：时间段、轮数、中断次数、你的需求、改动的文件与次数、用到的工具、最后一条进展
- 周报 / 月报按**项目**汇总，会话跨天时合并成一行并标注「跨 N 天」（可关）
- 末尾附「产物」清单：改动最多的文件、新生成的文档、跑过的关键命令
- 落盘到 `~/.dsh/worklog/`，可随时翻、可贴进周报

## 用法

在输入框里敲：

```
/worklog              # 今天
/worklog 昨天
/worklog 2026-11-05
/worklog 本周          # 周报，按项目汇总
/worklog 上周
/worklog 本月          # 月报
/worklog 上月
```

也可以在对话里直接说"生成本周周报"，agent 会调用 `worklog_generate` 工具（参数 `period` 同上）。

## 设置页

打开 **设置 → 工作台账**（左侧导航里独立的一项，在「通知提醒」下面），页面上直接有这些字段（改完立即生效，不用重启）：

| 字段 | 说明 |
| --- | --- |
| `outputDir` | 台账存放目录；留空用 `~/.dsh/worklog`，支持 `~` 开头 |
| `mergeCrossDay` | 周报 / 月报里同一会话跨天时合并成一行并标注「跨 N 天」 |
| `products` | 台账末尾的「产物」清单：改动最多的文件、新生成的文档、关键命令 |
| `autoWeekly.enabled` | 到点自动生成周报（只在本应用运行时生效） |
| `autoWeekly.weekday` | 周几生成，1 = 周一 …… 7 = 周日 |
| `autoWeekly.time` | 生成时刻，24 小时制 `HH:mm` |

选项存在 profile 的 Loader 行配置里（`settings` 服务管理），不再是插件目录下的 `config.json`；旧版本留下的 `~/.dsh/worklog/config.json` 会在首次启动时自动迁移并删除。

不想开设置页时，命令照样能改：

```
/worklog 设置                    # 查看当前设置
/worklog 设置 目录 D:\我的台账     # 台账存放位置（留空或「默认」恢复）
/worklog 设置 合流 开|关          # 跨天合流（默认开）
/worklog 设置 产物 开|关          # 「产物」清单（默认开）
/worklog 设置 自动 开|关          # 每周自动生成周报（默认关）
/worklog 设置 时间 周日 22:00     # 自动周报的时间，可换周几
```

自动周报在触发时生成**当周**（周一至触发日）的周报；若把时间设在周一，生成的是**上一周**。它只在本应用运行时生效，错过的时刻不会补跑。

## 输出示例

```markdown
# 工作周报 · 2026-11-02 ~ 2026-11-08

> 3 个项目 ｜ 3 个会话 ｜ 53 轮 ｜ 改动 100 个文件 ｜ 19 次中断 ｜ 生成于 19:39

## D:\vibeCoding\pluglin

> 1 个会话 ｜ 3 天 ｜ 40 轮 ｜ 改动 76 个文件

### 个人工作台
- 11-04 14:27 → 11-06 13:56 ｜ 跨 3 天 ｜ 40 轮 ｜ 17 次中断
- 需求：「我想做到用户可以自定义调整这些组件的形状大小」；…
- 改动：…/DashboardPage.tsx(27)、…/app/schemas.py(13)、…/services/views.py(12)
- 工具：edit 302 · read 266 · pwsh 251
- 最后进展：**A 已完成**。待办、事务这类"有状态的东西"……

## 产物

### D:\vibeCoding\pluglin
- 改动最多：…/worklog/index.js(17)、…/dock-clock/client.js(12)
- 新生成文档：…/docs/ARCHITECTURE.md
- 关键命令：node --check index.js ×6；pnpm run build ×2
```

## 文件

| 路径 | 内容 |
| --- | --- |
| `~/.dsh/worklog/2026-11-06.md` | 日报 |
| `~/.dsh/worklog/week-2026-11-02.md` | 周报（以周一命名） |
| `~/.dsh/worklog/month-2026-11.md` | 月报 |

目录可以在设置页里换成任何位置（例如 `D:\我的台账`）。

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | host 侧插件：`/worklog` 命令、`worklog_generate` 工具、设置页 schema、定时器 |
| `client.js` | 浏览器侧：设置 → 工作台账 那一页（`settings.section` 槽位） |
| `cordis.patch.yml` | bundle 插入行 |
| `locale/*.json` | 插件管理页显示名称与说明 |
| `icon.svg` | 插件图标 |

## 说明

- host 侧管数据与定时，client 侧只管那一页设置；改完刷新页面即生效，不需要重启。
- 台账是**从会话日志重建的**，所以它不会漏掉你已经忘了的会话，也不会编造没发生的事。
- 会话日志是 zstd 压缩的多帧文件，插件不直接解盘，全部走 `sessionQuery` 服务读取。
- 设置项由 `Config`（schemastery，字段带 `.volatile()`）声明，读写走 `settings` 服务；client 侧通过 `configForms` 拿到同一份表单。`@deepseek-ai/schemastery` 必须与宿主同版本（`~3.18.5`），换别的版本 volatile 字段会被静默丢弃。
- 目录仍可用环境变量 `DSH_WORKLOG_DIR` 兜底（优先级低于设置页里的 `outputDir`）。

MIT License
