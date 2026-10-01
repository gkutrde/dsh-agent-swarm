import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * T-142:bundle 安装契约的守卫用例。
 *
 * `dsh plugin --profile <name> add <包>` 的可用性依赖三件事(实测确认):
 *   ① 包自带 `cordis.patch.yml`,里面有一条**自指** insert(`id: agent-swarm` / `name: dsh-agent-swarm`);
 *   ② package.json 把它列进 `files`(否则 tarball 里没有),
 *   ③ 入口 `exports['.']` 指向构建产物。
 * 任何一条被改动,安装路径就断——而单测/CI 之前都不会发现。
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string
  version: string
  main?: string
  files?: string[]
  exports?: Record<string, string>
  scripts?: Record<string, string>
}

test('T-142 package.json 暴露构建入口与补丁文件(bundle 安装契约)', () => {
  assert.equal(pkg.name, 'dsh-agent-swarm')
  assert.equal(pkg.main, 'lib/index.js')
  assert.equal(pkg.exports?.['.'], './lib/index.js')
  assert.equal(pkg.exports?.['./cordis.patch.yml'], './cordis.patch.yml', '补丁层必须可被消费方解析')
  // T-144:溯源与架构文档也必须随包分发(消费者要在包里看到来源声明)
  for (const entry of ['lib', 'cordis.patch.yml', 'README.md', 'LICENSE', 'CHANGELOG.md', 'skills', 'ARCHITECTURE.md', 'THIRD-PARTY-NOTICES.md']) {
    assert.ok(pkg.files?.includes(entry), '打包清单必须包含 ' + entry)
  }
})

test('T-142 cordis.patch.yml 必须自指注册 agent-swarm 条目', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /-\s*insert:/, '必须用 insert 组成 bundle 层')
  assert.match(patch, /-\s*id:\s*agent-swarm\b/, '必须注册 id: agent-swarm')
  assert.match(patch, /name:\s*dsh-agent-swarm\b/, '条目名必须指向本包')
  const ids = [...patch.matchAll(/^\s*-\s*id:\s*(\S+)/gm)].map((m) => m[1])
  assert.equal(new Set(ids).size, ids.length, 'id 不得重复(重复会让补丁层加载失败)')
})

test('T-142 发布前门禁仍在(避免把坏包发出去)', () => {
  assert.match(String(pkg.scripts?.prepublishOnly ?? ''), /build/, 'prepublishOnly 必须先构建')
  assert.match(String(pkg.scripts?.prepublishOnly ?? ''), /check-pack/, 'prepublishOnly 必须跑打包断言')
  assert.equal(typeof pkg.scripts?.test, 'string')
  assert.equal(typeof pkg.scripts?.['pack:check'], 'string')
})