/**
 * DeepSeek API account balance for the web GUI: a stateless Remote service
 * that resolves the configured API-key credential and queries the balance
 * endpoint through the subprocess seam (curl). No key value is ever exposed
 * in a response or persisted; every credential read goes through the
 * credentials seam.
 * @module @deepseek-ai/dsh-balance-badge
 */
import { tmpdir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { BalanceResult } from './types.ts'

export type { BalanceResult } from './types.ts'

/** Official DeepSeek balance endpoint. */
export const BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** Plugin config. */
export interface Config {
  /** Balance endpoint URL. */
  url?: string
  /** curl timeout in milliseconds. */
  timeoutMs?: number
  /** Credential reference (environment variable name) holding the API key. */
  apiKeyEnv?: string
}

export const Config: s<Config> = s.object({
  url: s.string().default(BALANCE_URL),
  timeoutMs: s.natural().default(15000),
  apiKeyEnv: s.string().default('DEEPSEEK_API_KEY'),
})

/** Resolved config type. */
export type ResolvedConfig = Required<Config>

/** The seams the service needs (stubs in unit tests). */
export interface BalanceSeam {
  resolveCredential(ref: string): Promise<{ value: string } | undefined>
  runBalanceQuery(key: string, url: string, timeoutMs: number):
  Promise<{ exitCode: number | null; stdout: string; stderr: string }>
}

/**
 * Parse the balance endpoint response; malformed or non-CNY responses fail
 * descriptively.
 * @param raw - the raw response body.
 */
export function parseBalance(raw: string): BalanceResult {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, reason: '响应解析失败' }
  }
  if (data === null || typeof data !== 'object' || !Array.isArray((data as { balance_infos?: unknown }).balance_infos)) {
    return { ok: false, reason: '响应缺 balance_infos' }
  }
  let cny: unknown
  let granted: unknown
  let topped: unknown
  for (const info of (data as { balance_infos: unknown[] }).balance_infos) {
    if (info !== null && typeof info === 'object' && (info as { currency?: unknown }).currency === 'CNY') {
      cny = (info as { total_balance?: unknown }).total_balance
      granted = (info as { granted_balance?: unknown }).granted_balance
      topped = (info as { topped_up_balance?: unknown }).topped_up_balance
    }
  }
  if (cny === undefined) return { ok: false, reason: '响应无 CNY 余额' }
  return {
    ok: true,
    available: (data as { is_available?: unknown }).is_available === true,
    cny: String(cny),
    granted: granted === undefined ? null : String(granted),
    topped: topped === undefined ? null : String(topped),
  }
}

/**
 * Run one balance query through a seam and normalize the outcome.
 * @param seam - the credential/subprocess seams.
 * @param key - the resolved API key.
 * @param url - the balance endpoint.
 * @param timeoutMs - the curl timeout.
 */
export async function fetchBalance(seam: BalanceSeam, key: string, url: string, timeoutMs: number): Promise<BalanceResult> {
  const outcome = await seam.runBalanceQuery(key, url, timeoutMs)
  if (outcome.exitCode !== 0) {
    return { ok: false, reason: `请求失败(${String(outcome.exitCode)}): ${outcome.stderr.trim().slice(0, 300)}` }
  }
  return parseBalance(outcome.stdout)
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    deepseekBalance: DeepseekBalanceService
  }
}

/** DeepSeek account-balance Remote service. */
export class DeepseekBalanceService extends TypertRemoteService {
  static inject = ['credentials', 'subprocess']
  static Config: s<Config> = Config

  private readonly config: ResolvedConfig

  /**
   * @param ctx - Host context carrying credentials and the subprocess seam.
   * @param config - Balance endpoint and credential policy.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'deepseekBalance')
    this.config = {
      url: config.url ?? BALANCE_URL,
      timeoutMs: config.timeoutMs ?? 15000,
      apiKeyEnv: config.apiKeyEnv ?? 'DEEPSEEK_API_KEY',
    }
  }

  /** Resolve the configured credential and query the balance endpoint. */
  @Remote('get')
  async get(): Promise<BalanceResult> {
    const seam = this.seam()
    const cred = await seam.resolveCredential(this.config.apiKeyEnv)
    if (cred === undefined) return { ok: false, reason: `未配置 ${this.config.apiKeyEnv}` }
    return fetchBalance(seam, cred.value, this.config.url, this.config.timeoutMs)
  }

  /** Assemble the runtime seam over the injected services. */
  private seam(): BalanceSeam {
    const ctx = this.ctx as unknown as {
      credentials?: { resolve(ref: string): Promise<{ value: string } | undefined> }
      subprocess?: {
        resolveExecutable(command: string): Promise<string>
        spawn(spec: {
          argv: string[]
          cwd: string
          graceMs: number
          stdio: { stdin: string; stdout: { maxBytes: number }; stderr: { maxBytes: number } }
        }): {
          done: Promise<{ exitCode: number | null }>
          collected: {
            stdout?: { readFrom(offset: number): { text: string } }
            stderr?: { readFrom(offset: number): { text: string } }
          }
        }
      }
    }
    return {
      resolveCredential: async (ref) => {
        if (ctx.credentials === undefined) return undefined
        return ctx.credentials.resolve(ref)
      },
      runBalanceQuery: async (key, url, timeoutMs) => {
        if (ctx.subprocess === undefined) {
          return { exitCode: 1, stdout: '', stderr: 'subprocess 服务不可用' }
        }
        const curl = await ctx.subprocess.resolveExecutable('curl')
        const handle = ctx.subprocess.spawn({
          argv: [curl, '-s', '-S', '-m', String(Math.ceil(timeoutMs / 1000)), '-H', `Authorization: Bearer ${key}`, url],
          // cwd 必须恒存在：直接用 tmpdir 根目录（子目录需先创建，否则 spawn ENOENT）
          cwd: tmpdir(),
          graceMs: timeoutMs + 15000,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 8192 } },
        })
        const outcome = await handle.done
        return {
          exitCode: outcome.exitCode,
          stdout: handle.collected.stdout?.readFrom(0).text ?? '',
          stderr: handle.collected.stderr?.readFrom(0).text ?? '',
        }
      },
    }
  }
}

export default DeepseekBalanceService
