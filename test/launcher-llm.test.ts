import test, { mock, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import {
  createLlmLauncher,
  isRateLimitError,
  resolveAgentRoute,
  aggregateAssistantText,
  DEFAULT_SUBAGENT_SYSTEM_PROMPT,
  EMPTY_RESULT_MESSAGE,
  type LlmGenerateOptionsLike,
  type LlmStreamChunk,
  type LlmServiceLike,
} from '../src/launcher-llm.ts'
import { runSwarmBatch, type AttemptCallbacks, type SwarmTask, type SwarmResultEntry } from '../src/scheduler.ts'

// ─── 假 llm 服务:结构化 StreamChunk 协议(与宿主 dsh-llm 一致) ───

type FakeBehavior =
  | { kind: 'text'; text: string }
  | { kind: 'empty' }
  | { kind: 'rate-limit'; code?: string; status?: number; message?: string }
  | { kind: 'max-tokens' }
  | { kind: 'throw-sync'; error: unknown }
  | { kind: 'throw-async'; error: unknown }
  | { kind: 'manual' } // 由测试手动完成
  | { kind: 'hang' } // 挂到 signal abort,再下发 aborted finish

interface LlmCallRecord {
  options: LlmGenerateOptionsLike
  attempt: number
  index: number
}

function textChunks(text: string): LlmStreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    ...(text === '' ? [] : [{ type: 'text-delta', index: 0, text } satisfies LlmStreamChunk]),
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function abortedChunks(): LlmStreamChunk[] {
  return [{ type: 'finish', reason: { kind: 'aborted', failure: { message: 'The request was aborted.', code: 'ABORTED' } } }]
}

function createFakeLlm(plan: (index: number, attempt: number) => FakeBehavior) {
  const calls: LlmCallRecord[] = []
  const attemptsByIndex = new Map<number, number>()
  const manualResolvers = new Map<number, (chunks: LlmStreamChunk[]) => void>()

  function promptOf(options: LlmGenerateOptionsLike): string {
    const message = options.messages[0] as { content: Array<{ text?: string }> }
    return String(message.content[0]?.text ?? '')
  }

  async function* runChunks(index: number, behavior: FakeBehavior, signal?: AbortSignal): AsyncGenerator<LlmStreamChunk> {
    switch (behavior.kind) {
      case 'text':
        for (const chunk of textChunks(behavior.text)) yield chunk
        return
      case 'empty':
        for (const chunk of textChunks('')) yield chunk
        return
      case 'rate-limit':
        yield {
          type: 'finish',
          reason: {
            kind: 'error',
            failure: {
              message: behavior.message ?? '429 Too Many Requests',
              code: behavior.code ?? 'RATE_LIMIT',
              ...(behavior.status === undefined ? {} : { status: behavior.status }),
            },
          },
        }
        return
      case 'max-tokens':
        yield { type: 'text-delta', index: 0, text: 'partial' }
        yield { type: 'finish', reason: { kind: 'max-tokens' } }
        return
      case 'throw-async':
        throw behavior.error
      case 'manual': {
        const chunks = await new Promise<LlmStreamChunk[]>((resolve) => {
          manualResolvers.set(index, resolve)
          signal?.addEventListener('abort', () => resolve(abortedChunks()), { once: true })
        })
        manualResolvers.delete(index)
        for (const chunk of chunks) yield chunk
        return
      }
      case 'hang': {
        if (signal?.aborted !== true) {
          await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }))
        }
        for (const chunk of abortedChunks()) yield chunk
        return
      }
      default:
        return
    }
  }

  const llm: LlmServiceLike = {
    stream(options) {
      const index = Number(promptOf(options).replace(/^do thing /, ''))
      const attempt = (attemptsByIndex.get(index) ?? 0) + 1
      attemptsByIndex.set(index, attempt)
      calls.push({ options, attempt, index })
      const behavior = plan(index, attempt)
      if (behavior.kind === 'throw-sync') throw behavior.error
      return runChunks(index, behavior, options.signal)
    },
  }

  return {
    llm,
    calls,
    complete(index: number, text: string) {
      const resolve = manualResolvers.get(index)
      assert.ok(resolve !== undefined, `任务 ${index} 没有待完成的 manual 流`)
      resolve(textChunks(text))
    },
  }
}

// ─── 回调驱动器 ───

interface DriverEvents {
  cb: AttemptCallbacks
  events: string[]
  completions: Array<{ result: unknown; stopReason?: string }>
  errors: Array<{ message: string; rateLimit?: boolean; ready?: boolean }>
}

function createDriver(): DriverEvents {
  const events: string[] = []
  const completions: Array<{ result: unknown; stopReason?: string }> = []
  const errors: Array<{ message: string; rateLimit?: boolean; ready?: boolean }> = []
  const cb: AttemptCallbacks = {
    onReady: () => {
      events.push('ready')
    },
    onComplete: (completion) => {
      events.push('complete')
      completions.push(completion)
    },
    onError: (error) => {
      events.push('error')
      errors.push(error)
    },
  }
  return { cb, events, completions, errors }
}

const task = (index: number): SwarmTask => ({ index, item: `item-${index}`, prompt: `do thing ${index}` })

function makeLauncher(fake: ReturnType<typeof createFakeLlm>, overrides: Record<string, unknown> = {}) {
  return createLlmLauncher({
    llm: fake.llm,
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    ...overrides,
  })
}

async function until(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  assert.fail(`等待超时:${label}`)
}

function useFakeTimers(t: TestContext) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  t.after(() => mock.timers.reset())
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

// ─── 场景 1:正常完成 ───

test('正常完成:onReady 先于 onComplete,文本 trim 后返回,请求参数完整', async () => {
  const fake = createFakeLlm(() => ({ kind: 'text', text: '  结论:无回归风险\n' }))
  const driver = createDriver()
  const controller = new AbortController()
  makeLauncher(fake).start(task(0), driver.cb, controller.signal)
  await until(() => driver.events.length >= 2, 'ready+complete')
  assert.deepEqual(driver.events, ['ready', 'complete'])
  assert.equal(driver.completions.length, 1)
  assert.equal(driver.completions[0].result, '结论:无回归风险')

  const call = fake.calls[0]
  assert.equal(call.options.provider, 'deepseek-official')
  assert.equal(call.options.model, 'deepseek-flash')
  assert.equal(call.options.system, DEFAULT_SUBAGENT_SYSTEM_PROMPT)
  assert.equal(call.options.messages.length, 1)
  const message = call.options.messages[0] as unknown as {
    id: string
    role: string
    content: Array<{ type: string; text: string }>
    source: { kind: string; plugin: string }
  }
  assert.equal(message.role, 'user')
  assert.equal(typeof message.id, 'string')
  assert.equal(message.id.length > 0, true, '消息必须带 id(宿主 Message 结构)')
  assert.deepEqual(message.content, [{ type: 'text', text: 'do thing 0' }])
  assert.deepEqual(message.source, { kind: 'plugin', plugin: 'dsh-agent-swarm' })
  assert.ok(call.options.signal instanceof AbortSignal)
})

// ─── 场景 2:限流识别 → 挂起重排队 ───

test("限流识别:failure.code='RATE_LIMIT' → rateLimit:true、ready:true,执行层挂上 onSuspended", async () => {
  const fake = createFakeLlm(() => ({ kind: 'rate-limit' }))
  const driver = createDriver()
  makeLauncher(fake).start(task(0), driver.cb, new AbortController().signal)
  await until(() => driver.errors.length === 1, 'error')
  assert.deepEqual(driver.events, ['ready', 'error'])
  assert.deepEqual(driver.errors[0], { message: '429 Too Many Requests', rateLimit: true, ready: true, reason: 'provider-error' })
  assert.equal(typeof driver.cb.onSuspended, 'function', '执行层必须挂上调度器的挂起钩子')
})

test("限流识别:code='QUOTA' 与仅 status=429 同样按限流", async () => {
  const quota = createFakeLlm(() => ({ kind: 'rate-limit', code: 'QUOTA', message: 'quota exhausted' }))
  const quotaDriver = createDriver()
  makeLauncher(quota).start(task(0), quotaDriver.cb, new AbortController().signal)
  await until(() => quotaDriver.errors.length === 1, 'quota error')
  assert.equal(quotaDriver.errors[0].rateLimit, true)

  const status = createFakeLlm(() => ({ kind: 'rate-limit', code: 'SERVER', status: 429, message: 'provider rejected' }))
  const statusDriver = createDriver()
  makeLauncher(status).start(task(0), statusDriver.cb, new AbortController().signal)
  await until(() => statusDriver.errors.length === 1, 'status error')
  assert.equal(statusDriver.errors[0].rateLimit, true, 'HTTP 429 是明确的限流证据')
})

// ─── 场景 3:无法确定限流 → 非限流 ───

test('无法确定限流的错误一律按非限流(AUTH / 无特征文案 / stream 同步抛出 ready=false)', async () => {
  const auth = createFakeLlm(() => ({ kind: 'rate-limit', code: 'AUTH', status: 401, message: 'invalid api key' }))
  const authDriver = createDriver()
  makeLauncher(auth).start(task(0), authDriver.cb, new AbortController().signal)
  await until(() => authDriver.errors.length === 1, 'auth error')
  assert.deepEqual(authDriver.errors[0], { message: 'invalid api key', rateLimit: false, ready: true, reason: 'provider-error' })

  const sync = createFakeLlm(() => ({ kind: 'throw-sync', error: new Error('no adapter registered') }))
  const syncDriver = createDriver()
  makeLauncher(sync).start(task(0), syncDriver.cb, new AbortController().signal)
  await until(() => syncDriver.errors.length === 1, 'sync throw')
  assert.deepEqual(syncDriver.events, ['error'], '同步抛出时请求尚未发出,不报 ready')
  assert.deepEqual(syncDriver.errors[0], { message: 'no adapter registered', rateLimit: false, ready: false, reason: 'provider-error' })

  const asyncThrow = createFakeLlm(() => ({ kind: 'throw-async', error: new Error('transport reset') }))
  const asyncDriver = createDriver()
  makeLauncher(asyncThrow).start(task(0), asyncDriver.cb, new AbortController().signal)
  await until(() => asyncDriver.errors.length === 1, 'async throw')
  assert.deepEqual(asyncDriver.errors[0], { message: 'transport reset', rateLimit: false, ready: true, reason: 'provider-error' })
})

// ─── 场景 4:空结论 ───

test('空结论 → onError(非限流)文案 "Subagent completed without a final message."', async () => {
  const fake = createFakeLlm(() => ({ kind: 'empty' }))
  const driver = createDriver()
  makeLauncher(fake).start(task(0), driver.cb, new AbortController().signal)
  await until(() => driver.errors.length === 1, 'empty error')
  assert.equal(EMPTY_RESULT_MESSAGE, 'Subagent completed without a final message.')
  assert.deepEqual(driver.errors[0], { message: EMPTY_RESULT_MESSAGE, rateLimit: false, ready: true, reason: 'empty-output' })
  assert.equal(driver.completions.length, 0)
})

test('max-tokens 截断按失败上报(附明确文案),不当作完成', async () => {
  const fake = createFakeLlm(() => ({ kind: 'max-tokens' }))
  const driver = createDriver()
  makeLauncher(fake).start(task(0), driver.cb, new AbortController().signal)
  await until(() => driver.errors.length === 1, 'max-tokens error')
  assert.equal(driver.errors[0].rateLimit, false)
  assert.match(String(driver.errors[0].message), /max token/i)
})

// ─── 场景 5:取消传导 + abandoned 清理 ───

test('取消传导:任务 signal abort → 在途请求被 abort,回调发出(由调度器丢弃)', async () => {
  const fake = createFakeLlm(() => ({ kind: 'hang' }))
  const driver = createDriver()
  const controller = new AbortController()
  makeLauncher(fake).start(task(0), driver.cb, controller.signal)
  await until(() => fake.calls.length === 1, '请求已发出')
  assert.equal(fake.calls[0].options.signal?.aborted, false)
  controller.abort()
  await until(() => driver.errors.length === 1, 'abort 回调')
  assert.equal(fake.calls[0].options.signal?.aborted, true, '在途请求 signal 必须被传导')
  assert.deepEqual(driver.events, ['ready', 'error'])
  assert.equal(driver.errors[0].rateLimit, false)
})

test("abandoned:按任务释放句柄(abort 在途请求),重复调用不抛", async () => {
  const fake = createFakeLlm(() => ({ kind: 'hang' }))
  const driver = createDriver()
  const launcher = makeLauncher(fake)
  launcher.start(task(0), driver.cb, new AbortController().signal)
  await until(() => fake.calls.length === 1, '请求已发出')
  launcher.abandoned?.({ task: task(0), outcome: 'cancelled' })
  await until(() => driver.errors.length === 1, 'abandoned 后回调')
  assert.equal(fake.calls[0].options.signal?.aborted, true, 'abandoned 必须释放在途句柄')
  assert.doesNotThrow(() => launcher.abandoned?.({ task: task(0), outcome: 'cancelled' }))
})

// ─── 场景 6:聚合器 ───

test('aggregateAssistantText:无 delta 时回退 block-end 文本;未知块类型忽略', () => {
  const viaBlockEnd = aggregateAssistantText([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text: '只给了整块' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ])
  assert.equal(viaBlockEnd.text, '只给了整块')
  assert.equal(viaBlockEnd.reason.kind, 'stop')

  const withUnknown = aggregateAssistantText([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'a' },
    { type: 'reasoning-delta', index: 1, text: '思考' },
    { type: 'tool-call-delta', index: 2, id: 'c1', argumentsDelta: '{}' },
    { type: 'some-future-chunk' } as unknown as LlmStreamChunk,
    { type: 'text-delta', index: 0, text: 'b' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'ab' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ])
  assert.equal(withUnknown.text, 'ab', 'delta 优先,不与 block-end 重复累加;未知块不混入正文')

  const noFinish = aggregateAssistantText([{ type: 'text-delta', index: 0, text: 'x' }])
  assert.equal(noFinish.reason.kind, 'stop', '缺 finish 时按 stop 兜底(与 BlockAssembler 一致)')
})

// ─── 场景 7:限流判定表 ───

test('isRateLimitError:结构化码/状态优先,文案兜底,其余一律非限流', () => {
  assert.equal(isRateLimitError({ code: 'RATE_LIMIT', message: 'x' }), true)
  assert.equal(isRateLimitError({ code: 'QUOTA', message: 'x' }), true)
  assert.equal(isRateLimitError({ code: 'SERVER', status: 429, message: 'x' }), true)
  assert.equal(isRateLimitError(new Error('429 Too Many Requests')), true)
  assert.equal(isRateLimitError(new Error('rate limit exceeded')), true)
  assert.equal(isRateLimitError(new Error('Too many requests, slow down')), true)
  assert.equal(
    isRateLimitError(new Error('fetch failed', { cause: { status: 429, code: 'RATE_LIMIT' } })),
    true,
    'cause 链里的 429 也应识别',
  )
  assert.equal(isRateLimitError({ code: 'AUTH', status: 401, message: 'invalid api key' }), false)
  assert.equal(isRateLimitError(new Error('boom')), false)
  assert.equal(isRateLimitError(new Error('internal invariant violated')), false)
  assert.equal(isRateLimitError(undefined), false)
  assert.equal(isRateLimitError(null), false)
  assert.equal(isRateLimitError('429'), false, '裸字符串不做推断')
})

// ─── 场景 8:与调度器联调 ───

test('联调:3 个 items 全部 completed(results 按 index 落位)', async (t) => {
  useFakeTimers(t)
  const fake = createFakeLlm((index) => ({ kind: 'text', text: `done-${index}` }))
  const tasks = [task(0), task(1), task(2)]
  const results = await runSwarmBatch(tasks, makeLauncher(fake), {})
  assert.equal(results.length, 3)
  for (const [index, result] of results.entries()) {
    assert.equal(result.status, 'completed')
    assert.equal(result.state, 'started')
    assert.equal(result.result, `done-${index}`)
    assert.equal(result.task.index, index)
  }
})

test('联调:限流 → 退避 3s 重排队后成功;取消路径不误报 failed', async (t) => {
  useFakeTimers(t)
  const fake = createFakeLlm((index, attempt) => {
    if (index === 0) return attempt === 1 ? { kind: 'rate-limit' } : { kind: 'text', text: 'retried-ok' }
    return { kind: 'manual' } // 占位:限流期间保持未完成,避免触发死锁防护
  })
  const tasks = [task(0), task(1)]
  const promise = runSwarmBatch(tasks, makeLauncher(fake), {})
  await flush()
  assert.deepEqual(
    fake.calls.filter((c) => c.index === 0).map((c) => c.attempt),
    [1],
    '第 1 次尝试被限流',
  )
  // 占位任务先完成,腾出容量(容量在限流模式已收缩到 1)
  fake.complete(1, 'placeholder-done')
  await flush()
  mock.timers.tick(3_000)
  await flush()
  const results: SwarmResultEntry[] = await promise
  assert.deepEqual(
    fake.calls.filter((c) => c.index === 0).map((c) => c.attempt),
    [1, 2],
    '限流后自动重试(ready → 轻罚 3s)',
  )
  assert.equal(results[0].status, 'completed')
  assert.equal(results[0].result, 'retried-ok')
  assert.equal(results[1].status, 'completed')
  assert.ok(results.every((r) => r.status === 'completed'), '限流中间态不产出 failed')
})

test('联调:用户取消 → 在途请求被 abort,结果标 aborted(两种文案)且不误报 failed', async (t) => {
  useFakeTimers(t)
  const fake = createFakeLlm(() => ({ kind: 'hang' }))
  const tasks = [task(0), task(1), task(2)]
  const controller = new AbortController()
  const promise = runSwarmBatch(tasks, makeLauncher(fake), { signal: controller.signal })
  await flush()
  assert.equal(fake.calls.length, 3, '首波 3 个全部发出')
  controller.abort()
  const results = await promise
  assert.equal(fake.calls.every((c) => c.options.signal?.aborted === true), true, '在途请求全部被传导取消')
  assert.ok(results.every((r) => r.status === 'aborted'), '取消收尾不误报 failed')
  assert.ok(results.every((r) => r.state === 'started'))
})

// ─── 场景 11:可重试失败码可配(T-107) ───

test("默认不重试 SERVER;retryableFailureCodes 纳入后按挂起重排队上报", async () => {
  const behavior = () => ({ kind: 'rate-limit', code: 'SERVER', status: 503, message: 'upstream 503' }) as const

  const byDefault = createFakeLlm(behavior)
  const d1 = createDriver()
  makeLauncher(byDefault).start(task(0), d1.cb, new AbortController().signal)
  await until(() => d1.errors.length === 1, 'default SERVER')
  assert.equal(d1.errors[0].rateLimit, false, '默认只认 RATE_LIMIT/QUOTA')
  assert.equal(d1.errors[0].message, 'upstream 503')

  const configured = createFakeLlm(behavior)
  const d2 = createDriver()
  makeLauncher(configured, { retryableFailureCodes: ['RATE_LIMIT', 'QUOTA', 'SERVER'] }).start(
    task(0),
    d2.cb,
    new AbortController().signal,
  )
  await until(() => d2.errors.length === 1, 'configured SERVER')
  assert.equal(d2.errors[0].rateLimit, true, 'SERVER 纳入后可重排队')
  assert.equal(d2.errors[0].ready, true)
})

test('retryableFailureCodes 非法(空数组/空串/非数组) → 构造即抛', () => {
  const fake = createFakeLlm(() => ({ kind: 'text', text: 'ok' }))
  assert.throws(() => makeLauncher(fake, { retryableFailureCodes: [] }), /retryableFailureCodes/)
  assert.throws(() => makeLauncher(fake, { retryableFailureCodes: [''] }), /retryableFailureCodes/)
  assert.throws(() => makeLauncher(fake, { retryableFailureCodes: 'RATE_LIMIT' }), /retryableFailureCodes/)
})

// ─── T-113:自定义 system 提示 ───

test('systemPrompt 可覆盖:自定义 system 进请求,子任务遵循调用方约定', async () => {
  const fake = createFakeLlm(() => ({ kind: 'text', text: 'ok' }))
  const driver = createDriver()
  makeLauncher(fake, { systemPrompt: '只回一行 JSON。' }).start(task(0), driver.cb, new AbortController().signal)
  await until(() => driver.completions.length === 1, 'complete')
  assert.equal(fake.calls[0].options.system, '只回一行 JSON。')
})

// ─── T-119:会话路由解析 ───

test('resolveAgentRoute:合法形状返回路由,其余一律 undefined(不猜字段)', () => {
  assert.deepEqual(resolveAgentRoute({ options: { provider: 'deepseek-official', model: 'deepseek-flash' } }), {
    provider: 'deepseek-official',
    model: 'deepseek-flash',
  })
  assert.equal(resolveAgentRoute({ options: { provider: 'p' } }), undefined)
  assert.equal(resolveAgentRoute({ options: {} }), undefined)
  assert.equal(resolveAgentRoute({}), undefined)
  assert.equal(resolveAgentRoute(undefined), undefined)
  assert.equal(resolveAgentRoute({ options: { provider: '  ', model: 'm' } }), undefined)
})

// ─── T-125:usage 采集 ───

test('T-125 launcher:流里的 usage chunk 落进 onComplete(缺字段则不出现在完成回调里)', async () => {
  const fake = createFakeLlm(() => ({ kind: 'text', text: '结论' }))
  const launcher = createLlmLauncher({ llm: fake.llm, provider: 'deepseek-official', model: 'deepseek-flash' })
  const completions: Array<{ usage?: unknown }> = []
  const cb = {
    onReady: () => {},
    onComplete: (c: { usage?: unknown }) => { completions.push(c) },
    onError: () => {},
  }
  launcher.start({ index: 0, item: 'i', prompt: 'p' }, cb as never, new AbortController().signal)
  await new Promise<void>((r) => setImmediate(r))
  assert.equal(completions.length, 1)
  assert.deepEqual(completions[0].usage, { inputTokens: 1, outputTokens: 1 })
})
