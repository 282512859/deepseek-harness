# 轨迹摘要工具

`trajectory` 读取当前会话日志，返回最近事件（用户/助手消息、工具调用与
结果、回合结束）的紧凑摘要，让 agent 不必回放原始日志行即可回顾自身近期轨迹。

## 组合行

```yaml
- id: tool-trajectory
  name: '@deepseek-ai/dsh-tool-trajectory'
  config:
    defaultLimit: 20
```

摘要是权威会话事件窗口（`Session.events`）的纯函数；会话服务持有事件权威。
无代理作用域或活动会话的调用失败大声。

## 模型体验

单一工具 `trajectory {limit?}`：返回 `{events, digest}`——总事件数与
最新在前（`#1` = 最新）的摘要行。消息摘要截断至 160 字符；chunk 与未知事件
折叠为无。无提示段：工具描述即完整模型可见契约。

## 已知限制与待办

- 仅摘要消息/工具/回合结束；plan/workflow/projection 事件暂未摘要。
- 摘要行为纯文本，无结构化事件元数据。
