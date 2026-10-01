# dsh-agent-swarm

> 给 **DeepSeek Harness (dsh)** 的扇出工具：一个 `prompt_template` + 2~128 个 `items` → 一批并行子任务 → 一块安全汇总。
> A fan-out tool for DeepSeek Harness: one prompt template × N items → a swarm of subtasks → one safely-fenced summary.

[![ci](https://github.com/gkutrde/dsh-agent-swarm/actions/workflows/ci.yml/badge.svg)](https://github.com/gkutrde/dsh-agent-swarm/actions/workflows/ci.yml)

[English quick start](#english-quick-start) · [安装](#安装) · [用法](#用法) · [配置](#配置) · [边界](#已知边界) · [开发](#开发) · [CHANGELOG](CHANGELOG.md)

## 它能做什么

| 能力 | 默认 | 说明 |
| --- | --- | --- |
| 批量扇出 | ✅ | 同一模板铺到 2~128 个条目上并行跑 |
| 结构化条目 | ✅ | items 可传对象，模板用 `{{item.path}}`；缺字段/形状非法**前置报错**（零子任务启动） |
| 安全汇总 | ✅ | 动态围栏（正文里的 ``` 不会破结构）+ 只报非零计数 |
| 并发爬坡 | ✅ | 首波 5、之后每 700ms 放 1 |
| 限流自愈 | ✅ | `RATE_LIMIT`/`QUOTA` 自动重排队，退避 3s→6s→12s + 死锁防护 |
| 可观测 | ✅ | 每条带 `attempts=` / `throttled=true` / `elapsedMs=`（有信息才输出） |
| 子任务**带工具** | ⚙️ `subagentProvider: spawn` | 子任务变成完整子代理，能读文件、跑命令、多轮 |
| **续跑接力** | ⚙️ `+ resumeEnabled: true` | 用条目保留键 `agent` 续同一个子会话（不重跑、上下文不断） |
| 批内进度日志 | ⚙️ `progressLog: true` | 每条落位写一行日志 |
| 跟随会话模型 | ⚙️ `followSessionModel: true` | 子任务用调用方 agent 的 provider/model |

> 架构与改动指南见 [ARCHITECTURE.md](ARCHITECTURE.md)；来源与许可声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 安装

### 1. 作为 dsh 插件（headless / 自定义 profile）

```bash
git clone https://github.com/gkutrde/dsh-agent-swarm.git
cd dsh-agent-swarm
pnpm install && pnpm build        # lib/ 已随仓库提交，可跳过;改源码后需要重新构建
dsh plugin --profile <profile> add .
```

这一条命令做的事（实测确认）：把本包以 `link:`（本地路径）或版本（git/npm）写进该 profile 的 `dependencies`，**并追加到 `dsh.profile.bundles`** —— 也就是以**自指 bundle** 形态挂载。之后：

- **可见**：`dsh --profile <profile> --dump-config` 里会出现 `# == dsh-agent-swarm` 层与 `- id: agent-swarm`；桌面端在「插件」页可见（清单由宿主的 `pluginInventory` 服务提供）。
- **停用**：在 profile 的 `cordis.patch.yml` 里写 `- id: agent-swarm` + `disabled: true`（组合配置随之标记停用）。
- **卸载**：`dsh plugin --profile <profile> remove dsh-agent-swarm`（条目从组合配置里消失）。
- **自证**：`dsh plugin --profile <profile> add .` → `dsh --profile <profile> --dump-config | findstr agent-swarm` 能看到条目即装好；`remove` 后再查应为空。

或者只把 bundle 层挂上（不改 profile 文件）：

```bash
dsh --profile <profile> --patch ./cordis.patch.yml "你的提示词"
```

### 2. 桌面端（Electron 应用）

桌面端 profile 由应用独占管理（`dsh plugin --profile desktop add` 会被拒绝，应用内插件页是只读的）。手工装法：

1. `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 加 `"dsh-agent-swarm": "link:<插件目录>"`，`dsh.profile.bundles` 追加 `dsh-agent-swarm`；
2. 在 profile 的 `node_modules/` 下建一个指向插件目录的 **Junction**（Windows: `New-Item -ItemType Junction`）；
3. **重启桌面端**。

## 用法

```text
# ① 默认：纯扇出（最便宜）
agent_swarm({
  description: '审查',
  prompt_template: '只回答 {{item}} 的风险等级(高/中/低),不要解释',
  items: ['a.ts', 'b.ts', 'c.ts']
})

# ② 结构化条目（对象 + 字段占位符）
agent_swarm({
  description: '审查',
  prompt_template: '审查 {{item.path}},关注 {{item.focus}}',
  items: [{ path: 'a.ts', focus: '回归' }, { path: 'b.ts', focus: '性能' }]
// 模板还支持内置变量:{{index}}(1-based 序位)、{{total}}(条目总数)
})

# ③ 批次级模型路由（T-140）：只对这一次调用生效
agent_swarm({
  description: '审查',
  prompt_template: '只回答 {{item}} 的风险等级(高/中/低)',
  items: ['a.ts', 'b.ts'],
  provider: 'kimi-coding',   // 可选：覆盖本批次的 provider
  model: 'k3'                // 可选：覆盖本批次的 model
})

# ④ 路径 B：子任务带工具（需 subagentProvider: spawn）
agent_swarm({
  description: '读码',
  prompt_template: '用文件工具打开 {{item}},只回答它第一条 export const 的名字',
  items: ['src/a.ts', 'src/b.ts']
})

# ⑤ 续跑（需 subagentProvider + resumeEnabled）
#   上一轮汇总里每条都带 agent=<子会话 id>
agent_swarm({
  description: '继续',
  prompt_template: '继续同一个会话:看 {{item.path}} 的第二条 export const',
  items: [{ agent: '<上一轮的 agent id>', path: 'src/a.ts' }]   // 单条也合法
})
# → 汇总元数据行会带 resumed=true,agent= 与上一轮同一 id
```

汇总长这样：

```text
agent_swarm: 2 items — completed: 2

[#1] item=src/a.ts state=started outcome=completed resumed=true elapsedMs=3625 agent=02d07b12-…
```text
（该子任务的最终回答,原样保留;正文里的围栏会被自动加长,不会破结构）
```
```

## 配置

写进 profile 插件行的 `config`（全部可选）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `maxConcurrency` | 不限 | 并发硬上限 |
| `timeoutMs` | 7200000 | 单子任务超时（ms），0 = 不设 |
| `provider` / `model` | deepseek-official / deepseek-flash | 子任务模型路由 |
| `maxTokens` | 不设 | 单请求 token 上限 |
| `maxBodyChars` | 不截断 | 汇总里每条正文的字符上限（大 N 建议 2000-4000） |
| `rampLimit` / `rampIntervalMs` | 5 / 700 | 首波并发 / 放量间隔 |
| `retryableFailureCodes` | `RATE_LIMIT,QUOTA` | 触发重排队的宿主失败码 |
| `maxPromptChars` | 不限 | 展开后单条 prompt 字符上限 |
| `maxAttempts` | 不限 | 单任务尝试预算 |
| `backoffJitterMs` | 0 | 退避抖动上限（0 = 无抖动） |
| `toolTimeoutMs` | 4h | 批级调用上限 |
| `systemPrompt` | 内置 | 子任务 system 提示 |
| `progressLog` | false | 每条落位写一行进度日志 |
| `registryHistoryLimit` | 5 | **T-141** 批次状态注册表保留的历史批次数 |
| `subagentProvider` | 空 | 空 = 固定**路径 A**；`spawn` / `fork` = 固定**路径 B**；**`auto` = 每次调用自动判断**（需要工具走 B，否则 A，判定依据见下方「路径 A / B」）|
| `followSessionModel` | false | 子任务跟随调用方 agent 的 provider/model |
| `resumeEnabled` | false | 路径 B 且为真：子级可续（条目用 `agent` 键接力） |
| `subagentAgentOptions` | false | 路径 B：把 Config 的 provider/model/maxTokens 作为宿主 `AgentOptions` 传给子代理（需提供方支持） |
| `subagentTurnTimeoutMs` | 同 `timeoutMs` | 路径 B：单轮等待上限（ms），`0` = 不设上限 |
| `subagentPollIntervalMs` | 500 | 路径 B：状态/会话轮询间隔（ms） |

## 两条执行路径

| | 路径 A（默认） | 路径 B（`subagentProvider`） |
| --- | --- | --- |
| 子任务是什么 | 一次纯 LLM 调用 | 宿主 subagent（完整 agent） |
| 能用工具 | ❌ | ✅ |
| 能多轮/追问 | ❌ | ✅ |
| 能续跑 | ❌ | ✅（`resumeEnabled`） |
| 成本/延迟 | 低 | 高 |

用哪条取决于「这个结论是否必须动工具才能得到」。分诊、摘要、审查这类看一遍就能定论的，用路径 A。

**不想每次自己判断？** 把 `subagentProvider` 设成 **`auto`**：插件按「条目是不是文件路径/URL、模板有没有说 读/打开/运行/验证/抓取」这类信号自动选路径，并把结果写进返回值的 `path` / `pathReason` 字段（也可开 `progressLog` 看日志）。判定偏保守——**偏向 B**，因为路径 A 读不到文件时不会报错，而是编造答案。

## 配合 skill：swarm → team

仓库里的 [`skills/swarm-then-team/SKILL.md`](skills/swarm-then-team/SKILL.md) 给出一条两阶段流水线，装好后 agent 遇到批量场景会**自己**用：

**便宜的先铺开（swarm）→ Lead 解析汇总、只挑被证据点名的条目 → 贵的只用在它们身上（带工具的 agent team）→ 回执。**

```bash
mkdir -p ~/.dsh/skills && cp -r skills/swarm-then-team ~/.dsh/skills/
```

（该目录被监视，新 skill 无需重启即生效。）

## 宿主服务（可查询批次状态）

插件会把批次状态**以宿主服务形式暴露**，供其它插件/UI 查询：

```ts
// 服务名:agentSwarmRegistry
ctx.get('agentSwarmRegistry')  // => { current(), list(), get(id) }
```

- `current()`：正在跑的批次（含 `description` / `path` / `counts` / 逐条 `items`）
- `list()`：历史批次（newest first，默认保留 5 个，可配 `registryHistoryLimit`）
- `get(id)`：按批次 id 查
- 纯内存、有界；**注册表自身异常绝不影响批处理**（宿主不提供 `provide` 时静默降级）

## 已知边界

- **默认子任务无工具、不能追问**——这是路径 A 的设计取舍，需要工具请开路径 B。
- **续跑要求同一父会话谱系**（宿主 adjacency 校验）：跨会话不能续；中断只打断当前轮，子会话保留。
- **路径 B 的限流识别靠 `diagnostic` 文本**（宿主未提供结构化 failure 对象）。
- **续跑批也要有占位符**（可用 `{{item.agent}}`）；把 JSON 塞进字符串冒充续跑不算续跑，仍按新建计数。
- 没有流式 UI：`progressLog` 是日志行。

## 开发

开发/测试需要 **Node ≥ 22**（pnpm 11 与 `.ts` 类型剥离的要求）；装进 profile 的 `lib/` 是纯 JS，运行时不受此限制。

```bash
pnpm install
pnpm test        # node --test（用例数见 CI 徽章，不在此处硬编码以免漂移）
pnpm pack:check  # 打包断言:README/LICENSE/lib 必须在包里
pnpm typecheck   # tsc --noEmit
pnpm build       # tsdown → lib/
```

设计取舍与验证方式的内部记录不随仓库发布；可执行的行为契约由 `test/`（覆盖全部已验收行为）与 `CHANGELOG.md` 承载。

## 兼容性

- Node.js >= 20
- `cordis` 4.x（`peerDependencies`）
- 路径 A 只需宿主 llm 服务；路径 B 需要宿主 subagent 服务（dsh 默认 bundle 自带 `spawn`/`fork`）

## English quick start

`dsh-agent-swarm` adds an `agent_swarm` tool to DeepSeek Harness: fan one `prompt_template` over 2-128 `items` and get one safely-fenced summary. Items may be strings or flat objects (`{{item.path}}`). Path A (default) runs each subtask as a single LLM call; setting `subagentProvider: spawn` runs them as full host subagents **with tools**, and adding `resumeEnabled: true` makes children resumable via the reserved `agent` item key (`resumed=true` in the summary). Install by `git clone` + `dsh plugin --profile <profile> add .`; MIT licensed.

## License

MIT — see [LICENSE](LICENSE).
