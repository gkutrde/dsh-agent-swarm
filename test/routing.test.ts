import test from 'node:test'
import assert from 'node:assert/strict'
import { detectPathMode } from '../src/routing.ts'

test('T-139 对象条目带位置类字段 -> 判到路径 B', () => {
  const r = detectPathMode({ items: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }], promptTemplate: '看一下 {{item.path}}' })
  assert.equal(r.mode, 'subagent')
  assert.match(r.reason, /location|field/)
})

test('T-139 模板命中工具类关键词 -> 判到路径 B', () => {
  for (const tpl of ['读取文件 {{item}} 并回答', 'run the tests in {{item}}', '验证 {{item}} 是否可达', 'fetch {{item}} and summarize']) {
    const r = detectPathMode({ items: ['a', 'b'], promptTemplate: tpl })
    assert.equal(r.mode, 'subagent', '模板应判到 B: ' + tpl)
  }
})

test('T-139 纯知识问答 -> 判到路径 A', () => {
  for (const tpl of ['只回答 {{item}} 这个字', 'summarize {{item}} in one sentence', '把 {{item}} 翻译成英文']) {
    const r = detectPathMode({ items: ['甲', '乙'], promptTemplate: tpl })
    assert.equal(r.mode, 'llm', '模板应判到 A: ' + tpl)
  }
})

test('T-139 判定理由可追溯且稳定(确定性)', () => {
  const a = detectPathMode({ items: ['x', 'y'], promptTemplate: '读取 {{item}}' })
  const b2 = detectPathMode({ items: ['x', 'y'], promptTemplate: '读取 {{item}}' })
  assert.deepEqual(a, b2)
  assert.ok(a.reason.length > 0)
})