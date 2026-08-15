/**
 * Model-facing runtime preset switch: `switch_preset` re-composes the current
 * session's agent composition onto another roster preset without a host restart.
 * Conversation history stays in place; the new composition applies from the next
 * model request. The roster service is read through `ctx.get`, so a composition
 * without `dsh-agent-presets` mounts the tool dormant and every call fails loud
 * with the same message.
 * @module @deepseek-ai/dsh-tool-preset-switch
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { AgentPresets } from '@deepseek-ai/dsh-agent-presets'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-preset-switch'

/** Services required by the tool registry. */
export const inject = ['tools']

/** Plugin config — no knobs today; `Config` keeps the shape for future gating. */
export interface Config {
  /** Whether a switch needs human approval before recomposition (unused yet). */
  requireApproval?: boolean
}

export const Config: z<Config> = z.object({
  requireApproval: z.boolean().default(false),
})

/** Resolved config type. */
export type ResolvedConfig = Required<Config>

/** One `switch_preset` execution outcome, mirroring the tool output schema. */
export interface SwitchResult {
  switched: boolean
  from: string
  to: string
  detail: string
}

/**
 * Re-compose `scope` onto `preset` through the roster service.
 * @param preset - the target preset id from the roster.
 * @param presets - the roster service, `undefined` when not mounted.
 * @param scope - the caller's (agent) scope; recompose refuses unscoped contexts.
 * @returns the switch outcome.
 */
export async function execute(
  preset: string,
  presets: Pick<AgentPresets, 'composedPreset' | 'recompose'> | undefined,
  scope: Context,
): Promise<SwitchResult> {
  if (presets === undefined) {
    throw new Error('switch_preset: agent presets service unavailable')
  }
  const current = presets.composedPreset(scope) ?? '(default)'
  if (preset === current) {
    return { switched: false, from: current, to: preset, detail: 'already on this preset' }
  }
  await presets.recompose(scope, preset)
  return { switched: true, from: current, to: preset, detail: 'composition switched; applies from the next request' }
}

/** Register the `switch_preset` tool. */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  void resolved
  ctx.tools.register(defineTool({
    name: 'switch_preset',
    description:
      'Switch the current session to another agent preset without restarting the host. '
      + 'Conversation history is preserved; the new composition (tools, prompt sections, delegation backends) '
      + 'applies from the next model request. Pass the target preset id from the roster.',
    parameters: {
      preset: {
        type: 'string',
        required: true,
        description: 'Target preset id from the agent preset roster.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          switched: { type: 'boolean', required: true },
          from: { type: 'string', required: true },
          to: { type: 'string', required: true },
          detail: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: `switch_preset: ${value.from} → ${value.to} (${value.detail})`,
        },
      ],
    },
    execute: async (args, exec) => {
      const agent = exec.agent
      if (agent === undefined) {
        throw new Error('switch_preset: no agent scope for this call')
      }
      return execute(args.preset, agent.ctx.get('agentPresets'), agent.ctx)
    },
  }))
}
