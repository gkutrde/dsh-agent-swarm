import type { UserConfig } from 'tsdown'

const config: UserConfig = {
  name: 'dsh-agent-swarm',
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  fixedExtension: false,
  platform: 'node',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: true,
  deps: {
    // 宿主提供的包保持外部依赖;其余(如 schemastery)内联,保证 lib/index.js
    // 自足 —— 桌面端 profile 是 junction/拷贝安装,不跑 pnpm,产物必须能独立加载。
    neverBundle: [
      /^@deepseek-ai\//,
      'cordis',
    ],
  },
}

export default config
