import test, { mock, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import {
  SwarmBatch,
  runSwarmBatch,
  INITIAL_LAUNCH_LIMIT,
  INITIAL_LAUNCH_INTERVAL_MS,
  RATE_LIMIT_RETRY_BASE_MS,
  RATE_LIMIT_CAPACITY_RECOVERY_INTERVAL_MS,
  SUSPENDED_REASON,
  SUBAGENT_TIMEOUT_MESSAGE,
  CANCEL_STARTED_MESSAGE,
  CANCEL_NOT_STARTED_MESSAGE,
  type SwarmTask,
  type AttemptCallbacks,
  type SwarmLauncher,
  type SwarmResultEntry,
} from '../src/scheduler.ts'

// ─── 假执行层:可编程 launcher(行为在 microtask 中回调,模拟真实异步执行层) ───

type Behavior =
  | 'success' // onReady + onComplete
  | 'ready-hang' // onReady 后挂起,直到 signal abort
  | 'hang' // 挂起,直到 signal abort
  | 'manual' // 什么也不做,由测试手动驱动 api
  | { rateLimit: true; ready?: boolean; message?: string }
  | { fail: string }

interface AttemptApi extends AttemptCallbacks {
  signal: AbortSignal
}

interface StartRecord {
  index: number
  attempt: number
  t: number
}

function createFakeLauncher(plan: (task: SwarmTask, attempt: number) => Behavior) {
  const starts: StartRecord[] = []
  const apis: Array<{ index: number; attempt: number; api: AttemptApi }> = []
  const abandonedCalls: Array<{ index: number; outcome: string; error?: string }> = []
  const suspendedCalls: Array<{ index: number; reason: string }> = []
  const attemptCounts = new Map<number, number>()
  let activeCount = 0
  let maxActive = 0

  const launcher: SwarmLauncher = {
    start(task, cb, signal) {
      const attempt = (attemptCounts.get(task.index) ?? 0) + 1
      attemptCounts.set(task.index, attempt)
      starts.push({ index: task.index, attempt, t: Date.now() })
      activeCount += 1
      maxActive = Math.max(maxActive, activeCount)
      let settled = false
      // onSuspended 钩子是执行层提供的:挂回 callbacks,调度器 requeue 时回调
      cb.onSuspended = (info) => {
        suspendedCalls.push({ index: task.index, reason: info.reason })
      }
      const api: AttemptApi = {
        signal,
        onReady: () => cb.onReady(),
        onComplete: (completion) => {
          if (settled) return
          settled = true
          activeCount -= 1
          cb.onComplete(completion)
        },
        onError: (error) => {
          if (settled) return
          settled = true
          activeCount -= 1
          cb.onError(error)
        },
      }
      apis.push({ index: task.index, attempt, api })
      const behavior = plan(task, attempt)
      queueMicrotask(() => {
        if (settled) return
        if (behavior === 'success') {
          api.onReady()
          api.onComplete({ result: `done-${task.index}` })
        } else if (behavior === 'ready-hang') {
          api.onReady()
          signal.addEventListener('abort', () => api.onError({ message: 'aborted' }), { once: true })
        } else if (behavior === 'hang') {
          signal.addEventListener('abort', () => api.onError({ message: 'aborted' }), { once: true })
        } else if (behavior === 'manual') {
          // 测试手动驱动
        } else if ('rateLimit' in behavior) {
          if (behavior.ready) api.onReady()
          api.onError({
            message: behavior.message ?? '429 too many requests',
            rateLimit: true,
            ready: behavior.ready ?? false,
          })
        } else {
          api.onError({ message: behavior.fail })
        }
      })
    },
    abandoned(info) {
      abandonedCalls.push({ index: info.task.index, outcome: info.outcome, error: info.error })
    },
  }
  return {
    launcher,
    starts,
    apis,
    abandonedCalls,
    suspendedCalls,
    get maxActive() {
      return maxActive
    },
  }
}

function makeTasks(count: number, extra?: Partial<SwarmTask>): SwarmTask[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    item: `item-${index}`,
    prompt: `do thing ${index}`,
    ...extra,
  }))
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

function useFakeTimers(t: TestContext) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  t.after(() => mock.timers.reset())
}

// ─── 场景 1:首波 + 700ms 放量 ───

test('首波 5 个,之后每 700ms 放一个;结果按 index 落位全部 completed', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(12)
  const fake = createFakeLauncher(() => 'success')
  const promise = runSwarmBatch(tasks, fake.launcher, {})
  await flush()
  assert.deepEqual(
    fake.starts.map((s) => ({ index: s.index, t: s.t })),
    Array.from({ length: INITIAL_LAUNCH_LIMIT }, (_, index) => ({ index, t: 0 })),
  )
  // 注意:mock.timers.tick 是时间跳跃,链式定时器必须按步进 tick 才会逐个触发
  for (let i = 0; i < 7; i++) mock.timers.tick(INITIAL_LAUNCH_INTERVAL_MS)
  await flush()
  const results = await promise
  assert.equal(fake.starts.length, 12)
  assert.deepEqual(
    fake.starts.slice(5).map((s) => s.t),
    [1, 2, 3, 4, 5, 6, 7].map((i) => i * INITIAL_LAUNCH_INTERVAL_MS),
  )
  assert.equal(results.length, 12)
  for (const [index, result] of results.entries()) {
    assert.equal(result.task.index, index)
    assert.equal(result.status, 'completed')
    assert.equal(result.result, `done-${index}`)
  }
})

// ─── 场景 2:maxConcurrency 闸门 ───

test('maxConcurrency=3 时任意时刻在跑 ≤3,空位出现后补位', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(6)
  const fake = createFakeLauncher(() => 'manual')
  const batch = new SwarmBatch(tasks, fake.launcher, { maxConcurrency: 3 })
  const promise = batch.run()
  await flush()
  assert.equal(fake.starts.length, 3)
  assert.equal(fake.maxActive, 3)
  const apiOf = (index: number) => fake.apis.find((a) => a.index === index)!.api
  mock.timers.tick(INITIAL_LAUNCH_INTERVAL_MS * 2)
  await flush()
  assert.equal(fake.starts.length, 3, '并发满时 700ms 也不放量')
  apiOf(0).onComplete({ result: 'x' })
  await flush()
  assert.equal(fake.starts.length, 4, '完成一个后立即补位')
  apiOf(1).onComplete({ result: 'x' })
  await flush()
  assert.equal(fake.starts.length, 5)
  apiOf(2).onComplete({ result: 'x' })
  await flush()
  // normalLaunchCount 已 ≥5,最后一个走 700ms 放量
  mock.timers.tick(INITIAL_LAUNCH_INTERVAL_MS)
  await flush()
  assert.equal(fake.starts.length, 6)
  apiOf(3).onComplete({ result: 'x' })
  apiOf(4).onComplete({ result: 'x' })
  apiOf(5).onComplete({ result: 'x' })
  const results = await promise
  assert.equal(fake.maxActive, 3)
  assert.ok(results.every((r) => r.status === 'completed'))
})

// ─── 场景 3:限流退避序列 3/6/12s,挂起带 SUSPENDED_REASON,中间态不产出 failed ───

test('限流全流程:unshift 回队首,退避 3000/6000/12000,第 4 次成功', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(6)
  const fake = createFakeLauncher((task, attempt) => {
    if (task.index === 0) return 'ready-hang' // 保持未完成,避免触发死锁防护
    if (task.index === 5) return attempt <= 3 ? { rateLimit: true, ready: true } : 'success'
    return 'success' // idx1-4 即时成功,把限流容量垫高(每次限流收缩 -1)
  })
  const promise = runSwarmBatch(tasks, fake.launcher, {})
  await flush()
  // 首波 5 个是 idx0-4;idx5 在 700ms 放量时启动并第 1 次限流
  mock.timers.tick(INITIAL_LAUNCH_INTERVAL_MS)
  await flush()
  assert.equal(fake.suspendedCalls.length, 1)
  assert.equal(fake.suspendedCalls[0].reason, SUSPENDED_REASON)
  mock.timers.tick(3_000)
  await flush()
  mock.timers.tick(6_000)
  await flush()
  mock.timers.tick(12_000)
  await flush()
  const task5Starts = fake.starts.filter((s) => s.index === 5)
  assert.deepEqual(
    task5Starts.map((s) => s.t),
    [700, 3_700, 9_700, 21_700],
    '退避间隔 3s/6s/12s(无抖动)',
  )
  assert.equal(fake.suspendedCalls.length, 3)
  assert.ok(fake.suspendedCalls.every((c) => c.reason === SUSPENDED_REASON))
  // 收尾:idx0 手动完成
  fake.apis.find((a) => a.index === 0)!.api.onComplete({ result: 'long-done' })
  const results = await promise
  assert.ok(results.every((r) => r.status === 'completed'), '限流中间态不产出 failed')
})

// ─── 场景 4:ready 重轻罚 + 限流模式内一次成功复位 3s ───

test('重轻罚:未 ready 限流全局间隔 ×2;限流模式内 ready 成功后下一发间隔复位 3s', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(7)
  const fake = createFakeLauncher((task, attempt) => {
    if (task.index === 5) return attempt === 1 ? { rateLimit: true, ready: false } : 'success'
    return 'success'
  })
  const promise = runSwarmBatch(tasks, fake.launcher, {})
  await flush()
  // t=0 首波启动 idx0-4 并成功;idx5 在 700ms 放量时启动并被限流(未 ready → 重罚)
  mock.timers.tick(INITIAL_LAUNCH_INTERVAL_MS)
  await flush()
  const task5First = fake.starts.find((s) => s.index === 5)!
  assert.equal(task5First.t, INITIAL_LAUNCH_INTERVAL_MS)
  // 重罚:全局间隔 3000×2=6000,idx5 第二次启动在 700+6000
  mock.timers.tick(RATE_LIMIT_RETRY_BASE_MS * 2)
  await flush()
  const task5Starts = fake.starts.filter((s) => s.index === 5)
  assert.deepEqual(
    task5Starts.map((s) => s.t),
    [INITIAL_LAUNCH_INTERVAL_MS, INITIAL_LAUNCH_INTERVAL_MS + RATE_LIMIT_RETRY_BASE_MS * 2],
  )
  // idx5 ready 成功 → 全局间隔复位 3s,idx6 在 6700+3000 启动
  mock.timers.tick(RATE_LIMIT_RETRY_BASE_MS)
  await flush()
  const task6Starts = fake.starts.filter((s) => s.index === 6)
  assert.equal(task6Starts.length, 1)
  assert.equal(task6Starts[0].t, INITIAL_LAUNCH_INTERVAL_MS + RATE_LIMIT_RETRY_BASE_MS * 3)
  const results = await promise
  assert.ok(results.every((r) => r.status === 'completed'))
})

// ─── 场景 5:容量收缩到 1 后,180s 恢复 +1 才继续放量 ───

test('容量随限流逐次收缩(下限 1),容量满时等待 180s 恢复再放量', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(7)
  const fake = createFakeLauncher((task, attempt) => {
    if (task.index === 5) return 'ready-hang' // 一直占着一个容量槽
    if (task.index === 6) return attempt <= 6 ? { rateLimit: true, ready: true } : 'success'
    return 'success'
  })
  const batch = new SwarmBatch(tasks, fake.launcher, {})
  const promise = batch.run()
  await flush()
  mock.timers.tick(INITIAL_LAUNCH_INTERVAL_MS) // t=700: idx5 启动(ready,挂着)
  await flush()
  mock.timers.tick(INITIAL_LAUNCH_INTERVAL_MS) // t=1400: idx6 第 1 次限流(容量 7→6)
  await flush()
  mock.timers.tick(3_000) // t=4400: 第 2 次(→5)
  await flush()
  mock.timers.tick(6_000) // t=10400: 第 3 次(→4)
  await flush()
  mock.timers.tick(12_000) // t=22400: 第 4 次(→3)
  await flush()
  mock.timers.tick(24_000) // t=46400: 第 5 次(→2)
  await flush()
  mock.timers.tick(48_000) // t=94400: 第 6 次限流,容量收缩到 1,被 idx5 占满
  await flush()
  assert.equal(batch.rateLimitCapacity, 1)
  assert.equal(fake.starts.filter((s) => s.index === 6).length, 6)
  // idx6 的 retryReadyAt=190400 到了也不放:容量满,等 180s 恢复
  mock.timers.tick(96_000)
  await flush()
  assert.equal(fake.starts.filter((s) => s.index === 6).length, 6, '容量满时 retryReadyAt 到期也不启动')
  mock.timers.tick(RATE_LIMIT_CAPACITY_RECOVERY_INTERVAL_MS - 96_000)
  await flush()
  const task6Starts = fake.starts.filter((s) => s.index === 6)
  assert.deepEqual(
    task6Starts.map((s) => s.t),
    [1_400, 4_400, 10_400, 22_400, 46_400, 94_400, 94_400 + RATE_LIMIT_CAPACITY_RECOVERY_INTERVAL_MS],
    '第 7 次启动在最后一次限流 +180s(容量恢复 +1)',
  )
  // 收尾:idx5 手动完成
  fake.apis.find((a) => a.index === 5)!.api.onComplete({ result: 'long-done' })
  const results = await promise
  assert.ok(results.every((r) => r.status === 'completed'))
})

// ─── 场景 5b:容量收缩 2s 防抖 ───

test('两次 2s 内的限流只收缩一次容量(防抖)', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(5)
  const fake = createFakeLauncher((task, attempt) => {
    if (task.index >= 3) return attempt === 1 ? { rateLimit: true, ready: true } : 'success'
    return 'success'
  })
  const batch = new SwarmBatch(tasks, fake.launcher, {})
  const promise = batch.run()
  await flush()
  // startedSuccessCount=4:idx0-2 成功 + idx3 在限流模式生效前 ready 过。
  // 进入限流模式时容量 = max(1, 4) = 4 → 强制收缩到 3;第二次限流距首次 <2s → 防抖不收缩
  assert.equal(batch.rateLimitCapacity, 3, '两次同时限流只收缩一次(4→3 而非 4→2)')
  mock.timers.tick(3_000)
  await flush()
  mock.timers.tick(3_000)
  await flush()
  const results = await promise
  assert.ok(results.every((r) => r.status === 'completed'))
})

// ─── 场景 6:死锁防护 ───

test('仅剩 1 个未完成任务且持续限流 → 判 failed 并回调 launcher.abandoned', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(1)
  const fake = createFakeLauncher(() => ({ rateLimit: true, ready: true }))
  const promise = runSwarmBatch(tasks, fake.launcher, {})
  await flush()
  const results = await promise
  assert.equal(results[0].status, 'failed')
  assert.equal(results[0].state, 'started')
  assert.equal(results[0].error, '429 too many requests')
  assert.deepEqual(fake.abandonedCalls, [{ index: 0, outcome: 'failed', error: '429 too many requests' }])
  assert.equal(fake.suspendedCalls.length, 0, '死锁防护不走挂起')
})

// ─── 场景 7:外部取消 ───

test('运行中 abort:已完成保留;started/not_started 两种 aborted 文案;未 ready 的标 cancelled', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(7)
  const fake = createFakeLauncher((task) => {
    if (task.index === 0) return 'success'
    if (task.index === 1) return 'ready-hang'
    return 'hang'
  })
  const controller = new AbortController()
  const promise = runSwarmBatch(tasks, fake.launcher, { signal: controller.signal })
  await flush()
  controller.abort()
  const results = await promise
  assert.equal(results[0].status, 'completed', '已完成保留')
  for (const index of [1, 2, 3, 4]) {
    assert.equal(results[index].status, 'aborted')
    assert.equal(results[index].state, 'started')
    assert.equal(results[index].error, CANCEL_STARTED_MESSAGE)
  }
  for (const index of [5, 6]) {
    assert.equal(results[index].status, 'aborted')
    assert.equal(results[index].state, 'not_started')
    assert.equal(results[index].error, CANCEL_NOT_STARTED_MESSAGE)
  }
  assert.equal(CANCEL_STARTED_MESSAGE, 'The user manually interrupted this subagent batch before this subagent finished.')
  assert.equal(CANCEL_NOT_STARTED_MESSAGE, 'The user manually interrupted this subagent batch before this subagent was started.')
  // 未 ready 的活跃 attempt(idx2/3/4)标 cancelled;已 ready 的 idx1 与未启动的不回调
  assert.deepEqual(
    fake.abandonedCalls.map((c) => ({ index: c.index, outcome: c.outcome, error: c.error })),
    [
      { index: 2, outcome: 'cancelled', error: undefined },
      { index: 3, outcome: 'cancelled', error: undefined },
      { index: 4, outcome: 'cancelled', error: undefined },
    ],
  )
})

// ─── 场景 8:超时(含 >2^31-1 钳位) ───

test('task.timeoutMs 超时 → failed "Subagent timed out.";超大 timeout 钳位不溢出', async (t) => {
  useFakeTimers(t)
  const tasks: SwarmTask[] = [
    { index: 0, item: 'a', prompt: 'p0' },
    { index: 1, item: 'b', prompt: 'p1', timeoutMs: 50 },
    { index: 2, item: 'c', prompt: 'p2', timeoutMs: 3_000_000_000 },
  ]
  const fake = createFakeLauncher((task) => (task.index === 1 ? 'hang' : 'success'))
  const promise = runSwarmBatch(tasks, fake.launcher, {})
  await flush()
  mock.timers.tick(50)
  await flush()
  const results = await promise
  assert.equal(results[0].status, 'completed')
  assert.equal(results[1].status, 'failed')
  assert.equal(results[1].state, 'started')
  assert.equal(results[1].error, SUBAGENT_TIMEOUT_MESSAGE)
  assert.equal(SUBAGENT_TIMEOUT_MESSAGE, 'Subagent timed out.')
  assert.equal(results[2].status, 'completed', '3e9ms 超时钳位后不溢出、不误触发')
})

// ─── 场景 8b:完成判定 + 乱序落位 ───

test('混合成败:results 定长、按 index 落位,全部就位后才 resolve', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(3)
  const fake = createFakeLauncher(() => 'manual')
  const promise = runSwarmBatch(tasks, fake.launcher, {})
  let resolved = false
  void promise.then(() => {
    resolved = true
  })
  await flush()
  const apiOf = (index: number) => fake.apis.find((a) => a.index === index)!.api
  apiOf(2).onComplete({ result: 'done-2' })
  await flush()
  assert.equal(resolved, false, '未全部就位不 resolve')
  apiOf(1).onError({ message: 'boom' })
  await flush()
  assert.equal(resolved, false)
  apiOf(0).onComplete({ result: 'done-0' })
  const results: SwarmResultEntry[] = await promise
  assert.equal(results.length, 3)
  assert.equal(results[0].status, 'completed')
  assert.equal(results[1].status, 'failed')
  assert.equal(results[1].state, 'started')
  assert.equal(results[1].error, 'boom')
  assert.equal(results[2].status, 'completed')
  for (const [index, result] of results.entries()) assert.equal(result.task.index, index)
})

// ─── 场景 9:取消发生在 launcher.start 尚未返回时(参考实现 agentId 未定语义) ───

test('取消发生在 start 未返回时:该任务不回调 abandoned,其余任务不再启动', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(2)
  const controller = new AbortController()
  const abandonedCalls: Array<{ index: number; outcome: string }> = []
  const starts: number[] = []
  const launcher: SwarmLauncher = {
    start(task) {
      starts.push(task.index)
      // 同步取消:此刻 start 还没有返回,句柄尚未建立
      if (task.index === 0) controller.abort()
    },
    abandoned(info) {
      abandonedCalls.push({ index: info.task.index, outcome: info.outcome })
    },
  }
  const results = await runSwarmBatch(tasks, launcher, { signal: controller.signal })
  assert.deepEqual(starts, [0], '取消后不再启动其余任务')
  assert.deepEqual(abandonedCalls, [], '句柄未建立的任务不回调 abandoned(执行层自行清理)')
  for (const result of results) {
    assert.equal(result.status, 'aborted')
    assert.equal(result.state, 'not_started')
    assert.equal(result.error, CANCEL_NOT_STARTED_MESSAGE)
  }
})

// ─── 场景 10:ready 以 onReady 为准(上报值只能升级,不能降级) ───

test('onReady 已回调而 onError 上报 ready:false → 仍按轻罚(间隔 3s)', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(5)
  const fake = createFakeLauncher((task, attempt) => {
    if (task.index === 0) return 'ready-hang' // 占位,避免死锁防护
    if (task.index === 4) return attempt === 1 ? 'manual' : 'success' // 第 1 次限流由测试手动驱动
    return 'success'
  })
  const promise = runSwarmBatch(tasks, fake.launcher, {})
  await flush()
  const apiOf = (index: number) => fake.apis.filter((a) => a.index === index).at(-1)!.api
  apiOf(4).onReady() // 已发出首个请求
  apiOf(4).onError({ message: '429 too many requests', rateLimit: true, ready: false }) // 上报值却说没 ready
  await flush()
  mock.timers.tick(RATE_LIMIT_RETRY_BASE_MS)
  await flush()
  assert.deepEqual(
    fake.starts.filter((s) => s.index === 4).map((s) => s.t),
    [0, RATE_LIMIT_RETRY_BASE_MS],
    '轻罚 → 只推 3s;若误判为重罚则是 6s',
  )

  apiOf(0).onComplete({ result: 'long-done' }) // 收尾:占位任务手动完成
  const results = await promise
  assert.ok(results.every((r) => r.status === 'completed'))
})

// ─── 场景 11:首波与放量节奏可配(T-105) ───

test('initialLaunchLimit=2 → t=0 只启动 2 个,之后每 700ms 一个;默认值不受影响', async (t) => {
  useFakeTimers(t)
  const fake = createFakeLauncher(() => 'success')
  const promise = runSwarmBatch(makeTasks(12), fake.launcher, { initialLaunchLimit: 2 })
  await flush()
  assert.deepEqual(fake.starts.map((s) => s.index), [0, 1], '首波 2 个')
  for (let i = 0; i < 3; i++) mock.timers.tick(700)
  await flush()
  assert.deepEqual(fake.starts.map((s) => s.index), [0, 1, 2, 3, 4], '之后每 700ms 一个')
  for (let i = 0; i < 7; i++) mock.timers.tick(700)
  const results = await promise
  assert.equal(results.length, 12)
  assert.ok(results.every((r) => r.status === 'completed'))
})

test('initialLaunchIntervalMs=100 → 首波 5 后每 100ms 放一个', async (t) => {
  useFakeTimers(t)
  const fake = createFakeLauncher(() => 'success')
  const promise = runSwarmBatch(makeTasks(12), fake.launcher, { initialLaunchIntervalMs: 100 })
  await flush()
  assert.equal(fake.starts.length, 5, '首波仍 5')
  mock.timers.tick(100)
  await flush()
  assert.equal(fake.starts.length, 6)
  mock.timers.tick(100)
  await flush()
  assert.equal(fake.starts.length, 7)
  for (let i = 0; i < 6; i++) mock.timers.tick(100)
  const results = await promise
  assert.equal(results.length, 12)
})

test('非法放量参数 → runSwarmBatch 立即抛错(不启动任何任务)', () => {
  const fake = createFakeLauncher(() => 'success')
  assert.throws(() => runSwarmBatch(makeTasks(3), fake.launcher, { initialLaunchLimit: 0 }), /initialLaunchLimit must be a positive integer/)
  assert.throws(() => runSwarmBatch(makeTasks(3), fake.launcher, { initialLaunchLimit: 1.5 }), /initialLaunchLimit must be a positive integer/)
  assert.throws(() => runSwarmBatch(makeTasks(3), fake.launcher, { initialLaunchIntervalMs: -1 }), /initialLaunchIntervalMs must be a non-negative number/)
  assert.equal(fake.starts.length, 0)
})


// ─── 场景 12:结果可观测字段(T-106) ───

test('可观测字段:一次成功的任务 attempts=1/throttled 缺省/有 elapsedMs', async (t) => {
  useFakeTimers(t)
  const fake = createFakeLauncher(() => 'success')
  const results = await runSwarmBatch(makeTasks(2), fake.launcher, {})
  for (const result of results) {
    assert.equal(result.attempts, 1)
    assert.equal(result.throttled, undefined)
    assert.equal(typeof result.elapsedMs, 'number')
  }
})

test('可观测字段:限流重排过的任务 attempts=2、throttled=true', async (t) => {
  useFakeTimers(t)
  const fake = createFakeLauncher((task, attempt) => {
    if (task.index === 0) return attempt === 1 ? { rateLimit: true, ready: true } : 'success'
    return 'manual' // 占位,避免死锁防护
  })
  const promise = runSwarmBatch(makeTasks(2), fake.launcher, {})
  await flush()
  fake.apis.find((a) => a.index === 1)!.api.onComplete({ result: 'placeholder' })
  await flush()
  mock.timers.tick(RATE_LIMIT_RETRY_BASE_MS)
  await flush()
  const results = await promise
  assert.equal(results[0].status, 'completed')
  assert.equal(results[0].attempts, 2, '限流重排计入尝试次数')
  assert.equal(results[0].throttled, true)
  assert.equal(typeof results[0].elapsedMs, 'number')
  assert.equal(results[1].attempts, 1)
})

// ─── 场景 13:重试预算上限(T-111) ───

test('maxAttempts:重排次数用尽 → 判 failed(文案含 exhausted),不再无限退避', async (t) => {
  useFakeTimers(t)
  // rampLimit=1:首波只起 idx0,其余保持 pending → 既不会触发死锁防护,容量也不被占
  const fake = createFakeLauncher((task) => (task.index === 0 ? { rateLimit: true, ready: true } : 'success'))
  const controller = new AbortController()
  const promise = runSwarmBatch(makeTasks(3), fake.launcher, {
    initialLaunchLimit: 1,
    maxAttempts: 2,
    signal: controller.signal,
  })
  try {
    await flush()
    mock.timers.tick(3_000)
    await flush()
    assert.deepEqual(
      fake.starts.filter((s) => s.index === 0).map((s) => s.attempt),
      [1, 2],
      '第 2 次尝试后达到上限',
    )
    assert.deepEqual(fake.abandonedCalls.map((c) => c.index), [0], '判负时释放句柄')
  } finally {
    controller.abort()
  }
  const results = await promise
  const first = results[0]
  assert.equal(first.status, 'failed')
  assert.match(String(first.error), /exhausted 2 attempts/)
  assert.equal(first.attempts, 2)
  assert.equal(first.throttled, true)
})

// ─── 场景 14:退避抖动可配(T-112) ───

test('退避抖动可配:backoffJitterMs 叠在 base 之上(固定随机源做确定性断言)', async (t) => {
  useFakeTimers(t)
  const randomMock = mock.method(Math, 'random', () => 0.5)
  t.after(() => randomMock.mock.restore())
  const fake = createFakeLauncher((task, attempt) =>
    task.index === 0 ? (attempt === 1 ? { rateLimit: true, ready: true } : 'success') : 'success',
  )
  const promise = runSwarmBatch(makeTasks(2), fake.launcher, { rateLimitBackoffJitterMs: 1_000 })
  await flush()
  mock.timers.tick(3_499)
  await flush()
  assert.equal(fake.starts.filter((s) => s.index === 0).length, 1, '3s+500ms 之前不放(抖动只增不减)')
  mock.timers.tick(1)
  await flush()
  assert.equal(fake.starts.filter((s) => s.index === 0).length, 2, '恰好落在 3s+500ms')
  const results = await promise
  assert.ok(results.every((r) => r.status === 'completed'))
  assert.equal(results[0].attempts, 2)
})

test('抖动缺省为 0:退避时刻与参考实现一致(精确 3s)', async (t) => {
  useFakeTimers(t)
  const fake = createFakeLauncher((task, attempt) =>
    task.index === 0 ? (attempt === 1 ? { rateLimit: true, ready: true } : 'success') : 'success',
  )
  const promise = runSwarmBatch(makeTasks(2), fake.launcher, {})
  await flush()
  assert.deepEqual(
    fake.starts.filter((s) => s.index === 0).map((s) => s.t),
    [0],
  )
  mock.timers.tick(3_000)
  await flush()
  assert.deepEqual(
    fake.starts.filter((s) => s.index === 0).map((s) => s.t),
    [0, 3_000],
    '无抖动 → 恰好 3s',
  )
  const results = await promise
  assert.ok(results.every((r) => r.status === 'completed'))
})

// ─── T-116:逐条落位回调 ───

test('onItemSettled:每条落位各回调一次(顺序 = 落位顺序)', async (t) => {
  useFakeTimers(t)
  const fake = createFakeLauncher(() => 'success')
  const settled: number[] = []
  const results = await runSwarmBatch(makeTasks(3), fake.launcher, {
    onItemSettled: (entry) => settled.push(entry.task.index),
  })
  assert.deepEqual(settled, [0, 1, 2])
  assert.equal(results.length, 3)
})

test('onItemSettled:回调抛错不影响批收尾', async (t) => {
  useFakeTimers(t)
  const fake = createFakeLauncher(() => 'success')
  const results = await runSwarmBatch(makeTasks(2), fake.launcher, {
    onItemSettled: () => { throw new Error('progress sink down') },
  })
  assert.ok(results.every((r) => r.status === 'completed'))
})

// ─── 场景 15:子会话 id 透传到结果(T-120) ───


test('onAgent:调度器把 launcher 上报的 id 写进结果', async (t) => {
  useFakeTimers(t)
  const tasks = makeTasks(2)
  const cb: Array<{ task: number; callbacks: AttemptCallbacks }> = []
  const launcher: SwarmLauncher = {
    start(task, callbacks) {
      cb.push({ task: task.index, callbacks })
      callbacks.onAgent?.('child-' + task.index)
    },
  }
  const promise = runSwarmBatch(tasks, launcher, {})
  await flush()
  for (const entry of cb) {
    entry.callbacks.onReady()
    entry.callbacks.onComplete({ result: 'ok-' + entry.task })
  }
  const results = await promise
  assert.deepEqual(results.map((r) => r.agentId), ['child-0', 'child-1'])
})
