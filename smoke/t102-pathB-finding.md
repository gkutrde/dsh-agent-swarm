# T-102 路径 B 冒烟:红 → 绿,根因已定位

日期:2026-09-30 ｜ 环境:Windows 11 + Node v24.19.0 + `dsh 0.1.5-rc.3`

## 1. 现象

按 `smoke/t102-pathB.ps1`(`--profile headless --patch smoke/headless-mount.patch.yml`)跑,以及在本机默认 profile 里直接调 `agent_swarm`,两条路径给出**同一个**错误:

```
Error: agent_swarm subagentProvider is set but ctx.subagents is unavailable in this profile.
```

抛出点:`src/index.ts:95`(编译产物 `lib/index.js:2104`)。

## 2. 关键反证:服务其实**在**

只挂 `dsh-subagent` + `dsh-subagent-spawn-in-process` 再跑,loader 直接报**重复注册**:

```
Error: failed to apply loader entry dsh-subagent (@deepseek-ai/dsh-subagent):
       service "subagents" has been registered at <SubagentRuntime>
Error: failed to apply loader entry dsh-subagent-spawn (@deepseek-ai/dsh-subagent-spawn-in-process):
       a subagent provider named "spawn" is already registered
```

⇒ headless profile 自身已经提供了 `ctx.subagents` 服务和 `spawn` 提供方。
所以「unavailable」不是宿主没装,而是**插件查不到**——查法/查的时机错了。

## 3. 根因

`src/index.ts`

- L19:`export const inject = ['tools', 'llm']` —— 没有 `subagents`。
- L88:`const subagents = (ctx as {...}).get?.('subagents')` —— 在 **apply 时刻**、用**插件自己的 ctx** 查。

cordis 的服务可见性是 inject/scope 决定的(`cordis/lib/index.js` 的 Proxy handler 明文:
`cannot get property "${prop}" without inject`);`reflect.get` 读的是该 fiber 自己 store 里的绑定。
插件行与 subagent 服务行是 include group 里的**兄弟作用域**,不是祖先链 ⇒ `ctx.get('subagents')` 拿到 `undefined`,
于是 `createLauncher` 里那个 IIFE 立刻抛错(L94-96)——而 `createLauncher` 是在**真正调用工具时**才被调的,
那时作用域早就从 agent fiber 里来了,能看见服务。

## 4. 一行实验:确认这是唯一的闸门

把编译产物 `lib/index.js:2079` 的 inject 临时改成 `["tools", "llm", "subagents"]`,原样重跑同一个冒烟:

```
agent_swarm: 2 items — completed: 2

[#1] item=.../src/specs.ts  state=started outcome=completed stop_reason=completed elapsedMs=1786
MIN_ITEMS
[#2] item=.../src/render.ts state=started outcome=completed stop_reason=completed elapsedMs=1977
SWARM_HEADER_PREFIX
```

2/2 完成,两个答案与磁盘真值逐字一致(`specs.ts:9`、`render.ts:13`),耗时 1.79s/1.98s 重叠 ⇒ 真并发、真带工具。
**路径 B 的实现是好的,唯一的闸门就是 inject/查找时机。**
(实验后 `lib/index.js` 已还原为 `["tools", "llm"]`,备份已删除,工作树干净。)

## 5. 建议修法(按推荐度)

1. **懒查到调用点**(首选):不要在 `apply` 里查。`createLauncher(exec)` 已经拿到执行上下文,
   在那里解析 `exec` 侧的 subagents(agent fiber 的祖先链里有该服务)再 `createSubagentLauncher`。
   不放宽 profile 前提,path A profile 不受影响。
2. **服务出现时捕获**:用 cordis 的服务事件/`ctx.inject` 在被提供时拿到句柄存下来,`createLauncher` 里读缓存。
3. **不要**直接把 `subagents` 加进必填 `inject`:headless 场景服务在兄弟作用域,必填会让装载期等待/报错,
   且与 T-114「默认不设 = 路径 A」的既有约束冲突。

## 6. 待补的回归

- `test/` 加一条:path B 打开但服务不在作用域时,错误信息与 path A 行为的边界(现在这条错误只在调用时才炸,装载期静默)。
- 冒烟模板可升级为「跨多文件聚合」或「就地写入」用例,验证工具链组合,而不只是单次读文件。
