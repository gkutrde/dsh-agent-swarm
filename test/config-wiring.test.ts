import test from 'node:test'
import assert from 'node:assert/strict'
import { Config, apply } from '../src/index.ts'
import { createLlmLauncher } from '../src/launcher-llm.ts'
import type { LlmServiceLike } from '../src/launcher-llm.ts'

// 复现 T-114:插件行没写 config 时,schemastery 会把 z.array() 解析成空数组,
// 而 launcher 要求非空码表 → 默认配置下每次调用都抛错。这条用最小假 llm 卡住接线。
const fakeLlm: LlmServiceLike = {
  stream() {
    return (async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  },
}

test('Config 默认值可直接构建 launcher(空 config 不得让必填项变成空数组)', () => {
  const resolved = Config({}) as { provider: string; model: string; retryableFailureCodes?: string[] }
  assert.equal(resolved.provider, 'deepseek-official')
  assert.equal(resolved.model, 'deepseek-flash')
  assert.ok(
    Array.isArray(resolved.retryableFailureCodes) && resolved.retryableFailureCodes.length > 0,
    'retryableFailureCodes 默认必须是非空码表,否则 launcher 构造即抛: ' + JSON.stringify(resolved.retryableFailureCodes),
  )
  assert.equal(
    String((resolved as { subagentProvider?: string }).subagentProvider ?? '').trim(),
    '',
    '默认不得启用路径 B(subagentProvider 必须为空)',
  )
  assert.doesNotThrow(() =>
    createLlmLauncher({
      llm: fakeLlm,
      provider: resolved.provider,
      model: resolved.model,
      ...(resolved.retryableFailureCodes === undefined ? {} : { retryableFailureCodes: resolved.retryableFailureCodes }),
    }),
  )
})

test('显式传空数组仍应被拒(严格校验保留)', () => {
  assert.throws(
    () => createLlmLauncher({ llm: fakeLlm, provider: 'p', model: 'm', retryableFailureCodes: [] }),
    /retryableFailureCodes/,
  )
})

test('apply 不得直接访问未注入的服务(cordis 对未 inject 的属性访问会抛错)', () => {
  const allowed = new Set(['effect', 'logger', 'tools', 'llm', 'get'])
  const registered: unknown[] = []
  const target = {
    effect: (fn: () => unknown) => { registered.push(fn()) },
    logger: { info: () => {} },
    tools: { register: (definition: unknown) => { registered.push(definition); return () => {} } },
    llm: fakeLlm,
    get: () => undefined,
  }
  // 复现 cordis 的守卫:访问未声明/未注入的服务属性即抛错
  const guarded = new Proxy(target as Record<string | symbol, unknown>, {
    get(obj, key) {
      if (typeof key === 'string' && !allowed.has(key)) {
        throw new Error('cannot get property "' + key + '" without inject')
      }
      return Reflect.get(obj, key)
    },
  })
  assert.doesNotThrow(() => apply(guarded as never, Config({}) as never))
  assert.equal(registered.length > 0, true, '工具应当被注册')
})

// ─── T-130:apply 的接线直接覆盖(此前 index.ts 是唯一没测的模块) ───

interface Harness {
  ctx: unknown
  definitions: Array<{ name: string; description: string; execute: (args: unknown, exec: unknown) => Promise<{ text: string }> }>
  logs: Array<{ msg: unknown; meta?: unknown }>
  starts: Array<{ provider: string; prompt: string; label?: string }>
  continuables: Array<{ provider: string; label: string; agentOptions?: unknown }>
  sent: Array<{ target: string; text: string }>
  agent: unknown
  llmCalls: number
}

function makeHarness(): Harness {
  const logs: Harness['logs'] = []
  const starts: Harness['starts'] = []
  const continuables: Harness['continuables'] = []
  const sent: Harness['sent'] = []
  let llmCalls = 0
  const subagents = {
    async start(provider: string, request: { prompt: Array<{ text: string }>; label?: string }) {
      starts.push({ provider, prompt: request.prompt[0].text, label: request.label })
      return {
        id: 'child-' + (starts.length - 1),
        result: Promise.resolve({ output: [{ type: 'text', text: 'ok' }], stopReason: 'completed' }),
        dispose: () => undefined,
      }
    },
    async startContinuable(spec: { provider: string; label: string; request: { agentOptions?: unknown } }) {
      continuables.push({ provider: spec.provider, label: spec.label, agentOptions: spec.request.agentOptions })
      return { childId: 'child-new', messageId: 'm1' }
    },
    async sendMessage(_parent: unknown, target: string, content: Array<{ text: string }>) {
      sent.push({ target, text: content[0].text })
      return 'm2'
    },
    interrupt: () => undefined,
  }
  // 每次读都推进 seq:否则续跑用例会认为「没有新消息」而轮询到超时(踩过一次)。
  let reads = 0
  const sessions = {
    async readSession() {
      reads += 1
      return { events: [{ type: 'assistant/message', seq: 8 + reads, data: { message: { content: [{ type: 'text', text: '子会话结论' }] } } }] }
    },
  }
  const agents = { get: () => ({ status: 'idle' }) }
  const llm = {
    stream() {
      llmCalls += 1
      return (async function* () {
        yield { type: 'text-delta', index: 0, text: 'ok-' + llmCalls }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
  const definitions: Harness['definitions'] = []
  const allowed = new Set(['effect', 'logger', 'tools', 'llm', 'get'])
  const target = {
    effect: (fn: () => unknown) => fn(),
    logger: { info: (msg: unknown, meta?: unknown) => logs.push({ msg, meta }) },
    tools: { register: (definition: unknown) => { definitions.push(definition as never); return () => undefined } },
    llm,
    get: (name: string) => (name === 'subagents' ? subagents : name === 'sessionQuery' ? sessions : name === 'agents' ? agents : undefined),
  }
  const ctx = new Proxy(target as Record<string | symbol, unknown>, {
    get(obj, key) {
      if (typeof key === 'string' && !allowed.has(key)) throw new Error('cannot get property "' + key + '" without inject')
      return Reflect.get(obj, key)
    },
  })
  const agent = { ctx: { get: (name: string) => (name === 'subagents' ? subagents : name === 'sessionQuery' ? sessions : name === 'agents' ? agents : undefined) } }
  return { ctx, definitions, logs, starts, continuables, sent, agent, get llmCalls() { return llmCalls } } as Harness
}

const execWith = (agent: unknown) => ({ signal: new AbortController().signal, agent })

test('T-130 默认配置:路径 A 文案、不注册进度钩子(执行后零日志)', async () => {
  const h = makeHarness()
  apply(h.ctx as never, Config({}) as never)
  assert.equal(h.definitions.length, 1)
  const tool = h.definitions[0]
  assert.match(tool.description, /NO tools/, '默认走路径 A 文案')
  const value = await tool.execute({ description: 'd', prompt_template: '看 {{item}}', items: ['a', 'b', 'c'] }, execWith(undefined))
  assert.match(value.text, /^agent_swarm: 3 items — completed: 3/)
  // apply 会写一条「注册工具」日志;这里只要求**没有任何进度类日志**。
  assert.equal(
    h.logs.filter((l) => /starting |\[#/.test(String(l.msg))).length,
    0,
    'progressLog 默认关 -> 不写开跑预检/落位日志',
  )
})

test('T-130 progressLog:开跑预检行在最前,落位行各带结构化字段', async () => {
  const h = makeHarness()
  apply(h.ctx as never, Config({ progressLog: true, rampLimit: 2, rampIntervalMs: 500 }) as never)
  const value = await h.definitions[0].execute({ description: 'd', prompt_template: '看 {{item}}', items: ['a', 'b', 'c'] }, execWith(undefined))
  assert.match(value.text, /completed: 3/)
  // apply 时先有一条「注册工具」日志,所以按内容定位预检行(不能假设下标)。
  const preflight = h.logs.findIndex((l) => /starting 3 subtasks/.test(String(l.msg)))
  assert.ok(preflight >= 0, '必须有开跑预检行')
  assert.match(String(h.logs[preflight].msg), /\(first wave 2, \+1 every 500ms/)
  assert.equal(h.logs.length, preflight + 1 + 3, '预检之后是 3 行落位')
  const meta = h.logs[preflight + 1].meta as { index: number; outcome: string }
  assert.equal(typeof meta.index, 'number')
  assert.equal(meta.outcome, 'completed')
})

test('T-130 路径 B:描述切文案,且执行走 subagents.start(不再调 llm)', async () => {
  const h = makeHarness()
  apply(h.ctx as never, Config({ subagentProvider: 'spawn' }) as never)
  assert.doesNotMatch(h.definitions[0].description, /NO tools/, '路径 B 不得再声明无工具')
  assert.match(h.definitions[0].description, /WITH tools/)
  const value = await h.definitions[0].execute({ description: 'd', prompt_template: '看 {{item}}', items: ['a', 'b'] }, execWith(h.agent))
  assert.match(value.text, /completed: 2/)
  assert.equal(h.starts.length, 2)
  assert.equal(h.starts[0].provider, 'spawn')
  assert.equal(h.starts[0].prompt, '看 a')
  assert.equal(h.llmCalls, 0, '路径 B 不该再走 llm.stream')
})

test('T-130 续跑:resumeEnabled 时描述补 agent 键说明,且单条续跑走 sendMessage', async () => {
  const h = makeHarness()
  apply(h.ctx as never, Config({ subagentProvider: 'spawn', resumeEnabled: true }) as never)
  assert.match(h.definitions[0].description, /resumed=true/)
  await h.definitions[0].execute({ description: 'd', prompt_template: '继续 {{item.agent}}', items: [{ agent: 'child-9' }] }, execWith(h.agent))
  assert.deepEqual(h.sent, [{ target: 'child-9', text: '继续 child-9' }], '单条续跑 = sendMessage,不新建')
  assert.equal(h.continuables.length, 0)
})

test('T-130 subagentAgentOptions:开关打开才把 provider/model 作为 AgentOptions 下传', async () => {
  const h = makeHarness()
  apply(h.ctx as never, Config({ subagentProvider: 'spawn', resumeEnabled: true, subagentAgentOptions: true }) as never)
  await h.definitions[0].execute({ description: 'd', prompt_template: '看 {{item}}', items: ['a', 'b'] }, execWith(h.agent))
  assert.equal(h.continuables.length, 2, '两个新建条目 -> 两次 startContinuable')
  assert.deepEqual(h.continuables[0].agentOptions, { provider: 'deepseek-official', model: 'deepseek-flash' })
})

// ─── T-138:工具层必须把 exec.signal 接给调度器(否则用户取消会一直等到超时) ───

test('T-138 端到端取消:exec.signal 触发后批量及时收尾,全部条目判 aborted', async () => {
  const logs: Array<{ msg: unknown }> = []
  const definitions: Array<{ execute: (args: unknown, exec: unknown) => Promise<{ text: string; counts: { aborted: number } }> }> = []
  // 执行层永不产出:只有取消能让它收尾。
  const llm = {
    stream() {
      return (async function* () {
        await new Promise(() => undefined)
      })()
    },
  }
  const target = {
    effect: (fn: () => unknown) => fn(),
    logger: { info: (msg: unknown) => logs.push({ msg }) },
    tools: { register: (definition: unknown) => { definitions.push(definition as never); return () => undefined } },
    llm,
    get: () => undefined,
  }
  const ctx = new Proxy(target as Record<string | symbol, unknown>, { get: (obj, key) => Reflect.get(obj, key) })
  apply(ctx as never, Config({}) as never)
  const controller = new AbortController()
  const started = Date.now()
  const promise = definitions[0].execute(
    { description: 'd', prompt_template: '看 {{item}}', items: ['a', 'b', 'c'] },
    { signal: controller.signal, agent: undefined },
  )
  await new Promise<void>((resolve) => setTimeout(resolve, 20))
  controller.abort()
  const value = await Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('取消后未及时收尾(接线可能断了)')), 5_000)),
  ])
  assert.equal(value.counts.aborted, 3, '三条都判 aborted')
  assert.match(value.text, /aborted: 3/)
  assert.ok(Date.now() - started < 5_000, '必须及时收尾,不得等到超时')
})
