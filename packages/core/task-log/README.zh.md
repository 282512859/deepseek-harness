# @deepseek-ai/dsh-task-log

任务日志，源自 Claude Code 的 `.claude/tasks`，落为 harness 原生形态：沙箱
工作区内每个任务一个 JSON 文件，提供 `task_start` / `task_update` /
`task_list` / `task_show` 工具。所有文件访问都走沙箱 `ctx.fs` 缝（与
`tool-fs` 同等围栏）；任务 id 在任何文件访问前按严格模式校验，记录内笔记只增不改。

## 组合

```yaml
- id: task-log
  name: '@deepseek-ai/dsh-task-log'
  config:
    root: tasks
    sectionOrder: 57
    maxList: 100
```

任务文件位于 `<workspace>/tasks/<id>.json`。

## 模型体验

四个工具 + 提示段：

- `task_start {title, note?}` — 创建 open 任务。返回 `{id, title, status, notes}`。
- `task_update {id, status?, note?}` — 改状态（`open`/`in-progress`/`done`/`blocked`）
  和/或追加笔记；至少一项变更。返回 `{id, status, notes, updated}`。
- `task_list {status?}` — 最新在前的摘要列表，可过滤。返回 `{total, tasks: [{id, title, status, updated}]}`。
- `task_show {id}` — 含笔记的完整记录。
- 提示段说明约定，让 agent 把长任务保持跨轮次可见。

## 已知限制与待办

- 任务 id 由时间派生（`task-<unix-ms>`）；同一毫秒内两次 `task_start` 会冲突
  （单 agent 可接受）。
- `task_list` 每次调用都重扫日志目录；不维护索引。
