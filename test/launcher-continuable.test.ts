import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createContinuableSubagentLauncher,
  SUBAGENT_TURN_TIMEOUT_MESSAGE,
  type AgentLookupLike,
  type ContinuableSubagentServiceLike,
  type SessionQueryLike,
} from '../src/launcher-continuable.ts'
import type { AttemptCallbacks, SwarmTask } from '../src/scheduler.ts'

interface Recorder {
  continuable: Array<{ provider: string; label: string; prompt: string; parent: unknown; agentOptions: unknown }>
  sent: Array<{ target: string; text: string }>
  interrupted: string[]
}

function fakeHost(options: {
  statuses?: string[]
  events?: Array<Array<{ type: string; seq: number; text?: string }>>
  startFails?: boolean
} = {}) {
  const rec: Recorder = { continuable: [], sent: [], interrupted: [] }
  let statusIndex = 0
  let readIndex = 0
  const statuses = options.statuses ?? ['running', 'idle']
  const scripts = options.events ?? [[{ type: 'assistant/message', seq: 7, text: '子会话结论' }]]
  let reads = 0
  const subagents: ContinuableSubagentServiceLike = {
    async startContinuable(spec) {
      if (options.startFails === true) throw new Error('continuable unavailable')
      rec.continuable.push({
        provider: spec.provider,
        label: spec.label,
        prompt: spec.request.prompt[0].text,
        parent: spec.request.parent,
        agentOptions: spec.request.agentOptions,
      })
      return { childId: 'child-new', messageId: 'msg-1' }
    },
    async sendMessage(parent, targetId, content, sendOptions) {
      rec.sent.push({ target: targetId, text: content[0].text })
      void parent
      void sendOptions
      return 'msg-2'
    },
    interrupt(targetId) { rec.interrupted.push(targetId) },
  }
  const sessions: SessionQueryLike = {
    async readSession() {
      reads += 1
      const script = scripts[Math.min(readIndex, scripts.length - 1)]
      readIndex += 1
      return {
        events: script.map((e) => ({
          type: e.type,
          seq: e.seq,
          data: { message: { content: e.text === undefined ? [] : [{ type: 'text', text: e.text }] } },
        })),
      }
    },
  }
  const agents: AgentLookupLike = {
    get() {
      const status = statuses[Math.min(statusIndex, statuses.length - 1)]
      statusIndex += 1
      return { status }
    },
  }
  return { rec, subagents, sessions, agents, readCount: () => reads }
}

const task = (index: number, resumeAgentId?: string): SwarmTask => ({
  index,
  item: 'item-' + index,
  prompt: 'do thing ' + index,
  ...(resumeAgentId === undefined ? {} : { resumeAgentId }),
})

function driver() {
  const events: string[] = []
  const completions: Array<{ result: unknown }> = []
  const errors: Array<{ message: string; ready?: boolean }> = []
  const agents: string[] = []
  const cb: AttemptCallbacks = {
    onReady: () => { events.push('ready') },
    onAgent: (id) => { agents.push(id) },
    onComplete: (c) => { events.push('complete'); completions.push(c) },
    onError: (e) => { events.push('error'); errors.push(e) },
  }
  return { cb, events, completions, errors, agents }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

/** 轮询等待条件成立(避免依赖固定 flush 次数导致抖动)。 */
async function until(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('until: 条件未在超时内成立')
    await new Promise<void>((r) => setTimeout(r, 2))
  }
}

test('续跑模式-新建:startContinuable 建子级 → 上报 id → 轮询到 idle 后读会话取正文', async () => {
  const host = fakeHost()
  const parent = { id: 'agent-1' }
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent, pollIntervalMs: 1, turnTimeoutMs: 2000,
  })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await flush(); await flush(); await flush()
  assert.equal(host.rec.continuable.length, 1)
  assert.equal(host.rec.continuable[0].provider, 'spawn')
  assert.equal(host.rec.continuable[0].prompt, 'do thing 0')
  assert.equal(host.rec.continuable[0].parent, parent)
  assert.deepEqual(d.agents, ['child-new'], '子会话 id 上报')
  assert.equal(d.completions.length, 1)
  assert.equal(d.completions[0].result, '子会话结论')
  assert.deepEqual(d.events, ['ready', 'complete'])
})

test('续跑模式-resume:带 resumeAgentId 的条目走 sendMessage,不新建子级', async () => {
  const host = fakeHost({ events: [[{ type: 'assistant/message', seq: 3, text: '旧结论' }], [{ type: 'assistant/message', seq: 3, text: '旧结论' }, { type: 'assistant/message', seq: 9, text: '续跑结论' }]] })
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 2000,
  })
  const d = driver()
  launcher.start(task(0, 'child-old'), d.cb, new AbortController().signal)
  await flush(); await flush(); await flush()
  assert.equal(host.rec.continuable.length, 0, '不新建')
  assert.deepEqual(host.rec.sent, [{ target: 'child-old', text: 'do thing 0' }])
  assert.deepEqual(d.agents, ['child-old'])
  assert.equal(d.completions[0].result, '续跑结论')
})

test('续跑模式:子级一直 running → 超时判失败(不吊死)', async () => {
  const host = fakeHost({ statuses: ['running'], events: [[], []] })
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 30,
  })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await new Promise<void>((r) => setTimeout(r, 120))
  assert.equal(d.errors.length, 1)
  assert.equal(d.errors[0].message, SUBAGENT_TURN_TIMEOUT_MESSAGE)
  assert.equal(d.completions.length, 0)
})

test('续跑模式:abandoned 只 interrupt,绝不 dispose 子级(否则毁掉可续跑会话)', async () => {
  const host = fakeHost({ statuses: ['running'], events: [[], []] })
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 2000,
  })
  const d = driver()
  const t0 = task(0)
  launcher.start(t0, d.cb, new AbortController().signal)
  await flush()
  launcher.abandoned?.({ task: t0, outcome: 'cancelled' })
  assert.deepEqual(host.rec.interrupted, ['child-new'])
})

test('续跑模式:startContinuable 抛错 → onError(ready=false)', async () => {
  const host = fakeHost({ startFails: true })
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 500,
  })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await flush(); await flush()
  assert.equal(d.errors[0].message, 'continuable unavailable')
  assert.equal(d.errors[0].ready, false)
})

// ─── P1a/P1b/P2a:可配超时、agentOptions 透传、轮询省 IO ───

test('P2a 省 IO:子级 running 期间完全不读会话,只在 idle 时读一次', async () => {
  const host = fakeHost({ statuses: ['running', 'running', 'idle'] })
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 3000,
  })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await until(() => d.completions.length > 0)
  assert.equal(d.completions[0].result, '子会话结论')
  assert.equal(host.readCount(), 1, 'running 期间零会话 IO(避免长会话 O(n²))')
})

test('P2a 续跑:基线读 1 次 + idle 读 1 次 = 2 次', async () => {
  const host = fakeHost({
    statuses: ['running', 'idle'],
    events: [[{ type: 'assistant/message', seq: 3, text: '旧结论' }], [{ type: 'assistant/message', seq: 3, text: '旧结论' }, { type: 'assistant/message', seq: 9, text: '续跑结论' }]],
  })
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 3000,
  })
  const d = driver()
  launcher.start(task(0, 'child-old'), d.cb, new AbortController().signal)
  await until(() => d.completions.length > 0)
  assert.equal(d.completions[0].result, '续跑结论')
  assert.equal(host.readCount(), 2)
})

test('P1a turnTimeoutMs<=0 = 不设轮超时(不被提前判失败)', async () => {
  const host = fakeHost({ statuses: ['running', 'running', 'running', 'idle'] })
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 0,
  })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await until(() => d.completions.length > 0)
  assert.equal(d.errors.length, 0, '0 = 无限,不该超时')
})

test('P1b agentOptions 透传:新建时带上配置的路由覆盖', async () => {
  const host = fakeHost()
  const agentOptions = { provider: 'deepseek-official', model: 'deepseek-pro', maxTokens: 4096 }
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 2000, agentOptions,
  })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await until(() => d.completions.length > 0)
  assert.deepEqual(host.rec.continuable[0].agentOptions, agentOptions)
})

// ─── T-136:续跑路径必须上报 reason(否则退化成兜底 failed) ───

test('T-136 续跑:轮超时 → reason=timeout(不是兜底 failed)', async () => {
  const host = fakeHost({ statuses: ['running'], events: [[], []] })
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 30,
  })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await new Promise<void>((r) => setTimeout(r, 120))
  assert.equal(d.errors.length, 1)
  assert.equal((d.errors[0] as { reason?: string }).reason, 'timeout')
})

test('T-136 续跑:startContinuable 抛错 → reason=provider-error', async () => {
  const host = fakeHost({ startFails: true })
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 500,
  })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await flush(); await flush()
  assert.equal((d.errors[0] as { reason?: string }).reason, 'provider-error')
})

test('T-136 续跑:空产出 → reason=empty-output', async () => {
  // 空产出 = 有助手消息但正文为空(没有消息是「轮超时」,不是空产出)。
  const host = fakeHost({ statuses: ['idle'], events: [[{ type: 'assistant/message', seq: 5, text: '' }]] })
  const launcher = createContinuableSubagentLauncher({
    subagents: host.subagents, sessions: host.sessions, agents: host.agents,
    provider: 'spawn', parent: {}, pollIntervalMs: 1, turnTimeoutMs: 400,
  })
  const d = driver()
  launcher.start(task(0), d.cb, new AbortController().signal)
  await until(() => d.errors.length > 0)
  assert.equal((d.errors[0] as { reason?: string }).reason, 'empty-output')
})
