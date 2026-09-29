# smoke · 真实宿主验证脚本

这些脚本用 `dsh --profile headless --patch <临时 patch>` 挂载本插件跑真实端到端验证，**不改动任何 profile 文件**（零侵入）。

| 脚本 | 验证什么 | 预期 |
| --- | --- | --- |
| `verify-pathB.ps1` | 路径 B：子任务是**带工具的宿主 subagent** | 子代理必须真的读文件才能答对 `MIN_ITEMS` / `SWARM_HEADER_PREFIX`（两个答案不在 prompt 里） |
| `verify-resume.ps1` | 续跑：先用一个条目建子会话，再用保留键 `agent` 接力 | 汇总标 `resumed=true`，`agent=` 与第一步**同一个 id**，且语义连续（第一步答第一条 `export const`，续跑答第二条） |

## 跑法

```powershell
# 需要先把插件构建好:pnpm install && pnpm build
pwsh -NoProfile -File smoke/verify-pathB.ps1
pwsh -NoProfile -File smoke/verify-resume.ps1
```

脚本会自动：

1. 取脚本上一级目录作为插件目录（也可 `-Plugin <目录>` 显式指定）；
2. 在 `$env:TEMP` 生成 patch（把插件目录写进去），所以仓库里不留任何绝对路径；
3. 跑 headless 一次，把汇总原样打印出来。

## 依赖

- 已安装 `dsh`（DeepSeek Harness CLI）；
- 该 profile 有 llm 服务（路径 A）与 subagent 服务及其 `spawn` 提供方（路径 B / 续跑）；
- 会真实调用模型，**产生费用**。

## 说明

其它开发期脚本（探针、批量冒烟）留在本机不公开：它们依赖开发者本机的路径与当时的 profile 状态，公开后既跑不通也容易误导。它们的结论都已写进 `项目文档/`。
