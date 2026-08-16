# @deepseek-ai/dsh-balance-badge

DeepSeek API 账户余额，以无状态 Remote 服务形态提供给 Web GUI 余额徽章。
`get()` 经 credentials 缝解析配置的 API 密钥，再经 subprocess 缝（curl）查询
`https://api.deepseek.com/user/balance`。密钥值绝不出现在响应中、不持久化；
每次读取都走 credentials 缝。

## 组合

```yaml
- id: balance-badge
  name: '@deepseek-ai/dsh-balance-badge'
  config:
    url: https://api.deepseek.com/user/balance
    timeoutMs: 15000
    apiKeyEnv: DEEPSEEK_API_KEY
```

## Remote 面

- `get(): Promise<BalanceResult>` — `{ok, reason?, available?, cny?,
  granted?, topped?}`；业务失败带描述（`未配置 DEEPSEEK_API_KEY`、
  `请求失败(<exit>): <stderr>`、`响应解析失败`、`响应缺 balance_infos`、
  `响应无 CNY 余额`）。

客户端半在 `@deepseek-ai/dsh-client-ui-balance-badge`（输入栏右侧徽章，
每五分钟刷新）。

## 已知限制与待办

- 通过 subprocess 缝调用 `curl`；宿主服务无原生 fetch 通道可替代。
- 仅展示 CNY 余额项，其它币种忽略。
