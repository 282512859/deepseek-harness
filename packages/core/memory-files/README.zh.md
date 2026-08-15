# 可写 agent 记忆

源自 OpenClaw 的每 agent 记忆文件（IDENTITY/SOUL/USER.md）与按日笔记：
一个 scope-only 行，把记忆约定作为提示段呈现，并提供
`memory_write` / `note_append` / `note_recall` 三个工具。所有文件访问都走
沙箱化的 `ctx.fs` 缝，挂载的沙箱策略与 `tool-fs` 完全一致地约束每次写入。

## 组合行

```yaml
- id: memory-files
  name: '@deepseek-ai/dsh-memory-files'
  config:
    root: memory
    files: [IDENTITY.md, SOUL.md, USER.md]
    notesFile: notes.md
    sectionOrder: 55
```

记忆文件位于 `<workspace>/memory/`。路径经白名单校验；路径穿越与绝对路径被拒绝。

## 模型体验

三个工具 + 一个提示段：

- `memory_write {file, content}`：整体替换一个记忆文件（身份/灵魂/用户画像）。
  返回 `{written, file, chars}`。
- `note_append {note}`：向 `notes.md` 追加带时间戳的一行。返回 `{appended, file, chars}`。
- `note_recall {query?, limit?}`：匹配的笔记行，最新在前。返回 `{total, notes}`。
- 提示段说明约定，让 agent 自己维护记忆。

## 已知限制与待办

- `note_append` 是读-改-写；并发追加可能竞态（单 agent 可接受）。
- 提示段是静态指引；记忆内容用常规 fs 工具读取，不在组装期嵌入。
