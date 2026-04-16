import { Hono } from "hono"

import {
  addAccount,
  applyAccountToState,
  clearAccountState,
  getAccounts,
  getActiveAccount,
  removeAccount,
  setActiveAccount,
  type Account,
} from "~/lib/accounts"
import { getConfig, saveConfig } from "~/lib/config"
import { copilotTokenManager } from "~/lib/copilot-token-manager"
import { state } from "~/lib/state"
import { cacheModels } from "~/lib/utils"
import { getDeviceCode } from "~/services/github/get-device-code"
import { getGitHubUser } from "~/services/github/get-user"
import { pollAccessTokenOnce } from "~/services/github/poll-access-token"

import { adminHtml } from "./html"
import { localOnlyMiddleware } from "./middleware"

export const adminRoutes = new Hono()

// Apply localhost-only middleware to all admin routes
adminRoutes.use("*", localOnlyMiddleware)

// Get all accounts
adminRoutes.get("/api/accounts", async (c) => {
  const data = await getAccounts()

  // Return accounts without tokens for security
  const safeAccounts = data.accounts.map((account) => ({
    id: account.id,
    login: account.login,
    avatarUrl: account.avatarUrl,
    accountType: account.accountType,
    createdAt: account.createdAt,
    isActive: account.id === data.activeAccountId,
  }))

  return c.json({
    activeAccountId: data.activeAccountId,
    accounts: safeAccounts,
  })
})

// Get current active account
adminRoutes.get("/api/accounts/active", async (c) => {
  const account = await getActiveAccount()

  if (!account) {
    return c.json({ account: null })
  }

  return c.json({
    account: {
      id: account.id,
      login: account.login,
      avatarUrl: account.avatarUrl,
      accountType: account.accountType,
      createdAt: account.createdAt,
    },
  })
})

// Switch to a different account
adminRoutes.post("/api/accounts/:id/activate", async (c) => {
  const accountId = c.req.param("id")

  const account = await setActiveAccount(accountId)

  if (!account) {
    return c.json(
      {
        error: {
          message: "Account not found",
          type: "not_found",
        },
      },
      404,
    )
  }

  const tokenOk = await applyAccountToState(account)

  if (!tokenOk) {
    return c.json(
      {
        error: {
          message: "Failed to refresh Copilot token after account switch",
          type: "token_error",
        },
      },
      500,
    )
  }

  return c.json({
    success: true,
    account: {
      id: account.id,
      login: account.login,
      avatarUrl: account.avatarUrl,
      accountType: account.accountType,
    },
  })
})

// Delete an account
adminRoutes.delete("/api/accounts/:id", async (c) => {
  const accountId = c.req.param("id")

  const removed = await removeAccount(accountId)

  if (!removed) {
    return c.json(
      {
        error: {
          message: "Account not found",
          type: "not_found",
        },
      },
      404,
    )
  }

  // If we removed the current account, update state
  const activeAccount = await getActiveAccount()
  if (activeAccount) {
    await applyAccountToState(activeAccount)
  } else {
    clearAccountState()
  }

  return c.json({ success: true })
})

// Initiate device code flow for adding new account
adminRoutes.post("/api/auth/device-code", async (c) => {
  try {
    const response = await getDeviceCode()

    return c.json({
      deviceCode: response.device_code,
      userCode: response.user_code,
      verificationUri: response.verification_uri,
      expiresIn: response.expires_in,
      interval: response.interval,
    })
  } catch {
    return c.json(
      {
        error: {
          message: "Failed to get device code",
          type: "auth_error",
        },
      },
      500,
    )
  }
})

interface PollRequestBody {
  deviceCode: string
  interval: number
  accountType?: string
}

type CreateAccountResult =
  | { success: true; account: Account }
  | { success: false; error: string }

/**
 * Create and save account after successful authorization
 */
/* eslint-disable require-atomic-updates */
async function createAccountFromToken(
  token: string,
  accountType: string,
): Promise<CreateAccountResult> {
  const previousToken = state.githubToken
  state.githubToken = token

  let user
  try {
    user = await getGitHubUser()
  } catch {
    state.githubToken = previousToken
    return { success: false, error: "Failed to get user info" }
  }

  const resolvedAccountType =
    accountType === "business" || accountType === "enterprise" ?
      accountType
    : "individual"

  const account: Account = {
    id: user.id.toString(),
    login: user.login,
    avatarUrl: user.avatar_url,
    token,
    accountType: resolvedAccountType,
    createdAt: new Date().toISOString(),
  }

  await addAccount(account)
  await applyAccountToState(account)

  return { success: true, account }
}
/* eslint-enable require-atomic-updates */

// Poll for access token after user authorizes

adminRoutes.post("/api/auth/poll", async (c) => {
  const body = await c.req.json<PollRequestBody>()

  if (!body.deviceCode) {
    return c.json(
      {
        error: { message: "deviceCode is required", type: "validation_error" },
      },
      400,
    )
  }

  const result = await pollAccessTokenOnce(body.deviceCode)

  if (result.status === "pending") {
    return c.json({ pending: true, message: "Waiting for user authorization" })
  }

  if (result.status === "slow_down") {
    return c.json({
      pending: true,
      slowDown: true,
      interval: result.interval,
      message: "Rate limited, please slow down",
    })
  }

  if (result.status === "expired") {
    return c.json(
      {
        error: {
          message: "Device code expired. Please start over.",
          type: "expired",
        },
      },
      400,
    )
  }

  if (result.status === "denied") {
    return c.json(
      {
        error: { message: "Authorization was denied by user.", type: "denied" },
      },
      400,
    )
  }

  if (result.status === "error") {
    return c.json({ error: { message: result.error, type: "auth_error" } }, 500)
  }

  const accountResult = await createAccountFromToken(
    result.token,
    body.accountType ?? "individual",
  )

  if (!accountResult.success) {
    return c.json(
      { error: { message: accountResult.error, type: "auth_error" } },
      500,
    )
  }

  return c.json({
    success: true,
    account: {
      id: accountResult.account.id,
      login: accountResult.account.login,
      avatarUrl: accountResult.account.avatarUrl,
      accountType: accountResult.account.accountType,
    },
  })
})

// Initiate device code flow for reconnecting an existing account
adminRoutes.post("/api/auth/reconnect/device-code", async (c) => {
  const body = await c.req.json<{ accountId: string }>()

  if (!body.accountId) {
    return c.json(
      {
        error: {
          message: "accountId is required",
          type: "validation_error",
        },
      },
      400,
    )
  }

  const data = await getAccounts()
  const targetAccount = data.accounts.find((a) => a.id === body.accountId)

  if (!targetAccount) {
    return c.json(
      {
        error: {
          message: "Account not found",
          type: "not_found",
        },
      },
      404,
    )
  }

  try {
    const response = await getDeviceCode()

    return c.json({
      deviceCode: response.device_code,
      userCode: response.user_code,
      verificationUri: response.verification_uri,
      expiresIn: response.expires_in,
      interval: response.interval,
      targetAccount: {
        id: targetAccount.id,
        login: targetAccount.login,
        accountType: targetAccount.accountType,
      },
    })
  } catch {
    return c.json(
      {
        error: {
          message: "Failed to get device code",
          type: "auth_error",
        },
      },
      500,
    )
  }
})

interface ReconnectPollRequestBody {
  deviceCode: string
  accountId: string
}

// Poll for access token during reconnect flow
/* eslint-disable require-atomic-updates */
adminRoutes.post("/api/auth/reconnect/poll", async (c) => {
  const body = await c.req.json<ReconnectPollRequestBody>()

  if (!body.deviceCode || !body.accountId) {
    return c.json(
      {
        error: {
          message: "deviceCode and accountId are required",
          type: "validation_error",
        },
      },
      400,
    )
  }

  // Look up the target account
  const data = await getAccounts()
  const targetAccount = data.accounts.find((a) => a.id === body.accountId)

  if (!targetAccount) {
    return c.json(
      {
        error: {
          message: "Account not found",
          type: "not_found",
        },
      },
      404,
    )
  }

  const result = await pollAccessTokenOnce(body.deviceCode)

  if (result.status === "pending") {
    return c.json({ pending: true, message: "Waiting for user authorization" })
  }

  if (result.status === "slow_down") {
    return c.json({
      pending: true,
      slowDown: true,
      interval: result.interval,
      message: "Rate limited, please slow down",
    })
  }

  if (result.status === "expired") {
    return c.json(
      {
        error: {
          message: "Device code expired. Please start over.",
          type: "expired",
        },
      },
      400,
    )
  }

  if (result.status === "denied") {
    return c.json(
      {
        error: {
          message: "Authorization was denied by user.",
          type: "denied",
        },
      },
      400,
    )
  }

  if (result.status === "error") {
    return c.json({ error: { message: result.error, type: "auth_error" } }, 500)
  }

  // Verify the new token resolves to the same GitHub identity
  const previousToken = state.githubToken
  state.githubToken = result.token

  let user
  try {
    user = await getGitHubUser()
  } catch {
    state.githubToken = previousToken
    return c.json(
      {
        error: {
          message: "Failed to verify GitHub identity",
          type: "auth_error",
        },
      },
      500,
    )
  }

  if (user.id.toString() !== targetAccount.id) {
    state.githubToken = previousToken
    return c.json(
      {
        error: {
          message: `Identity mismatch: expected ${targetAccount.login} but got ${user.login}. Log in with the correct GitHub account.`,
          type: "identity_mismatch",
        },
      },
      400,
    )
  }

  // Update the account in place, preserving createdAt and accountType
  const updatedAccount: Account = {
    ...targetAccount,
    token: result.token,
    login: user.login,
    avatarUrl: user.avatar_url,
  }

  await addAccount(updatedAccount)

  // Set this account as active
  await setActiveAccount(updatedAccount.id)

  // Apply to runtime state and refresh
  const tokenOk = await applyAccountToState(updatedAccount)

  if (tokenOk) {
    await cacheModels()
  }

  return c.json({
    success: true,
    account: {
      id: updatedAccount.id,
      login: updatedAccount.login,
      avatarUrl: updatedAccount.avatarUrl,
      accountType: updatedAccount.accountType,
    },
  })
})
/* eslint-enable require-atomic-updates */

// Get current auth status
adminRoutes.get("/api/auth/status", async (c) => {
  const activeAccount = await getActiveAccount()

  const authenticated =
    Boolean(state.githubToken) && copilotTokenManager.hasValidToken()

  let authState: "no_account" | "connected" | "needs_reconnect"
  if (!activeAccount) {
    authState = "no_account"
  } else if (authenticated) {
    authState = "connected"
  } else {
    authState = "needs_reconnect"
  }

  return c.json({
    authenticated,
    authState,
    hasAccounts: Boolean(activeAccount),
    activeAccount:
      activeAccount ?
        {
          id: activeAccount.id,
          login: activeAccount.login,
          avatarUrl: activeAccount.avatarUrl,
          accountType: activeAccount.accountType,
        }
      : null,
  })
})

// Model Mapping API
adminRoutes.get("/api/model-mappings", (c) => {
  const config = getConfig()
  return c.json({ modelMapping: config.modelMapping ?? {} })
})

adminRoutes.get("/api/settings", (c) => {
  const config = getConfig()
  return c.json({
    rateLimitSeconds: config.rateLimitSeconds ?? null,
    rateLimitWait: config.rateLimitWait ?? false,
    envOverride: {
      rateLimitSeconds: process.env.RATE_LIMIT !== undefined,
      rateLimitWait: process.env.RATE_LIMIT_WAIT !== undefined,
    },
  })
})

adminRoutes.put("/api/settings", async (c) => {
  const body = await c.req.json<{
    rateLimitSeconds?: number | null
    rateLimitWait?: boolean
  }>()

  const rateLimitSeconds =
    body.rateLimitSeconds === null || body.rateLimitSeconds === undefined ?
      undefined
    : body.rateLimitSeconds

  if (
    rateLimitSeconds !== undefined
    && (!Number.isFinite(rateLimitSeconds) || rateLimitSeconds <= 0)
  ) {
    return c.json(
      {
        error: {
          message: '"rateLimitSeconds" must be a number greater than 0',
          type: "validation_error",
        },
      },
      400,
    )
  }

  const rateLimitWait = Boolean(body.rateLimitWait)
  const config = getConfig()
  await saveConfig({
    ...config,
    rateLimitSeconds,
    rateLimitWait,
  })

  state.rateLimitSeconds =
    process.env.RATE_LIMIT === undefined ?
      rateLimitSeconds
    : state.rateLimitSeconds
  state.rateLimitWait =
    process.env.RATE_LIMIT_WAIT === undefined ?
      rateLimitWait
    : state.rateLimitWait

  return c.json({
    success: true,
    settings: {
      rateLimitSeconds: rateLimitSeconds ?? null,
      rateLimitWait,
    },
  })
})

adminRoutes.put("/api/model-mappings/:from", async (c) => {
  const from = c.req.param("from")
  const body = await c.req.json<{ to: string }>()

  if (!body.to || typeof body.to !== "string") {
    return c.json(
      {
        error: { message: '"to" field is required', type: "validation_error" },
      },
      400,
    )
  }

  const config = getConfig()
  const modelMapping = { ...config.modelMapping, [from]: body.to }
  await saveConfig({ ...config, modelMapping })
  return c.json({ success: true, from, to: body.to })
})

adminRoutes.delete("/api/model-mappings/:from", async (c) => {
  const from = c.req.param("from")
  const config = getConfig()

  if (!config.modelMapping || !(from in config.modelMapping)) {
    return c.json(
      { error: { message: "Mapping not found", type: "not_found" } },
      404,
    )
  }

  const { [from]: _removed, ...rest } = config.modelMapping
  await saveConfig({ ...config, modelMapping: rest })
  return c.json({ success: true })
})

// Serve static HTML for admin UI
adminRoutes.get("/", (c) => {
  return c.html(adminHtml)
})
