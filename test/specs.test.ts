import test from 'node:test'
import assert from 'node:assert/strict'
import { createSwarmSpecs } from '../src/specs.ts'

const NORMAL = {
  description: '审查回归',
  prompt_template: '审查 {{item}} 是否有回归风险,并复查 {{item}} 的调用方',
  items: ['a.ts', 'b.ts', 'c.ts'],
}

test('正常路径:3 个 items,模板两处 {{item}} 全部替换,index 0-based,description 展示 1-based', () => {
  const specs = createSwarmSpecs(NORMAL)
  assert.equal(specs.length, 3)
  assert.deepEqual(
    specs.map((s) => s.index),
    [0, 1, 2],
  )
  assert.equal(specs[0].item, 'a.ts')
  assert.equal(specs[0].prompt, '审查 a.ts 是否有回归风险,并复查 a.ts 的调用方')
  assert.equal(specs[2].prompt, '审查 c.ts 是否有回归风险,并复查 c.ts 的调用方')
  assert.deepEqual(
    specs.map((s) => s.description),
    ['审查回归 #1', '审查回归 #2', '审查回归 #3'],
  )
})

test('校验①:少于 2 个 items', () => {
  assert.throws(
    () => createSwarmSpecs({ ...NORMAL, items: ['a.ts'] }),
    /^Error: agent_swarm requires at least 2 items\.$/,
  )
})

test('校验②:超过 128 个 items', () => {
  const items = Array.from({ length: 129 }, (_, i) => `f${i}.ts`)
  assert.throws(
    () => createSwarmSpecs({ ...NORMAL, items }),
    /^Error: agent_swarm supports at most 128 subagents\.$/,
  )
})

test('校验③:有 items 必须给 prompt_template', () => {
  assert.throws(
    () => createSwarmSpecs({ description: 'd', items: ['a', 'b'] }),
    /^Error: agent_swarm requires a prompt_template when items are provided\.$/,
  )
})

test('校验④:prompt_template 必须含 {{item}}', () => {
  assert.throws(
    () => createSwarmSpecs({ ...NORMAL, prompt_template: '审查所有文件' }),
    /^Error: agent_swarm prompt_template must include the \{\{item\}\} placeholder\.$/,
  )
})

test('校验⑤:展开后 prompt 去重,文案含两个 1-based 序号', () => {
  assert.throws(
    () => createSwarmSpecs({ ...NORMAL, items: ['x.ts', 'y.ts', 'x.ts'] }),
    /^Error: Duplicate subagent prompts from items 1 and 3\. agent_swarm requires distinct subagents\.$/,
  )
})

test('校验顺序固定:① 先于 ⑤(1 个重复 item 报至少 2 个)', () => {
  assert.throws(
    () => createSwarmSpecs({ ...NORMAL, items: ['x.ts'] }),
    /^Error: agent_swarm requires at least 2 items\.$/,
  )
})

test('纯函数:不修改入参,重复调用结果一致', () => {
  const args = { ...NORMAL, items: [...NORMAL.items] }
  const first = createSwarmSpecs(args)
  const second = createSwarmSpecs(args)
  assert.deepEqual(first, second)
  assert.deepEqual(args, NORMAL)
})

// ─── T-110:输入侧硬化 ───

test('校验⑥:items 含空串/纯空白 → 拒绝并给 1-based 序号', () => {
  assert.throws(() => createSwarmSpecs({ ...NORMAL, items: ['a', '   '] }), /blank.*item 2/)
  assert.throws(() => createSwarmSpecs({ ...NORMAL, items: ['', 'b'] }), /blank.*item 1/)
})

test('校验⑦:展开后 prompt 超长 → 仅当设置 maxPromptChars 时拒绝并给出长度', () => {
  const args = { description: 'd', prompt_template: '处理 {{item}}', items: ['a', 'b'] }
  assert.doesNotThrow(() => createSwarmSpecs(args), '默认不限长')
  assert.throws(() => createSwarmSpecs(args, { maxPromptChars: 3 }), /exceeds 3 characters.*item 1/)
})

// ─── T-115:结构化 items ───

test('对象 item:{{item.key}} 字段占位符按字段展开,展示标签 JSON 化', () => {
  const specs = createSwarmSpecs({
    description: '审查',
    prompt_template: '审查文件 {{item.path}}(关注点:{{item.focus}})',
    items: [{ path: 'a.ts', focus: '回归' }, { path: 'b.ts', focus: '性能' }],
  })
  assert.equal(specs[0].prompt, '审查文件 a.ts(关注点:回归)')
  assert.equal(specs[1].prompt, '审查文件 b.ts(关注点:性能)')
  assert.equal(specs[0].item, JSON.stringify({ path: 'a.ts', focus: '回归' }), '对象条目的展示标签是 JSON')
  assert.deepEqual(specs.map((s) => s.index), [0, 1])
})

test('对象 item:{{item}} 展开为 JSON;仅用字段占位符的模板也算合法', () => {
  const specs = createSwarmSpecs({
    description: 'd',
    prompt_template: '处理 {{item.path}}',
    items: [{ path: 'a' }, { path: 'b' }],
  })
  assert.equal(specs[0].prompt, '处理 a', '只有 {{item.path}} 时不再要求 {{item}}')
  const withBare = createSwarmSpecs({
    description: 'd',
    prompt_template: '整条:{{item}}',
    items: [{ path: 'a' }, { path: 'b' }],
  })
  assert.equal(withBare[0].prompt, '整条:' + JSON.stringify({ path: 'a' }))
})

test('对象 item 缺字段 → 前置拒绝并指出字段与 1-based 序号', () => {
  assert.throws(
    () => createSwarmSpecs({ description: 'd', prompt_template: '看 {{item.missing}}', items: [{ path: 'a' }, { path: 'b' }] }),
    /references \{\{item\.missing\}\} but item 1 has no such field/,
  )
})

test('对象 item 形状非法(嵌套对象/数组/布尔/空对象/非法键) → 前置拒绝', () => {
  const tpl = { description: 'd', prompt_template: '看 {{item.path}}' }
  const bad = (first: unknown) => () => createSwarmSpecs({ ...tpl, items: [first, { path: 'b' }] as never })
  assert.throws(bad({ path: { deep: 1 } }), /invalid/i)
  assert.throws(bad({ path: ['x'] }), /invalid/i)
  assert.throws(bad({ path: true }), /invalid/i)
  assert.throws(bad({}), /invalid/i)
  assert.throws(bad({ 'bad key': 'x' }), /invalid/i)
  assert.throws(bad(null), /invalid/i)
  assert.doesNotThrow(() => createSwarmSpecs({ ...tpl, items: [{ path: 'a', line: 12 }, { path: 'b' }] }), 'number 字段合法')
})

// ─── T-103:保留键 agent = 续跑目标 ───

test('对象条目保留键 agent:合法 id → resumeAgentId;非法 → 前置拒绝', () => {
  const specs = createSwarmSpecs({
    description: 'd',
    prompt_template: '继续看 {{item.path}}',
    items: [{ agent: 'child-1', path: 'a.ts' }, { path: 'b.ts' }],
  })
  assert.equal(specs[0].resumeAgentId, 'child-1')
  assert.equal(specs[1].resumeAgentId, undefined, '没有 agent 键 = 新建')
  assert.throws(
    () => createSwarmSpecs({ description: 'd', prompt_template: '看 {{item.path}}', items: [{ agent: '', path: 'a' }, { path: 'b' }] }),
    /agent/,
  )
  assert.throws(
    () => createSwarmSpecs({ description: 'd', prompt_template: '看 {{item.path}}', items: [{ agent: 42, path: 'a' }, { path: 'b' }] }),
    /agent/,
  )
})

// ─── T-118:字符串条目配字段占位符要明确报错 ───

test('字符串条目 + {{item.key}} → 直接指出类型不匹配(而不是留空串后报 prompt 重复)', () => {
  assert.throws(
    () => createSwarmSpecs({ description: 'd', prompt_template: '看 {{item.path}}', items: ['a', 'b'] }),
    /item 1 is a string/, '第一条是字符串 → 明确指出',
  )
  // 反向:对象条目走字段占位符仍然正常
  assert.doesNotThrow(() => createSwarmSpecs({ description: 'd', prompt_template: '看 {{item.path}}', items: [{ path: 'a' }, { path: 'b' }] }))
  // 纯 {{item}} 模板 + 字符串条目不受影响
  assert.doesNotThrow(() => createSwarmSpecs({ description: 'd', prompt_template: '看 {{item}}', items: ['a', 'b'] }))
})

// ─── T-121:续跑批次的计数与去重语义 ───

test('续跑批次:单条续跑合法(仍不许单条新建)', () => {
  assert.doesNotThrow(
    () => createSwarmSpecs({ description: 'd', prompt_template: '继续子会话 {{item.agent}}', items: [{ agent: 'c1' }] }),
    '单条续跑是合法批',
  )
  const specs = createSwarmSpecs({ description: 'd', prompt_template: '继续子会话 {{item.agent}}', items: [{ agent: 'c1' }] })
  assert.equal(specs[0].resumeAgentId, 'c1')
  assert.throws(
    () => createSwarmSpecs({ description: 'd', prompt_template: '看 {{item}}', items: ['a'] }),
    /at least 2 items/,
    '单条新建仍被拒(扇出工具定位不变)',
  )
})

test('续跑批次:不同子会话 + 相同文案不算重复;同一子会话重复才算', () => {
  assert.doesNotThrow(
    () => createSwarmSpecs({ description: 'd', prompt_template: '继续 {{item.topic}}', items: [{ agent: 'c1', topic: 'x' }, { agent: 'c2', topic: 'x' }] }),
    '两个不同子会话续跑同一句话 → 不重复',
  )
  assert.throws(
    () => createSwarmSpecs({ description: 'd', prompt_template: '继续 {{item.topic}}', items: [{ agent: 'c1', topic: 'x' }, { agent: 'c1', topic: 'x' }] }),
    /Duplicate subagent prompts/,
    '同一子会话同文案续两次 → 重复',
  )
})

// ─── T-126:模板内置变量 {{index}} / {{total}} ───

test('T-126 内置变量:{{index}} 1-based、{{total}} 为条目总数,且与 {{item.<key>}} 互不干扰', () => {
  const specs = createSwarmSpecs({
    description: 'd',
    prompt_template: '第 {{index}}/{{total}} 项:看 {{item.path}}(字段 index={{item.index}})',
    items: [{ path: 'a.ts', index: 99 }, { path: 'b.ts', index: 98 }, { path: 'c.ts', index: 97 }],
  })
  assert.equal(specs[0].prompt, '第 1/3 项:看 a.ts(字段 index=99)')
  assert.equal(specs[1].prompt, '第 2/3 项:看 b.ts(字段 index=98)')
  assert.equal(specs[2].prompt, '第 3/3 项:看 c.ts(字段 index=97)')
})

test('T-126 零回归:不含内置变量的模板展开逐字不变', () => {
  const specs = createSwarmSpecs({ description: 'd', prompt_template: '看 {{item}}', items: ['a', 'b'] })
  assert.equal(specs[0].prompt, '看 a')
  assert.equal(specs[1].prompt, '看 b')
})

// ─── T-140:per-call 模型路由参数(批次级指定) ───

test('T-140 批次参数可带 provider/model(逐字保留)', () => {
  const specs = createSwarmSpecs({ ...NORMAL, provider: 'kimi-coding', model: 'k3' } as never)
  assert.equal(specs.length, 3)
  // 路由属于批次级信息:由调用方(工具层)读取,不落到每条 spec 上
  assert.equal((specs as unknown as { route?: unknown }).route, undefined)
})

test('T-140 非法 model/provider 前置拒绝(零子任务启动)', () => {
  assert.throws(() => createSwarmSpecs({ ...NORMAL, model: '' } as never), /model must be a non-empty string/)
  assert.throws(() => createSwarmSpecs({ ...NORMAL, model: 123 } as never), /model must be a non-empty string/)
  assert.throws(() => createSwarmSpecs({ ...NORMAL, provider: '   ' } as never), /provider must be a non-empty string/)
})
