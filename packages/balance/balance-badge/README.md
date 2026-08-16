# @deepseek-ai/dsh-balance-badge

DeepSeek API account balance as a stateless Remote service, backing the web
GUI balance chip. `get()` resolves the configured API-key credential through
the credentials seam, then queries `https://api.deepseek.com/user/balance`
via the subprocess seam (curl). No key value is ever exposed in a response or
persisted; every credential read goes through the credentials seam.

## Composition

```yaml
- id: balance-badge
  name: '@deepseek-ai/dsh-balance-badge'
  config:
    url: https://api.deepseek.com/user/balance
    timeoutMs: 15000
    apiKeyEnv: DEEPSEEK_API_KEY
```

## Remote surface

- `get(): Promise<BalanceResult>` — `{ok, reason?, available?, cny?,
  granted?, topped?}`; business failures are descriptive (`未配置
  DEEPSEEK_API_KEY`, `请求失败(<exit>): <stderr>`, `响应解析失败`,
  `响应缺 balance_infos`, `响应无 CNY 余额`).

The client half lives in `@deepseek-ai/dsh-client-ui-balance-badge`
(conversation.input.right chip with a five-minute refresh).

## Known limitations and deferred work

- The query shells out to `curl` through the subprocess seam; a native fetch
  provider would avoid the dependency but is not exposed to host services.
- Only the CNY balance entry is surfaced; other currencies are ignored.
