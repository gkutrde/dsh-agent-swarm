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
  definitions: Array<{
    name: string
    description: string
    execute: (args: unknown, exec: unknown) => Promise<{
      text: string
      counts?: { completed: number; failed: number; aborted: number }
      // T-139:路径信息进结构化值(人读 text 不变)
      path?: 'llm' | 'subagent'
      pathReason?: string
    }>
  }>
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

// ─── T-139:auto 路由(插件自己判断走 A 还是 B) ───

test('T-139 auto:像要读文件的批次 -> 走路径 B(条目带 agentId,path=subagent)', async () => {
  const h = makeHarness()
  apply(h.ctx as never, Config({ subagentProvider: 'auto', resumeEnabled: true }) as never)
  const r = await h.definitions[0].execute(
    { description: 'auto-b', prompt_template: '读取文件 {{item}} 并回答第一行', items: ['a.ts', 'b.ts'] },
    execWith(h.agent),
  )
  assert.match(h.definitions[0].description, /AUTOMATIC/, 'auto 时描述应说明路由自动')
  assert.equal(r.path, 'subagent')
  assert.equal(h.continuables.length, 2, 'auto 判到 B -> 走续跑 launcher(配置里 resumeEnabled=true)')
  assert.equal(h.continuables[0].provider, 'spawn', 'auto 必须解析成真实提供方名(不能把 "auto" 传给宿主)')
})

test('T-139 auto:纯问答批次 -> 走路径 A(path=llm,不创建子代理)', async () => {
  const h = makeHarness()
  apply(h.ctx as never, Config({ subagentProvider: 'auto' }) as never)
  const r = await h.definitions[0].execute(
    { description: 'auto-a', prompt_template: '只回答 {{item}} 这个字', items: ['甲', '乙'] },
    execWith(h.agent),
  )
  assert.equal(r.path, 'llm')
  assert.equal(h.starts.length, 0, '不得创建子代理')
  assert.equal(h.llmCalls, 2, '两条各一次 llm 调用')
})

test('T-139 auto:判到 B 但 subagents 服务不可用 -> 退回 A 并标注,不整批失败', async () => {
  // 真·无服务环境:插件 ctx 与 agent 作用域都取不到 subagents(共享假件始终带服务,不能用来测降级 —— 踩过一次)。
  const definitions: Array<{ execute: (a: unknown, e: unknown) => Promise<{ path?: string; pathReason?: string }> }> = []
  let llmCalls = 0
  const bareCtx = {
    effect: (fn: () => unknown) => fn(),
    logger: { info: () => undefined },
    tools: { register: (d: unknown) => { definitions.push(d as never); return () => undefined } },
    llm: {
      stream() {
        llmCalls += 1
        return (async function* () {
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    },
    get: () => undefined,
  }
  apply(bareCtx as never, Config({ subagentProvider: 'auto' }) as never)
  const r = await definitions[0].execute(
    { description: 'auto-fallback', prompt_template: '读取文件 {{item}}', items: ['x', 'y'] },
    { signal: new AbortController().signal, agent: { ctx: { get: () => undefined } } },
  )
  assert.equal(r.path, 'llm', '服务缺失必须退回 A')
  assert.match(String(r.pathReason), /fallback/, '理由里要标注降级')
  assert.equal(llmCalls, 2, '退回 A 后应真的走 llm')
})

test('T-139 旧行为不回归:空=固定 A,显式提供方名=固定 B', async () => {
  const a = makeHarness()
  apply(a.ctx as never, Config({}) as never)
  const ra = await a.definitions[0].execute({ description: 'x', prompt_template: '读取文件 {{item}}', items: ['p', 'q'] }, execWith(a.agent))
  assert.equal(ra.path, 'llm', '默认必须仍是路径 A(即使模板像要读文件)')
  const b = makeHarness()
  apply(b.ctx as never, Config({ subagentProvider: 'spawn' }) as never)
  const rb = await b.definitions[0].execute({ description: 'y', prompt_template: '只回答 {{item}}', items: ['甲', '乙'] }, execWith(b.agent))
  assert.equal(rb.path, 'subagent', '显式 spawn 必须仍是 B(即使模板不需要工具)')
  assert.equal(b.starts[0]?.provider, 'spawn', '显式值必须原样传给宿主')
})

// ─── T-140:per-call 模型路由(批次参数 > 配置) ───

test('T-140 批次参数 model/provider 覆盖配置(路径 A 的 llm.stream 收到该值)', async () => {
  const seen: Array<{ provider?: string; model?: string }> = []
  const definitions: Array<{ execute: (a: unknown, e: unknown) => Promise<{ path?: string }> }> = []
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    logger: { info: () => undefined },
    tools: { register: (d: unknown) => { definitions.push(d as never); return () => undefined } },
    llm: {
      stream(request: { provider?: string; model?: string }) {
        seen.push({ provider: request?.provider, model: request?.model })
        return (async function* () {
          yield { type: 'text-delta', index: 0, text: 'ok' }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    },
    get: () => undefined,
  }
  apply(ctx as never, Config({ provider: 'deepseek-official', model: 'deepseek-flash' }) as never)
  await definitions[0].execute(
    { description: 'percall', prompt_template: '只回答 {{item}}', items: ['甲', '乙'], provider: 'kimi-coding', model: 'k3' },
    { signal: new AbortController().signal, agent: undefined },
  )
  assert.equal(seen.length, 2, '两条各一次调用')
  assert.deepEqual(seen[0], { provider: 'kimi-coding', model: 'k3' }, '批次参数必须覆盖配置')
})
