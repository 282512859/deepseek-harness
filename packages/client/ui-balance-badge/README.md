# @deepseek-ai/dsh-client-ui-balance-badge

DeepSeek account-balance chip in the composer tool row
(`conversation.input.right`), backed by the `deepseekBalance` Host Remote
(`@deepseek-ai/dsh-balance-badge`). Shows `余额 ¥<cny>`, refreshes every five
minutes and on click, and exposes the granted/topped breakdown plus account
availability in the hover title.

## Composition

```yaml
- id: ui-balance-badge
  name: '@deepseek-ai/dsh-client-ui-balance-badge'
```

Requires the `balance-badge` host row (`@deepseek-ai/dsh-balance-badge`).

## Model experience

No model-facing surface: this is a UI-only readout. The chip renders
`余额 ···` while loading, `余额 ¥<cny>` on success (hover for breakdown), and
`余额 查询失败` with a hover reason on failure; clicking refreshes.

## Known limitations and deferred work

- Visual state uses inline styles; a theme-token pass would make it follow
  the product theme.
- The five-minute refresh relies on the client timer plugin being mounted.
