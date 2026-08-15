# 运行时预设切换工具

`switch_preset` 让模型把当前会话的 agent 组合**不重启 host**地切到另一预设：
历史对话保留，新组合（工具/提示段/委派后端）从下一条请求生效。

## 组合行

```yaml
- id: tool-preset-switch
  name: '@deepseek-ai/dsh-tool-preset-switch'
```

通过 `ctx.get('agentPresets')` 读取名册；组合未挂 `dsh-agent-presets` 时工具
挂起但每次调用以同一错误失败。代理作用域取自 `ToolExecution.agent.ctx`；
无代理作用域的调用（headless 分发）被拒绝。

## 模型体验

单一工具 `switch_preset {preset}`：返回 `{switched, from, to, detail}`；
已在目标预设时为空操作。重组合语义即 `dsh-agent-presets` 的
`recompose(agentCtx, id)` 契约（非作用域上下文被名册服务拒绝；切换对模型
仅通过本工具结果可见，harness 无损记录工具结果）。

无提示段：工具描述即完整的模型可见契约。

## 已知限制与待办

- `requireApproval` 配置已声明未用；后续层可挂 `dsh-user-approval` 门控。
- 轮次中途切换从下一条请求生效；在途请求不做实时重组合。
