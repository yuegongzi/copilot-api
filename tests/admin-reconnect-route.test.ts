import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

import type { AppConfig } from "~/lib/config"

import { copilotTokenManager } from "~/lib/copilot-token-manager"
import { getConfig, saveConfig } from "~/lib/config"
import { state } from "~/lib/state"
import { server } from "~/server"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch
const originalToken = state.copilotToken
const originalGithubToken = state.githubToken
const originalModels = state.models

const tokenManager = copilotTokenManager as unknown as {
  tokenExpiresAt: number
}
const originalTokenExpiresAt = tokenManager.tokenExpiresAt

const ACCOUNT_1: AppConfig["accounts"] extends Array<infer T> ? T : never = {
  id: "111",
  login: "alice",
  avatarUrl: "https://example.com/alice.png",
  token: "ghu_alice_token",
  accountType: "individual",
  createdAt: "2025-01-01T00:00:00.000Z",
}

let originalConfig: AppConfig

// Snapshot the config once (synchronously) before any test runs.
beforeEach(async () => {
  originalConfig = structuredClone(getConfig())
})

afterEach(async () => {
  // Restore config to what it was before the test.
  await saveConfig(originalConfig)

  state.copilotToken = originalToken
  state.githubToken = originalGithubToken
  state.models = originalModels
  tokenManager.tokenExpiresAt = originalTokenExpiresAt
  globalThis.fetch = originalFetch
})

// ---------------------------------------------------------------------------
// Shared request factory – sets request.ip to 127.0.0.1 so the
// localOnlyMiddleware passes without special auth.
// ---------------------------------------------------------------------------

function makeRequest(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Request {
  const { method = "GET", body } = options
  const req = new Request(`http://localhost/admin${path}`, {
    method,
    headers: {
      host: "localhost:4141",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  Object.defineProperty(req, "ip", {
    configurable: true,
    value: "127.0.0.1",
  })

  return req
}

// ---------------------------------------------------------------------------
// GET /api/auth/status
// ---------------------------------------------------------------------------

describe("GET /admin/api/auth/status", () => {
  test("returns authState: no_account when no active account in config", async () => {
    // Ensure no accounts in config
    await saveConfig({ ...originalConfig, accounts: [], activeAccountId: null })

    state.githubToken = undefined
    state.copilotToken = undefined
    tokenManager.tokenExpiresAt = 0

    const res = await server.fetch(makeRequest("/api/auth/status"))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.authState).toBe("no_account")
    expect(data.authenticated).toBe(false)
    expect(data.activeAccount).toBeNull()
  })

  test("returns authState: connected when active account exists and token is valid", async () => {
    await saveConfig({
      ...originalConfig,
      accounts: [ACCOUNT_1],
      activeAccountId: ACCOUNT_1.id,
    })

    // copilotTokenManager.hasValidToken() requires copilotToken + far-future expiry
    state.githubToken = ACCOUNT_1.token
    state.copilotToken = "copilot-test-token"
    tokenManager.tokenExpiresAt = Math.floor(Date.now() / 1000) + 3600

    const res = await server.fetch(makeRequest("/api/auth/status"))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.authState).toBe("connected")
    expect(data.authenticated).toBe(true)
    expect(data.activeAccount?.login).toBe("alice")
  })

  test("returns authState: needs_reconnect when active account exists but token invalid", async () => {
    await saveConfig({
      ...originalConfig,
      accounts: [ACCOUNT_1],
      activeAccountId: ACCOUNT_1.id,
    })

    // githubToken present but no valid copilot token
    state.githubToken = ACCOUNT_1.token
    state.copilotToken = undefined
    tokenManager.tokenExpiresAt = 0

    const res = await server.fetch(makeRequest("/api/auth/status"))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.authState).toBe("needs_reconnect")
    expect(data.authenticated).toBe(false)
    expect(data.activeAccount?.login).toBe("alice")
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/reconnect/device-code
// ---------------------------------------------------------------------------

describe("POST /admin/api/auth/reconnect/device-code", () => {
  test("returns 400 when accountId is missing from body", async () => {
    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/device-code", {
        method: "POST",
        body: {},
      }),
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.type).toBe("validation_error")
  })

  test("returns 404 when accountId does not match any saved account", async () => {
    await saveConfig({ ...originalConfig, accounts: [], activeAccountId: null })

    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/device-code", {
        method: "POST",
        body: { accountId: "nonexistent-id" },
      }),
    )

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error.type).toBe("not_found")
  })

  test("returns device code response with targetAccount when account is found", async () => {
    await saveConfig({
      ...originalConfig,
      accounts: [ACCOUNT_1],
      activeAccountId: ACCOUNT_1.id,
    })

    // Mock the GitHub device-code API response
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json({
          device_code: "dev-code-abc",
          user_code: "ABCD-1234",
          verification_uri: "https://github.com/login/device",
          expires_in: 900,
          interval: 5,
        }),
      ),
    ) as unknown as typeof fetch

    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/device-code", {
        method: "POST",
        body: { accountId: ACCOUNT_1.id },
      }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.deviceCode).toBe("dev-code-abc")
    expect(data.userCode).toBe("ABCD-1234")
    expect(data.verificationUri).toBe("https://github.com/login/device")
    expect(data.targetAccount).toMatchObject({
      id: ACCOUNT_1.id,
      login: ACCOUNT_1.login,
      accountType: ACCOUNT_1.accountType,
    })
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/reconnect/poll
// ---------------------------------------------------------------------------

describe("POST /admin/api/auth/reconnect/poll", () => {
  test("returns 400 when deviceCode is missing", async () => {
    await saveConfig({
      ...originalConfig,
      accounts: [ACCOUNT_1],
      activeAccountId: ACCOUNT_1.id,
    })

    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/poll", {
        method: "POST",
        body: { accountId: ACCOUNT_1.id },
      }),
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.type).toBe("validation_error")
  })

  test("returns 400 when accountId is missing", async () => {
    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/poll", {
        method: "POST",
        body: { deviceCode: "dev-code-abc" },
      }),
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.type).toBe("validation_error")
  })

  test("returns 404 when accountId does not match any saved account", async () => {
    await saveConfig({ ...originalConfig, accounts: [], activeAccountId: null })

    // Stub fetch so pollAccessTokenOnce never fires an outbound request
    globalThis.fetch = mock(() =>
      Promise.resolve(Response.json({ error: "authorization_pending" })),
    ) as unknown as typeof fetch

    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/poll", {
        method: "POST",
        body: { deviceCode: "dev-code-abc", accountId: "nonexistent-id" },
      }),
    )

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error.type).toBe("not_found")
  })

  test("returns { pending: true } when poll result is pending", async () => {
    await saveConfig({
      ...originalConfig,
      accounts: [ACCOUNT_1],
      activeAccountId: ACCOUNT_1.id,
    })

    // GitHub returns authorization_pending
    globalThis.fetch = mock(() =>
      Promise.resolve(Response.json({ error: "authorization_pending" })),
    ) as unknown as typeof fetch

    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/poll", {
        method: "POST",
        body: { deviceCode: "dev-code-abc", accountId: ACCOUNT_1.id },
      }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.pending).toBe(true)
  })

  test("returns 400 when poll result is expired", async () => {
    await saveConfig({
      ...originalConfig,
      accounts: [ACCOUNT_1],
      activeAccountId: ACCOUNT_1.id,
    })

    globalThis.fetch = mock(() =>
      Promise.resolve(Response.json({ error: "expired_token" })),
    ) as unknown as typeof fetch

    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/poll", {
        method: "POST",
        body: { deviceCode: "dev-code-abc", accountId: ACCOUNT_1.id },
      }),
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.type).toBe("expired")
  })

  test("returns 400 when poll result is denied", async () => {
    await saveConfig({
      ...originalConfig,
      accounts: [ACCOUNT_1],
      activeAccountId: ACCOUNT_1.id,
    })

    globalThis.fetch = mock(() =>
      Promise.resolve(Response.json({ error: "access_denied" })),
    ) as unknown as typeof fetch

    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/poll", {
        method: "POST",
        body: { deviceCode: "dev-code-abc", accountId: ACCOUNT_1.id },
      }),
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.type).toBe("denied")
  })

  test("returns 400 on identity mismatch (resolved user id differs from target account)", async () => {
    await saveConfig({
      ...originalConfig,
      accounts: [ACCOUNT_1],
      activeAccountId: ACCOUNT_1.id,
    })

    // First call: poll returns success with a token
    // Second call: GitHub /user returns a DIFFERENT user id
    let callCount = 0
    globalThis.fetch = mock(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(
          Response.json({
            access_token: "ghu_new_token",
            token_type: "bearer",
            scope: "read:user",
          }),
        )
      }
      // /user endpoint — different id than ACCOUNT_1.id
      return Promise.resolve(
        Response.json({ id: 9999, login: "mallory", avatar_url: "" }),
      )
    }) as unknown as typeof fetch

    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/poll", {
        method: "POST",
        body: { deviceCode: "dev-code-abc", accountId: ACCOUNT_1.id },
      }),
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.type).toBe("identity_mismatch")
  })

  test("returns { success: true, account } on successful reconnect with matching identity", async () => {
    await saveConfig({
      ...originalConfig,
      accounts: [ACCOUNT_1],
      activeAccountId: ACCOUNT_1.id,
    })

    let callCount = 0
    globalThis.fetch = mock(() => {
      callCount++
      if (callCount === 1) {
        // pollAccessTokenOnce → access_token response
        return Promise.resolve(
          Response.json({
            access_token: "ghu_refreshed_token",
            token_type: "bearer",
            scope: "read:user",
          }),
        )
      }
      if (callCount === 2) {
        // getGitHubUser — same id as ACCOUNT_1
        return Promise.resolve(
          Response.json({
            id: Number(ACCOUNT_1.id),
            login: ACCOUNT_1.login,
            avatar_url: ACCOUNT_1.avatarUrl,
          }),
        )
      }
      if (callCount === 3) {
        // applyAccountToState → copilotTokenManager.getToken → getCopilotToken
        return Promise.resolve(
          Response.json({
            token: "copilot-test-token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_in: 1500,
          }),
        )
      }
      // cacheModels → getModels (call 4+)
      return Promise.resolve(
        Response.json({ data: [], object: "list" }),
      )
    }) as unknown as typeof fetch

    const res = await server.fetch(
      makeRequest("/api/auth/reconnect/poll", {
        method: "POST",
        body: { deviceCode: "dev-code-abc", accountId: ACCOUNT_1.id },
      }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.account.id).toBe(ACCOUNT_1.id)
    expect(data.account.login).toBe(ACCOUNT_1.login)
    expect(data.account.accountType).toBe(ACCOUNT_1.accountType)
  })
})
