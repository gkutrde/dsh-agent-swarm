/**
 * 打包断言(P0):构建产物必须真的带上 README/LICENSE/lib 等,否则使用者拿到的是没许可证的包。
 * 用法:pnpm pack:check(CI 里每次跑)。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REQUIRED = [
  'package/package.json',
  'package/lib/index.js',
  'package/README.md',
  'package/LICENSE',
  'package/CHANGELOG.md',
  'package/cordis.patch.yml',
  'package/skills/swarm-then-team/SKILL.md',
]

const dir = mkdtempSync(join(tmpdir(), 'swarm-pack-check-'))
try {
  // 跨平台调用 pnpm:在 pnpm 脚本里 npm_execpath 指向 pnpm 的 JS 入口,用 node 直接跑它
  // (Node 20+ 出于安全补丁不能无 shell 执行 .cmd/.bat;shell: true 又会有告警)。
  const packArgs = ['pack', '--pack-destination', dir]
  const npmExec = process.env.npm_execpath
  if (npmExec !== undefined && /\.(c?js|mjs)$/.test(npmExec)) {
    execFileSync(process.execPath, [npmExec, ...packArgs], { stdio: 'pipe' })
  } else {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    execFileSync(pnpm, packArgs, { stdio: 'pipe', ...(process.platform === 'win32' ? { shell: true } : {}) })
  }
  const tarball = readdirSync(dir).find((name) => name.endsWith('.tgz'))
  if (tarball === undefined) throw new Error('pnpm pack 没有产出 tgz')
  const listing = execFileSync('tar', ['-tzf', join(dir, tarball)], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const missing = REQUIRED.filter((entry) => !listing.includes(entry))
  console.log('pack:check ' + tarball + ' (' + listing.length + ' entries)')
  for (const entry of REQUIRED) console.log((listing.includes(entry) ? '  ok   ' : '  MISS ') + entry)
  if (missing.length > 0) {
    console.error('pack:check FAILED - missing: ' + missing.join(', '))
    process.exit(1)
  }
  console.log('pack:check ok')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
