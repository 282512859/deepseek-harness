# Feature: balance-badge (DeepSeek account balance chip)

Date: 2026-08-16
Status: implemented (new host service + client plugin, additive)

## What

The DeepSeek API account-balance readout, hardened from the repeated
dynamic-plugin incarnation (process-local, lost on every host restart) into a
permanent pair:

- `@deepseek-ai/dsh-balance-badge` — stateless `deepseekBalance` Remote
  service (`get()`): resolves the configured `DEEPSEEK_API_KEY` credential
  through the credentials seam, queries
  `https://api.deepseek.com/user/balance` via the subprocess seam (curl),
  and returns only the CNY fields. No key value is ever exposed or persisted.
- `@deepseek-ai/dsh-client-ui-balance-badge` — the composer-row chip
  (`conversation.input.right`): `余额 ¥<cny>`, five-minute refresh via the
  client timer, click-to-refresh, breakdown in the hover title.

## Decisions worth keeping

1. **The Remote service split, not the dynamic-plugin pair.** A packaged
   host service + client plugin survives restarts and ships with the
   closure; the dynamic plugin was rebuilt at least three times across host
   restarts. The message-feedback service/client split is the template.
2. **Typert boundary discipline.** Remote boundary types must live in a
   public `./types` subpath, and the generator requires `./remote` and
   `./typert` exports; api/remotes assembles each Remote by explicit import.
   Missing any of these fails the build loudly with a generator error.
3. **Credentials seam, never env reads.** The key is resolved per request
   through `credentials.resolve`, matching the llm-deepseek pattern; a
   changed key reaches the next refresh without a restart.
4. **curl via the subprocess seam.** Host services have no raw fetch; the
   subprocess seam gives sandbox-consistent confinement and captured
   stdout/stderr for diagnostics.

## Deferred

- The chip uses inline styles; a theme-token pass would follow the product
  theme.
- Real-composition boot test is still owed per the product-visible-plugin
  policy; unit coverage is 100% on all four metrics across both packages.
