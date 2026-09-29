import test from 'node:test'
import assert from 'node:assert/strict'

// 不用 String.prototype.isWellFormed(需要 ES2024 lib);等价的孤代理判定。
const isWellFormedText = (value: string): boolean =>
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)
import {
  createSubagentLauncher,
  resolveSubagentService,
  type SubagentResultLike,
  type SubagentRunLike,
  type SubagentServiceLike,
  type SubagentStartRequestLike,
} from '../src/launcher-subagent.ts'
import { EMPTY_RESULT_MESSAGE } from '../src/launcher-llm.ts'
import type { AttemptCallbacks, SwarmTask } from '../src/scheduler.ts'

interface StartRecord { provider: string; request: SubagentStartRequestLike; run: FakeRun }

class FakeRun implements SubagentRunLike {
  readonly id = 'child-1'
  disposed = 0
  private resolve!: (value: SubagentResultLike) => void
  private reject!: (error: unknown) => void
  readonly result: Promise<SubagentResultLike>
  constructor() {
    this.result = new Promise<SubagentResultLike>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
  finish(value: SubagentResultLike): void { this.resolve(value) }
  fail(error: unknown): void { this.reject(error) }
  async dispose(): Promise<void> { this.disposed += 1 }
}

function createFakeService(plan: (attempt: number) => 'ok' | 'throw' = () => 'ok') {
  const starts: StartRecord[] = []
  let attempts = 0
  const service: SubagentServiceLike = {
    async start(provider, request) {
      attempts += 1
      const behavior = plan(attempts)
      starts.push({ provider, request, run: new FakeRun() })
      if (behavior === 'throw') throw new Error('provider unavailable')
      return starts[starts.length - 1].run
    },
  }
  return { service, starts, last: () => starts[starts.length - 1] }
}

const task = (index: number): SwarmTask => ({ index, item: 'item-' + index, prompt: 'do thing ' + index })

function driver() {
  const events: string[] = []
  const completions: Array<{ result: unknown; stopReason?: string }> = []
  const errors: Array<{ message: string; rateLimit?: boolean; ready?: boolean }> = []
  const cb: AttemptCallbacks = {
    onReady: () => { events.push('ready') },
    onComplete: (c) => { events.push('complete'); completions.push(c) },
    onError: (e) => { events.push('error'); errors.push(e) },
  }
  return { cb, events, completions, errors }
}

const flush = () => new Promise<void>((r) => setImmediate(r))

test('路径 B 正常完成:请求携带 provider/prompt/parent/signal,onReady 先于 onComplete', async () => {
  const fake = createFakeService()
  const parent = { id: 'agent-1' }
  const controller = new AbortController()
  const launcher = createSubagentLauncher({ subagents: fake.service, provider: 'spawn', parent })
  const d = driver()
  launcher.start(task(0), d.cb, controller.signal)
  await flush()
  const rec = fake.last()
  assert.equal(rec.provider, 'spawn')
  assert.deepEqual(rec.request.prompt, [{ type: 'text', text: 'do thing 0' }])
  assert.equal(rec.request.parent, parent)
  assert.equal(rec.request.signal, controller.signal)
  rec.run.finish({ output: [{ type: 'text', text: '  结论  ' }], stopReason: 'completed' })
  await flush()
  assert.deepEqual(d.events, ['ready', 'complete'])
  assert.equal(d.completions[0].result, '结论')
})

test('路径 B 失败映射:error/max-tokens/refusal → 非限流 onError(diagnostic 作文案)', async () => {
  for (const [stopReason, diagnostic, pattern] of [
    ['error', 'provider exploded', /provider exploded/],
    ['max-tokens', 'child hit token ceiling', /token ceiling/],
    ['refusal', 'child declined', /declined/],
  ] as const) {
    const fake = createFakeService()
    const launcher = createSubagentLauncher({ subagents: fake.service, provider: 'spawn', parent: {} })
    const d = driver()
    launcher.start(task(0), d.cb, new AbortController().signal)
    await flush()
    fake.last().run.finish({ output: [], diagnostic, stopReason })
    await flush()
    assert.equal(d.errors.length, 1, stopReason)
    assert.equal(d.errors[0].rateLimit, false, stopReason)
    assert.match(d.errors[0].message, pattern)
  }
})

test('路径 B 限流识别:diagnostic 命中 429 文案 → rateLimit:true 交调度器重排队', async () => {
  const fake = createFakeService()
  const launcher = createSubagentLauncher({ subagents: fake.service, provider: 'spawn', parent: {} })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await flush()
  fake.last().run.finish({ output: [], diagnostic: '429 Too Many Requests', stopReason: 'error' })
  await flush()
  assert.deepEqual(d.errors[0], { message: '429 Too Many Requests', rateLimit: true, ready: true })
})

test('路径 B 取消/超时:stopReason aborted 照常回报(由调度器决定丢弃或改写)', async () => {
  const fake = createFakeService()
  const launcher = createSubagentLauncher({ subagents: fake.service, provider: 'spawn', parent: {} })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await flush()
  fake.last().run.finish({ output: [], stopReason: 'aborted' })
  await flush()
  assert.equal(d.errors.length, 1)
  assert.equal(d.errors[0].rateLimit, false)
})

test('路径 B 空产物 → 空结论文案;abandoned → dispose 被调用', async () => {
  const fake = createFakeService()
  const launcher = createSubagentLauncher({ subagents: fake.service, provider: 'spawn', parent: {} })
  const d = driver()
  const task0 = task(0)
  launcher.start(task0, d.cb, new AbortController().signal)
  await flush()
  launcher.abandoned?.({ task: task0, outcome: 'cancelled' })
  assert.equal(fake.last().run.disposed, 1, 'abandoned 释放句柄')
  fake.last().run.finish({ output: [], stopReason: 'completed' })
  await flush()
  assert.equal(d.errors[0].message, EMPTY_RESULT_MESSAGE)
})

test('路径 B start 抛错 → onError(非限流, ready=false)', async () => {
  const fake = createFakeService(() => 'throw')
  const launcher = createSubagentLauncher({ subagents: fake.service, provider: 'spawn', parent: {} })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await flush()
  assert.deepEqual(d.errors[0], { message: 'provider unavailable', rateLimit: false, ready: false })
  assert.deepEqual(d.events, ['error'])
})

// ─── 服务解析:调用点 agent 作用域优先 ───

test('resolveSubagentService:优先 agent 作用域,取不到/抛错才回退', () => {
  const svc = { start: async () => { throw new Error('unused') } } as unknown as SubagentServiceLike
  const fallback = { start: async () => { throw new Error('unused') } } as unknown as SubagentServiceLike
  assert.equal(resolveSubagentService({ ctx: { get: (n: string) => (n === 'subagents' ? svc : undefined) } }, fallback), svc)
  assert.equal(resolveSubagentService({ ctx: { get: () => undefined } }, fallback), fallback)
  assert.equal(resolveSubagentService({ ctx: { get: () => { throw new Error('scope') } } }, fallback), fallback)
  assert.equal(resolveSubagentService(undefined, fallback), fallback)
  assert.equal(resolveSubagentService({}, undefined), undefined)
})

// ─── T-120:child id 上报 ───

test('路径 B 子会话 id 上报:start 成功后回调 onAgent(run.id)', async () => {
  const fake = createFakeService()
  const launcher = createSubagentLauncher({ subagents: fake.service, provider: 'spawn', parent: {} })
  const agents: string[] = []
  const d = driver()
  d.cb.onAgent = (id) => agents.push(id)
  launcher.start(task(0), d.cb, new AbortController().signal)
  await flush()
  assert.deepEqual(agents, ['child-1'], '发布后立刻上报子会话 id')
  fake.last().run.finish({ output: [{ type: 'text', text: 'ok' }], stopReason: 'completed' })
  await flush()
})

// ─── P1b:agentOptions 透传 ───

test('路径 B agentOptions 透传:配置的路由覆盖进入 start 请求', async () => {
  const fake = createFakeService()
  const agentOptions = { provider: 'deepseek-official', model: 'deepseek-pro' }
  const launcher = createSubagentLauncher({ subagents: fake.service, provider: 'spawn', parent: {}, agentOptions })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await flush()
  assert.deepEqual(fake.last().request.agentOptions, agentOptions)
  fake.last().run.finish({ output: [{ type: 'text', text: 'ok' }], stopReason: 'completed' })
  await flush()
})

// ─── T-133:子会话 label 也不得切碎代理对 ───

test('T-133 label 安全:item 含跨 60 码元边界的 emoji 时,label 不带孤代理', async () => {
  const fake = createFakeService()
  const launcher = createSubagentLauncher({ subagents: fake.service, provider: 'spawn', parent: {} })
  const d = driver()
  const emojiItem = 'a'.repeat(59) + '😀' + 'tail'
  launcher.start({ index: 0, item: emojiItem, prompt: 'p' }, d.cb, new AbortController().signal)
  await flush()
  const label = String(fake.last().request.label)
  assert.equal(isWellFormedText(label), true)
  assert.equal(label, 'a'.repeat(59), '回退到代理对之前')
  fake.last().run.finish({ output: [{ type: 'text', text: 'ok' }], stopReason: 'completed' })
  await flush()
})
