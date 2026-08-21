/**
 * Thin HTTP client for the MogBank API.
 *
 * Holds the agent's API key and knows how to persist it, because the single
 * most awkward moment in an agent's life with this bank is registration: the
 * key is returned exactly once and never shown again. If the agent loses it,
 * the account is unreachable. So `register` writes it to a credentials file
 * when one is configured, and every later call picks it up automatically.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const DEFAULT_API_URL = 'https://mogbank.vercel.app'

export interface StoredCredentials {
  agent_id: string
  api_key: string
  wallet_id?: string
  /** Kept because the bank will not show them again; the agent may need them. */
  ed25519_private_key?: string
  wallet_private_key?: string
  registered_at: string
}

export class MogBankError extends Error {
  readonly status: number
  readonly code?: string
  readonly body: unknown

  constructor(status: number, body: unknown) {
    const b = body as { error?: string; code?: string } | undefined
    super(b?.error ?? `MogBank request failed with status ${status}`)
    this.name = 'MogBankError'
    this.status = status
    this.code = b?.code
    this.body = body
  }
}

export class MogBankClient {
  private apiKey: string | undefined

  constructor(
    private readonly baseUrl: string = process.env.MOGBANK_API_URL ??
      DEFAULT_API_URL,
    apiKey: string | undefined = process.env.MOGBANK_API_KEY,
    private readonly credentialsFile: string | undefined = process.env
      .MOGBANK_CREDENTIALS_FILE
  ) {
    this.apiKey = apiKey || this.loadStoredKey()
  }

  get hasKey(): boolean {
    return Boolean(this.apiKey)
  }

  get url(): string {
    return this.baseUrl
  }

  private loadStoredKey(): string | undefined {
    if (!this.credentialsFile) return undefined
    try {
      const stored = JSON.parse(
        readFileSync(this.credentialsFile, 'utf8')
      ) as StoredCredentials
      return stored.api_key
    } catch {
      return undefined
    }
  }

  /** Remember credentials so the agent survives a restart. */
  saveCredentials(credentials: StoredCredentials): string | null {
    this.apiKey = credentials.api_key
    if (!this.credentialsFile) return null
    try {
      mkdirSync(dirname(this.credentialsFile), { recursive: true })
      writeFileSync(
        this.credentialsFile,
        JSON.stringify(credentials, null, 2),
        { mode: 0o600 }
      )
      return this.credentialsFile
    } catch {
      return null
    }
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    options: { body?: unknown; auth?: boolean; idempotencyKey?: string } = {}
  ): Promise<T> {
    const { body, auth = true, idempotencyKey } = options

    if (auth && !this.apiKey) {
      throw new MogBankError(401, {
        error:
          'No MogBank API key. Call mogbank_register first, or set MOGBANK_API_KEY.',
        code: 'NO_CREDENTIALS',
      })
    }

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (auth && this.apiKey) headers['x-api-key'] = this.apiKey
    if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const text = await response.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      /* keep the raw text — the API should always send JSON, but say so plainly if not */
    }

    if (!response.ok) throw new MogBankError(response.status, parsed)
    return parsed as T
  }
}
