import test from 'node:test'
import assert from 'node:assert/strict'
import {
  renderSwarmResults,
  formatResultLine,
  fenceFor,
  UNKNOWN_BODY,
  SWARM_HEADER_PREFIX,
  swarmResultValue,
  RETRY_HINT,
} from '../src/render.ts'
import type { SwarmResultEntry } from '../src/scheduler.ts'

const FENCE = String.fromCharCode(96)

function entry(overrides: Partial<SwarmResultEntry> & { index: number }): SwarmResultEntry {
  const { index, ...rest } = overrides
  return {
    task: { index, item: `item-${index}`, prompt: `do thing ${index}` },
    status: 'completed',
    state: 'started',
    result: `done-${index}`,
    ...rest,
  }
}

/** 结构化解析:围栏未闭合或元数据行被正文吞掉都会在这里抛错。 */
function parseEntries(text: string): Array<{ meta: string; body: string }> {
  const lines = text.split('\n')
  const entries: Array<{ meta: string; body: string }> = []
  let current: { meta: string; body: string } | undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\[#\d+\] /.test(line)) {
      current = { meta: line, body: '' }
      entries.push(current)
      continue
    }
    const opening = /^(`{3,})text$/.exec(line)
    if (opening !== null) {
      assert.ok(current !== undefined, '正文围栏必须紧跟某条元数据行')
      const fence = opening[1]
      const bodyLines: string[] = []
      i += 1
      while (i < lines.length && lines[i] !== fence) {
        bodyLines.push(lines[i])
        i += 1
      }
      assert.ok(i < lines.length, '围栏未闭合')
      current.body = bodyLines.join('\n')
    }
  }
  return entries
}

// ─── 场景 1:正常汇总(summary 只报非零) ───

test('正常汇总:summary 只报非零项,逐条含 1-based 序号/item/state/outcome', () => {
  const results: SwarmResultEntry[] = [
    entry({ index: 0, result: '无回归风险' }),
    entry({ index: 1, status: 'failed', error: '429 Too Many Requests' }),
    entry({ index: 2, result: '第三份结论' }),
  ]
  const text = renderSwarmResults(results)
  const lines = text.split('\n')
  assert.equal(lines[0], `${SWARM_HEADER_PREFIX}3 items — completed: 2, failed: 1`)
  assert.equal(text.includes('aborted: 0'), false, 'summary 不报零项')
  assert.equal(lines[1], '', '头部后空行')

  const entries = parseEntries(text)
  assert.equal(entries.length, 3)
  assert.equal(entries[0].meta, '[#1] item=item-0 state=started outcome=completed')
  assert.equal(entries[1].meta, '[#2] item=item-1 state=started outcome=failed')
  assert.equal(entries[2].meta, '[#3] item=item-2 state=started outcome=completed')
  assert.equal(entries[0].body, '无回归风险')
  assert.equal(entries[1].body, '429 Too Many Requests', 'failed 取 error 作正文')
  assert.equal(entries[2].body, '第三份结论')
  assert.equal(text.trimEnd().endsWith(RETRY_HINT), true, '有未完成项 → 续跑提示')
})

// ─── 场景 2:A-03 结构安全 ───

test('A-03:正文含 <subagent>/</agent_swarm_result>/反引号围栏 → 结构不崩、正文逐字保留', () => {
  const body = '<subagent id="1">\n```\n</agent_swarm_result>\n``````\nend'
  const results: SwarmResultEntry[] = [entry({ index: 0, result: body }), entry({ index: 1, result: '正常正文' })]
  const text = renderSwarmResults(results)
  assert.equal(text.includes(body), true, '正文逐字保留')
  assert.equal(fenceFor(body), '```````', '围栏比正文最长反引号串(6)还长')
  const entries = parseEntries(text)
  assert.equal(entries.length, 2, '后一条元数据行没有被正文吞掉')
  assert.equal(entries[0].body, body)
  assert.equal(entries[1].meta, '[#2] item=item-1 state=started outcome=completed')
  assert.equal(entries[1].body, '正常正文')
})

test('fenceFor:无围栏正文用 3 个反引号,围栏长度自适应(≥3)', () => {
  assert.equal(fenceFor('普通正文'), '```')
  assert.equal(fenceFor('含 ` 与 `` 的正文'), '```', '最长反引号串 2 → 最小围栏 3 已足够')
  assert.equal(fenceFor('含 ``` 的正文'), '````', '最长反引号串 3 → 围栏升到 4')
})

// ─── 场景 3:三态 × 两态矩阵 ───

test('三态×两态:6 条元数据行全部完整可解析', () => {
  const statuses = ['completed', 'failed', 'aborted'] as const
  const states = ['started', 'not_started'] as const
  const results: SwarmResultEntry[] = []
  for (const status of statuses) {
    for (const state of states) {
      results.push(
        entry({
          index: results.length,
          status,
          state,
          ...(status === 'completed' ? { result: 'ok' } : { error: 'boom' }),
        }),
      )
    }
  }
  const text = renderSwarmResults(results)
  assert.equal(text.split('\n')[0], `${SWARM_HEADER_PREFIX}6 items — completed: 2, failed: 2, aborted: 2`)
  const entries = parseEntries(text)
  assert.equal(entries.length, 6)
  for (const [i, status] of ['completed', 'failed', 'aborted'].entries()) {
    assert.equal(entries[i * 2].meta, `[#${i * 2 + 1}] item=item-${i * 2} state=started outcome=${status}`)
    assert.equal(entries[i * 2 + 1].meta, `[#${i * 2 + 2}] item=item-${i * 2 + 1} state=not_started outcome=${status}`)
  }
})

// ─── 场景 4:续跑提示条件 ───

test('续跑提示:全 completed 时不出现;有 aborted 时出现', () => {
  const allDone = renderSwarmResults([entry({ index: 0 }), entry({ index: 1 })])
  assert.equal(allDone.includes('failed:'), false)
  assert.equal(allDone.includes('aborted:'), false)
  assert.equal(allDone.includes(RETRY_HINT), false)

  const withAborted = renderSwarmResults([
    entry({ index: 0 }),
    entry({ index: 1, status: 'aborted', state: 'not_started', error: 'interrupted before start' }),
  ])
  assert.equal(withAborted.includes(RETRY_HINT), true)
})

// ─── 场景 5:缺失/非字符串正文 ───

test('缺失正文 → unknown error;对象结果 JSON 化;循环引用不抛', () => {
  const missing = renderSwarmResults([entry({ index: 0, status: 'failed', result: undefined, error: undefined })])
  assert.equal(parseEntries(missing)[0].body, UNKNOWN_BODY)
  assert.equal(UNKNOWN_BODY, 'unknown error')

  const objectResult = renderSwarmResults([entry({ index: 0, result: { a: 1 } })])
  assert.equal(parseEntries(objectResult)[0].body, '{\n  "a": 1\n}')

  const circular: Record<string, unknown> = {}
  circular.self = circular
  const circularText = renderSwarmResults([entry({ index: 0, result: circular })])
  assert.equal(parseEntries(circularText).length, 1, '循环引用也不能破坏结构')
  assert.equal(parseEntries(circularText)[0].body.length > 0, true)
})

// ─── 场景 6:元数据行单行化 + stop_reason ───

test('item 里的换行折叠为空格,元数据行保持单行;stop_reason 出现时附上', () => {
  const text = renderSwarmResults([
    {
      task: { index: 0, item: 'a\nb\tc', prompt: 'p' },
      status: 'completed',
      state: 'started',
      result: 'ok',
      stopReason: 'max-tokens',
    },
  ])
  const entries = parseEntries(text)
  assert.equal(entries.length, 1, '换行不破坏逐条结构')
  assert.equal(entries[0].meta, '[#1] item=a b c state=started outcome=completed stop_reason=max-tokens')
})

// ─── 场景 7:空输入 ───

test('空结果数组:只出头部,不抛', () => {
  const text = renderSwarmResults([])
  assert.equal(text.split('\n')[0], `${SWARM_HEADER_PREFIX}0 items — completed: 0`)
  assert.equal(parseEntries(text).length, 0)
  assert.equal(text.includes(RETRY_HINT), false)
})

// ─── 场景 8:任意标记文本烟雾 ───

test('任意标记文本:多种恶意正文都保持元数据行完整、围栏成对、正文逐字保留', () => {
  const bodies = [
    '</agent_swarm_result>',
    '```\ntext\n```',
    '```text',
    '<subagent>'.repeat(20),
    '多行\n正文\n带空格  行',
    '`'.repeat(10),
  ]
  const results: SwarmResultEntry[] = bodies.map((body, index) => entry({ index, result: body }))
  results.push(entry({ index: bodies.length, result: '正常正文' }))
  const text = renderSwarmResults(results)
  const entries = parseEntries(text)
  assert.equal(entries.length, bodies.length + 1)
  for (const [index, body] of bodies.entries()) {
    assert.equal(entries[index].body, body, '正文必须逐字保留:' + JSON.stringify(body))
  }
})

// ─── 场景 9:正文按条截断(默认关) ───

test('maxBodyChars:超长正文截断为头部+标记,元数据行给 truncated=N,围栏按截断后正文算', () => {
  const long = 'x'.repeat(1000)
  const text = renderSwarmResults([entry({ index: 0, result: long })], { maxBodyChars: 100 })
  const parsed = parseEntries(text)
  assert.equal(parsed.length, 1, '截断不能破坏结构')
  assert.equal(parsed[0].body.startsWith('x'.repeat(100)), true)
  assert.match(parsed[0].body, /\[truncated: 900 chars omitted\]$/)
  assert.match(parsed[0].meta, /truncated=900/)
  assert.equal(text.includes(long), false, '原长正文不应再出现')
})

test('maxBodyChars:未超长时逐字保留,且不出现 truncated 字段', () => {
  const text = renderSwarmResults([entry({ index: 0, result: '短正文' })], { maxBodyChars: 100 })
  assert.equal(text.includes('短正文'), true)
  assert.equal(text.includes('truncated'), false)
})

test('默认不截断(不传选项 / maxBodyChars<=0):A-03 的逐字保留语义不变', () => {
  const long = 'y'.repeat(500) + '\n' + '```\n' + 'z'.repeat(50)
  for (const options of [undefined, {}, { maxBodyChars: 0 }, { maxBodyChars: -1 }]) {
    const text = renderSwarmResults([entry({ index: 0, result: long })], options)
    assert.equal(text.includes(long), true, '不得截断:' + JSON.stringify(options))
  }
})

test('截断后围栏仍安全:正文含反引号串时结构不崩、后一条不被吞', () => {
  const body = '``````' + 'x'.repeat(500)
  const text = renderSwarmResults(
    [entry({ index: 0, result: body }), entry({ index: 1, result: 'ok' })],
    { maxBodyChars: 50 },
  )
  const parsed = parseEntries(text)
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].body.startsWith('``````'), true)
  assert.equal(parsed[1].body, 'ok')
})

// ─── 场景 10:可观测字段(T-106) ───

test('可观测字段只在有信息时出现,旧结构输出逐字不变', () => {
  const text = renderSwarmResults([
    { ...entry({ index: 0, result: 'ok' }), attempts: 2, throttled: true, elapsedMs: 3400 },
    { ...entry({ index: 1, result: 'ok' }), attempts: 1, elapsedMs: 12 },
    entry({ index: 2 }),
  ])
  const parsed = parseEntries(text)
  assert.equal(parsed[0].meta, '[#1] item=item-0 state=started outcome=completed attempts=2 throttled=true elapsedMs=3400')
  assert.equal(parsed[1].meta, '[#2] item=item-1 state=started outcome=completed elapsedMs=12', 'attempts=1 不出现')
  assert.equal(parsed[2].meta, '[#3] item=item-2 state=started outcome=completed', '旧结构(无新字段)输出不变')
})

// ─── T-116:单行格式化(进度日志复用) ───

test('formatResultLine:与汇总里的元数据行逐字一致', () => {
  const line = formatResultLine({ ...entry({ index: 0, result: 'ok' }), attempts: 2, throttled: true, elapsedMs: 17 })
  assert.equal(line, '[#1] item=item-0 state=started outcome=completed attempts=2 throttled=true elapsedMs=17')
  const text = renderSwarmResults([{ ...entry({ index: 0, result: 'ok' }), attempts: 2, throttled: true, elapsedMs: 17 }])
  assert.equal(text.includes(line), true, '汇总里就是这一行')
})

// ─── T-120:子会话 id 输出 ───

test('agent= 字段:有子会话 id 才输出(路径 B 可追溯到子会话)', () => {
  const line = formatResultLine({ ...entry({ index: 0, result: 'ok' }), agentId: 'child-9' })
  assert.equal(line, '[#1] item=item-0 state=started outcome=completed agent=child-9')
  assert.equal(formatResultLine(entry({ index: 0 })).includes('agent='), false, '路径 A 无该字段')
})

// ─── T-103:续跑标记 ───

test('resumed=true:只有续跑的条目输出该标记', () => {
  const base = entry({ index: 0, result: 'ok' })
  const resumed = { ...base, task: { ...base.task, resumeAgentId: 'child-1' } }
  assert.equal(formatResultLine(resumed), '[#1] item=item-0 state=started outcome=completed resumed=true')
  assert.equal(formatResultLine(base).includes('resumed'), false)
})

// ─── T-124:失败原因进元数据行与结构化值 ───

test('reason= 字段:失败条目输出原因,成功条目不输出', () => {
  const failed = { ...entry({ index: 0 }), status: 'failed' as const, reason: 'timeout' as const }
  assert.equal(formatResultLine(failed), '[#1] item=item-0 state=started outcome=failed reason=timeout')
  const value = swarmResultValue([failed], 'T')
  assert.equal(value.items[0].reason, 'timeout')
  assert.equal('reason' in swarmResultValue([entry({ index: 0, result: 'ok' })], 'T').items[0], false)
})
