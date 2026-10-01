import test from 'node:test'
import assert from 'node:assert/strict'
import { agentSwarmDescription } from '../src/tool.ts'
import {
  createAgentSwarmTool,
  AGENT_SWARM_TOOL_NAME,
  AGENT_SWARM_DESCRIPTION,
  AGENT_SWARM_PARAMETERS,
  AGENT_SWARM_OUTPUT,
  TOOL_TIMEOUT_MS,
} from '../src/tool.ts'
import type { AttemptCallbacks, SwarmLauncher, SwarmTask } from '../src/scheduler.ts'

// ─── 假执行层:记录启动情况,按任务立即回调 ───

type Behavior = 'success' | 'fail' | { failMessage: string } | 'hang'

function createFakeLauncher(plan: (task: SwarmTask) => Behavior = () => 'success') {
  const starts: SwarmTask[] = []
  const abandoned: number[] = []
  const launcher: SwarmLauncher = {
    start(task: SwarmTask, cb: AttemptCallbacks, signal: AbortSignal) {
      starts.push(task)
      const behavior = plan(task)
      queueMicrotask(() => {
        if (behavior === 'success') {
          cb.onReady()
          cb.onComplete({ result: `ok-${task.index}` })
        } else if (behavior === 'fail') {
          cb.onError({ message: 'boom' })
        } else if (behavior === 'hang') {
          signal.addEventListener('abort', () => cb.onError({ message: 'aborted' }), { once: true })
        } else {
          cb.onError({ message: behavior.failMessage })
        }
      })
    },
    abandoned(info) {
      abandoned.push(info.task.index)
    },
  }
  return { launcher, starts, abandoned }
}

function makeTool(fake: ReturnType<typeof createFakeLauncher>, overrides: Record<string, unknown> = {}) {
  return createAgentSwarmTool({
    createLauncher: () => fake.launcher,
    timeoutMs: 7_200_000,
    ...overrides,
  })
}

const ARGS = { description: '审查回归', prompt_template: '审查 {{item}}', items: ['a.ts', 'b.ts', 'c.ts'] }
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
const exec = (signal?: AbortSignal) => ({ signal: signal ?? new AbortController().signal })

// ─── 场景 1:正常编排 ───

test('正常编排:3 个 items → 展开 tasks、跑批、渲染汇总;timeoutMs 来自 Config', async () => {
  const fake = createFakeLauncher()
  const tool = makeTool(fake, { timeoutMs: 1234 })
  const text = (await tool.execute(ARGS, exec())).text
  assert.equal(fake.starts.length, 3)
  assert.deepEqual(fake.starts.map((t) => t.index), [0, 1, 2])
  assert.deepEqual(fake.starts.map((t) => t.prompt), ['审查 a.ts', '审查 b.ts', '审查 c.ts'])
  assert.deepEqual(fake.starts.map((t) => t.timeoutMs), [1234, 1234, 1234])
  assert.match(text, /^agent_swarm: 3 items — completed: 3/)
  assert.equal(text.includes('[#1] item=a.ts state=started outcome=completed'), true)
  assert.equal(text.includes('ok-2'), true)
  assert.equal(text.includes('Not all subagent runs completed'), false)
})

test('timeoutMs=0 → 不下发任务级超时(交给宿主/调用方)', async () => {
  const fake = createFakeLauncher()
  const tool = makeTool(fake, { timeoutMs: 0 })
  await tool.execute(ARGS, exec())
  assert.deepEqual(fake.starts.map((t) => t.timeoutMs), [undefined, undefined, undefined])
})

// ─── 场景 2:校验前置拒绝(零子任务启动) ───

test('校验①:少于 2 个 items → 抛文案且 launcher 一次都没被创建', async () => {
  let created = 0
  const tool = createAgentSwarmTool({
    createLauncher: () => {
      created += 1
      return createFakeLauncher().launcher
    },
    timeoutMs: 1000,
  })
  await assert.rejects(
    () => tool.execute({ ...ARGS, items: ['only.ts'] }, exec()),
    /^Error: agent_swarm requires at least 2 items\.$/,
  )
  assert.equal(created, 0, '校验先于任何子任务启动')
})

test('校验④:模板缺 {{item}} → 抛文案且零启动', async () => {
  const fake = createFakeLauncher()
  await assert.rejects(
    () => makeTool(fake).execute({ ...ARGS, prompt_template: '审查全部文件' }, exec()),
    /^Error: agent_swarm prompt_template must include the \{\{item\}\} placeholder\.$/,
  )
  assert.equal(fake.starts.length, 0)
})

test('校验⑤:展开后 prompt 重复 → 抛带两个 1-based 序号的文案', async () => {
  const fake = createFakeLauncher()
  await assert.rejects(
    () => makeTool(fake).execute({ ...ARGS, items: ['x', 'y', 'x'] }, exec()),
    /Duplicate subagent prompts from items 1 and 3/,
  )
  assert.equal(fake.starts.length, 0)
})

test('入参形状非法(items 不是数组 / args 不是对象) → 抛明确文案,不崩', async () => {
  const fake = createFakeLauncher()
  await assert.rejects(() => makeTool(fake).execute({ ...ARGS, items: 'a.ts' }, exec()), /items/i)
  await assert.rejects(() => makeTool(fake).execute(undefined, exec()), /object/i)
  assert.equal(fake.starts.length, 0)
})

// ─── 场景 3:异常兜底 ───

test('异常兜底:launcher 构造抛错 → 抛 Error(原始 message),不抛裸值、不吞异常', async () => {
  const tool = createAgentSwarmTool({
    createLauncher: () => {
      throw new Error('llm service unavailable')
    },
    timeoutMs: 1000,
  })
  await assert.rejects(() => tool.execute(ARGS, exec()), /^Error: llm service unavailable$/)
})

test('批内个别失败不影响整批收尾(汇总里报 failed)', async () => {
  const fake = createFakeLauncher((task) => (task.index === 1 ? 'fail' : 'success'))
  const text = (await makeTool(fake).execute(ARGS, exec())).text
  assert.match(text, /^agent_swarm: 3 items — completed: 2, failed: 1/)
  assert.equal(text.includes('boom'), true)
  assert.equal(text.includes('Not all subagent runs completed'), true)
})

// ─── 场景 4:Config 透传 ───

test('maxConcurrency 透传:cap=2 时同时启动不超过 2 个', async () => {
  const fake = createFakeLauncher(() => 'hang')
  const controller = new AbortController()
  const tool = makeTool(fake, { maxConcurrency: 2 })
  const promise = tool.execute(ARGS, exec(controller.signal))
  await flush()
  assert.equal(fake.starts.length, 2, '并发闸门生效')
  controller.abort()
  const text = (await promise).text
  assert.match(text, /aborted: 3/)
})

// ─── 场景 5:取消传导 ───

test('取消传导:exec.signal abort → 批取消,结果 aborted(不误报 failed),已完成项保留', async () => {
  const fake = createFakeLauncher((task) => (task.index === 0 ? 'success' : 'hang'))
  const controller = new AbortController()
  const tool = makeTool(fake)
  const promise = tool.execute({ ...ARGS, items: ['a.ts', 'b.ts', 'c.ts'] }, exec(controller.signal))
  await flush()
  controller.abort()
  const text = (await promise).text
  assert.match(text, /^agent_swarm: 3 items — completed: 1, aborted: 2/)
  assert.equal(text.includes('The user manually interrupted this subagent batch before this subagent finished.'), true)
})

// ─── 场景 7:正文截断透传(T-104) ───

test('maxBodyChars 透传:超长子任务正文在汇总里被截断并标注', async () => {
  const fake = createFakeLauncher()
  const tool = makeTool(fake, { maxBodyChars: 3 })
  const text = (await tool.execute(ARGS, exec())).text
  assert.match(text, /truncated=1/, 'ok-0 长 4 截到 3 → 标 1 个字符')
  assert.equal(text.includes('… [truncated: 1 chars omitted]'), true)
})

// ─── 场景 8:放量节奏透传(T-105) ───

test('rampLimit 透传:rampLimit=1 时首波只启动 1 个(默认会是 5)', async () => {
  const fake = createFakeLauncher(() => 'hang')
  const controller = new AbortController()
  const tool = makeTool(fake, { rampLimit: 1, rampIntervalMs: 60_000 })
  const promise = tool.execute({ ...ARGS, items: ['a', 'b', 'c', 'd'] }, exec(controller.signal))
  try {
    await flush()
    assert.equal(fake.starts.length, 1, '首波被压到 1')
  } finally {
    // 断言失败也必须收尾,否则 60s 的放量定时器会把测试进程吊住
    controller.abort()
    await promise
  }
})

test('rampLimit/rampIntervalMs 非法 → 构造工具时拒绝', () => {
  assert.throws(() => makeTool(createFakeLauncher(), { rampLimit: 0 }), /rampLimit must be a positive integer/)
  assert.throws(() => makeTool(createFakeLauncher(), { rampLimit: 2.5 }), /rampLimit must be a positive integer/)
  assert.throws(() => makeTool(createFakeLauncher(), { rampIntervalMs: -1 }), /rampIntervalMs must be a non-negative number/)
})

test('maxBodyChars 非法(0/负数/小数) → 构造工具时就拒绝', () => {
  assert.throws(() => makeTool(createFakeLauncher(), { maxBodyChars: 0 }), /maxBodyChars must be a positive integer/)
  assert.throws(() => makeTool(createFakeLauncher(), { maxBodyChars: -5 }), /maxBodyChars must be a positive integer/)
  assert.throws(() => makeTool(createFakeLauncher(), { maxBodyChars: 1.5 }), /maxBodyChars must be a positive integer/)
})


// ─── 场景 6:工具契约(schema / 输出 / 超时声明) ───

test('工具契约:名称/描述/参数 JSON Schema(宿主子集)/输出投影/工具级 timeoutMs', () => {
  assert.equal(AGENT_SWARM_TOOL_NAME, 'agent_swarm')
  assert.equal(typeof AGENT_SWARM_DESCRIPTION, 'string')
  assert.ok(AGENT_SWARM_DESCRIPTION.length > 40, '描述要能指导模型何时使用')

  assert.equal(AGENT_SWARM_PARAMETERS.type, 'object')
  assert.deepEqual(AGENT_SWARM_PARAMETERS.required, ['description', 'prompt_template', 'items'], 'prompt_template 缺失即抛错,必须是 required')
  const properties = AGENT_SWARM_PARAMETERS.properties as Record<string, { type: string; items?: { oneOf?: Array<{ type?: string }> } }>
  // T-140 起参数多了批次级路由 provider/model(有意变更)。
  assert.deepEqual(Object.keys(properties).sort(), ['description', 'items', 'model', 'prompt_template', 'provider'])
  assert.equal(properties.description.type, 'string')
  assert.equal(properties.items.type, 'array')
  // T-132:元素形态用 oneOf 声明(字符串或对象),实现支持两者,声明也必须如此。
  const itemTypes = (properties.items.items?.oneOf ?? []).map((node) => node.type).sort()
  assert.deepEqual(itemTypes, ['object', 'string'])
  const raw = JSON.stringify(AGENT_SWARM_PARAMETERS)
  assert.equal(/minItems|maxItems|minimum|maximum/.test(raw), false, '宿主 JSON Schema 子集不支持这些关键字')

  assert.equal(AGENT_SWARM_OUTPUT.schema.type, 'object')
  assert.deepEqual(AGENT_SWARM_OUTPUT.render(ARGS, { text: '汇总文本' }), [{ type: 'text', text: '汇总文本' }])
  assert.equal(typeof TOOL_TIMEOUT_MS, 'number')
  assert.ok(TOOL_TIMEOUT_MS >= 3_600_000)

  const tool = makeTool(createFakeLauncher())
  assert.equal(tool.name, 'agent_swarm')
  assert.equal(tool.timeoutMs, TOOL_TIMEOUT_MS)
  assert.equal(tool.parameters, AGENT_SWARM_PARAMETERS)
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(typeof tool.execute, 'function')
})

// ─── T-110:输入硬化透传 ───

test('maxPromptChars 透传:超长展开 prompt 前置拒绝、零子任务启动', async () => {
  const fake = createFakeLauncher()
  await assert.rejects(() => makeTool(fake, { maxPromptChars: 4 }).execute(ARGS, exec()), /exceeds 4 characters/)
  assert.equal(fake.starts.length, 0)
})

test('maxPromptChars 非法(0/负数/非整数) → 构造工具时拒绝', () => {
  assert.throws(() => makeTool(createFakeLauncher(), { maxPromptChars: 0 }), /maxPromptChars must be a positive integer/)
  assert.throws(() => makeTool(createFakeLauncher(), { maxPromptChars: 1.5 }), /maxPromptChars must be a positive integer/)
})

// ─── T-113:工具声明与超时覆盖 ───

test('工具声明:isConcurrencySafe 为真;toolTimeoutMs 覆盖工具级超时', () => {
  const tool = makeTool(createFakeLauncher(), { toolTimeoutMs: 1234 })
  assert.equal(tool.timeoutMs, 1234)
  assert.equal(tool.isConcurrencySafe?.(), true, '声明并发安全')
})

// ─── T-115:结构化 items 端到端 ───

test('对象 items 端到端:字段展开进 prompt,汇总元数据行里 item 标签 JSON 化', async () => {
  const fake = createFakeLauncher()
  const tool = makeTool(fake)
  const text = (await tool.execute(
    { description: '审查', prompt_template: '审查 {{item.path}}', items: [{ path: 'a.ts' }, { path: 'b.ts' }] },
    exec(),
  )).text
  assert.deepEqual(fake.starts.map((t) => t.prompt), ['审查 a.ts', '审查 b.ts'])
  assert.match(text, /\[#1\] item=\{"path":"a\.ts"\} state=started outcome=completed/)
})

test('对象 items 形状非法 → 前置拒绝、零子任务启动', async () => {
  const fake = createFakeLauncher()
  await assert.rejects(
    () => makeTool(fake).execute({ description: 'd', prompt_template: '看 {{item.path}}', items: [{ path: true }, 'x'] }, exec()),
    /invalid/i,
  )
  assert.equal(fake.starts.length, 0)
})

// ─── T-116:进度回调透传 ───

test('onItemSettled 透传:每完成一条上报一次', async () => {
  const fake = createFakeLauncher()
  const seen: number[] = []
  await makeTool(fake, { onItemSettled: (e: { task: { index: number } }) => seen.push(e.task.index) }).execute(ARGS, exec())
  assert.deepEqual(seen, [0, 1, 2])
})

// ─── T-103:续跑目标透传到任务 ───

test('对象条目的 agent 键 → SwarmTask.resumeAgentId', async () => {
  const fake = createFakeLauncher()
  await makeTool(fake).execute({
    description: 'd',
    prompt_template: '继续看 {{item.path}}',
    items: [{ agent: 'child-9', path: 'a.ts' }, { path: 'b.ts' }],
  }, exec())
  assert.equal(fake.starts.length, 2)
  assert.equal(fake.starts[0].resumeAgentId, 'child-9')
  assert.equal(fake.starts[1].resumeAgentId, undefined)
})

// ─── 描述必须与实际执行路径一致(路径 B 下不能说 NO tools) ───

test('工具描述随执行路径变化:路径 A 说无工具,路径 B 说有工具,续跑再补 agent 键', () => {
  const oneShot = agentSwarmDescription({ subagent: false })
  assert.equal(oneShot, AGENT_SWARM_DESCRIPTION, '路径 A 文案逐字不变')
  assert.match(oneShot, /NO tools/)
  const subagent = agentSwarmDescription({ subagent: true })
  assert.doesNotMatch(subagent, /NO tools/, '路径 B 不得声明无工具')
  assert.match(subagent, /WITH tools/)
  assert.doesNotMatch(subagent, /resumed=true/)
  const continuable = agentSwarmDescription({ subagent: true, continuable: true })
  assert.match(continuable, /resumed=true/)
  assert.match(continuable, /\"agent\"/)
})

test('自定义描述会替换默认描述', async () => {
  const fake = createFakeLauncher()
  const custom = 'CUSTOM DESCRIPTION SENTINEL'
  const tool = makeTool(fake, { description: custom })
  assert.equal(tool.description, custom)
})

// ─── T-127:开跑预检行(progressLog 开启时) ───

test('T-127 onBatchStart:在启动任何子任务之前回调一次,携带批量参数', async () => {
  const fake = createFakeLauncher()
  const seen: Array<{ count: number; startsAtCall: number; rampLimit: number | undefined; rampIntervalMs: number | undefined }> = []
  const tool = makeTool(fake, {
    rampLimit: 4,
    rampIntervalMs: 700,
    onBatchStart: (info: { count: number; rampLimit?: number; rampIntervalMs?: number }) => {
      seen.push({ count: info.count, startsAtCall: fake.starts.length, rampLimit: info.rampLimit, rampIntervalMs: info.rampIntervalMs })
    },
  })
  await tool.execute(ARGS, exec())
  assert.equal(seen.length, 1, '一批只报一次')
  assert.deepEqual(seen[0], { count: 3, startsAtCall: 0, rampLimit: 4, rampIntervalMs: 700 }, '回调发生在零子任务启动时')
})

test('T-127 前置校验失败:不触发开跑预检(零子任务启动就不该有开跑日志)', async () => {
  const fake = createFakeLauncher()
  let calls = 0
  await assert.rejects(
    () => makeTool(fake, { onBatchStart: () => { calls += 1 } }).execute({ ...ARGS, items: ['单条'] }, exec()),
    /at least 2 items/,
  )
  assert.equal(calls, 0)
  assert.equal(fake.starts.length, 0)
})

test('T-127 未提供 onBatchStart:一切照旧(默认行为不变)', async () => {
  const fake = createFakeLauncher()
  const result = await makeTool(fake).execute(ARGS, exec())
  assert.match(result.text, /^agent_swarm: 3 items/)
})

// ─── T-132:参数声明必须与实现一致(对象条目/占位符/保留键都要声明) ───

test('T-132 items 声明同时允许字符串与对象;模板描述写明字段占位符与内置变量', () => {
  const props = AGENT_SWARM_PARAMETERS.properties as Record<string, { items?: { oneOf?: Array<{ type?: string }> }; description?: string }>
  const itemNode = props.items.items
  assert.ok(Array.isArray(itemNode?.oneOf), 'items 元素必须用 oneOf 声明两种形态')
  const types = (itemNode?.oneOf ?? []).map((n) => n.type)
  assert.ok(types.includes('string'), '字符串条目必须声明')
  assert.ok(types.includes('object'), '对象条目必须声明(否则模型永远不会用结构化条目)')
  assert.match(String(props.items.description), /object/, 'items 描述要提到对象形态')
  assert.match(String(props.items.description), /agent/, 'items 描述要提到保留键 agent(续跑)')
  const tpl = String(props.prompt_template?.description ?? '')
  assert.match(tpl, /\{\{item\./, 'prompt_template 描述要提到 {{item.<key>}}')
  assert.match(tpl, /\{\{index\}\}/, 'prompt_template 描述要提到内置 {{index}}')
  assert.match(tpl, /\{\{total\}\}/, 'prompt_template 描述要提到内置 {{total}}')
})

// ─── T-134:对外声明与实现彻底对齐(required / reason 全量取值 / state 语义) ───

test('T-134 声明一致性:prompt_template 必需、reason 覆盖全部取值、state 有语义说明', () => {
  assert.deepEqual(AGENT_SWARM_PARAMETERS.required, ['description', 'prompt_template', 'items'], 'prompt_template 缺失即抛错,必须声明为必需')
  const itemProps = (AGENT_SWARM_OUTPUT.schema.properties as never as { items: { items: { properties: Record<string, { description?: string }> } } }).items.items.properties
  const reasonDoc = String(itemProps.reason.description ?? '')
  for (const value of ['timeout', 'empty-output', 'provider-error', 'max-tokens', 'refusal', 'aborted', 'attempts-exhausted', 'deadlock', 'failed']) {
    assert.match(reasonDoc, new RegExp(value), 'reason 描述必须覆盖取值 ' + value)
  }
  const stateDoc = String(itemProps.state.description ?? '')
  assert.match(stateDoc, /started/, 'state 必须说明取值 started')
  assert.match(stateDoc, /not_started/, 'state 必须说明取值 not_started')
  assert.match(stateDoc, /settle|落位|when it/i, 'state 必须说明它描述的是落位时的状态,不是当前状态')
})

// ─── T-139:结构化值里的每个顶层字段都必须在 output schema 里声明 ───

test('T-139 output schema 必须声明结构化值可能出现的全部顶层字段(否则 additionalProperties:false 会让整批校验失败)', () => {
  const declared = Object.keys((AGENT_SWARM_OUTPUT.schema.properties ?? {}) as Record<string, unknown>)
  // 这些是 render/tool 真正会产出的字段;新增字段时必须同步 schema(本次就是漏了 path/pathReason 才炸)。
  for (const field of ['text', 'counts', 'items', 'usage', 'path', 'pathReason']) {
    assert.ok(declared.includes(field), 'output schema 必须声明字段 ' + field + ',实际: ' + declared.join(','))
  }
  // 反向:声明了但从不产出的字段也算漂移风险,这里只做正向断言。
})
