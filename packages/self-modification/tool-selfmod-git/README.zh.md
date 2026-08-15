# 自修改 git 版本化工具

`selfmod_commit` 暂存并提交会话工作区的漂移，`selfmod_rollback` 把未提交漂移
回滚到 HEAD。所有 git 命令都走 shell 缝（`ctx.shell`），沙箱与审批策略与
`bash` 完全一致地约束每条命令；本包不直接派生子进程。

## 组合行

```yaml
- id: tool-selfmod-git
  name: '@deepseek-ai/dsh-tool-selfmod-git'
  config:
    addArgs: ['-A']
    commitPrefix: 'agent: '
    timeoutMs: 60000
```

会话工作区必须是 git 仓库；每次操作前 `git rev-parse` 守卫，否则失败大声。

## 模型体验

两个工具：

- `selfmod_commit {message?}`：`git add <addArgs>` 后 `git commit -m "<prefix><message>"`；
  "nothing to commit" 退出按空操作报告而非失败。返回 `{committed, head, detail}`。
- `selfmod_rollback`：`git reset --hard HEAD`；未跟踪文件保留（不做
  `git clean`）。返回 `{ok, head, detail}`。

无提示段：工具描述即完整模型可见契约。

## 已知限制与待办

- 无 agent 的调用以 `{session: undefined}` 解析沙箱策略；后续层可线程化真实会话。
- 提交身份来自仓库 git 配置，而非 agent。
