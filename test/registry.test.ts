import test from 'node:test'
import assert from 'node:assert/strict'
import { SwarmRegistry } from '../src/registry.ts'

test('T-141 开始批次后可查到 current();落位逐条累计;结束后进历史', () => {
  const reg = new SwarmRegistry({ historyLimit: 5 })
  const id = reg.begin({ description: '批A', path: 'llm', count: 2, startedAt: 1000 })
  assert.equal(reg.current()?.description, '批A')
  reg.settle({ index: 0, item: 'a', state: 'started', outcome: 'completed', elapsedMs: 10 })
  reg.settle({ index: 1, item: 'b', state: 'started', outcome: 'failed', reason: 'timeout', elapsedMs: 20 })
  assert.deepEqual(reg.current()?.counts, { completed: 1, failed: 1, aborted: 0 })
  reg.finish({ finishedAt: 2000 })
  assert.equal(reg.current(), undefined, '结束后不再有 current')
  const done = reg.get(id)
  assert.equal(done?.counts.failed, 1)
  assert.equal(done?.finishedAt, 2000)
  assert.equal(done?.items.length, 2)
  assert.equal(done?.items[1]?.reason, 'timeout')
})

test('T-141 历史有上限(默认 5,可配),超出丢最旧', () => {
  const reg = new SwarmRegistry({ historyLimit: 2 })
  for (let i = 0; i < 3; i++) {
    reg.begin({ description: '批' + i, count: 1, startedAt: i })
    reg.finish({ finishedAt: i + 100 })
  }
  const all = reg.list()
  assert.equal(all.length, 2, '只保留最近 2 个')
  assert.deepEqual(all.map((b) => b.description), ['批2', '批1'], 'newest first')
})

test('T-141 注册表自身异常不得抛出(隔离)', () => {
  const reg = new SwarmRegistry({ historyLimit: 1 })
  assert.doesNotThrow(() => reg.settle({ index: -1, item: 'x', state: 's', outcome: 'completed' }), '没有 current 时落位应被忽略')
  assert.doesNotThrow(() => reg.finish({ finishedAt: 1 }), '没有 current 时结束应被忽略')
  assert.equal(reg.list().length, 0)
})

test('T-141 快照给消费者的是副本(外部改动不影响内部)', () => {
  const reg = new SwarmRegistry({ historyLimit: 1 })
  reg.begin({ description: '批', count: 1, startedAt: 1 })
  const snap = reg.current()!
  snap.description = '被改了'
  assert.equal(reg.current()?.description, '批')
})