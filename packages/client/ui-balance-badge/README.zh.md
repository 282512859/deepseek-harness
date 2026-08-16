# @deepseek-ai/dsh-client-ui-balance-badge

输入栏工具行（`conversation.input.right`）的 DeepSeek 账户余额徽章，数据来自
`deepseekBalance` 宿主 Remote（`@deepseek-ai/dsh-balance-badge`）。显示
`余额 ¥<cny>`，每五分钟与点击时刷新；悬停标题含充值/赠送明细与账户可用状态。

## 组合

```yaml
- id: ui-balance-badge
  name: '@deepseek-ai/dsh-client-ui-balance-badge'
```

需要 `balance-badge` 宿主行（`@deepseek-ai/dsh-balance-badge`）。

## 模型体验

无模型面：纯 UI 只读。加载中显示 `余额 ···`，成功显示 `余额 ¥<cny>`
（悬停看明细），失败显示 `余额 查询失败`（悬停看原因）；点击刷新。

## 已知限制与待办

- 视觉使用内联样式；后续可接主题 token。
- 五分钟刷新依赖客户端 timer 插件挂载。
