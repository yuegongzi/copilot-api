import consola from "consola"

import { type AccountConfig, getConfig, saveConfig } from "./config"
import { copilotTokenManager } from "./copilot-token-manager"
import { state } from "./state"

export type Account = AccountConfig

interface AccountsData {
  activeAccountId: string | null
  accounts: Array<Account>
}

/**
 * Apply an account's credentials to runtime state and refresh the Copilot token.
 * Centralizes the pattern duplicated across startup, activate, reconnect, and add-account flows.
 * Returns true when the Copilot token was refreshed successfully.
 */
export async function applyAccountToState(account: Account): Promise<boolean> {
  state.githubToken = account.token
  state.accountType = account.accountType

  try {
    copilotTokenManager.clear()
    await copilotTokenManager.getToken()
    return true
  } catch (error) {
    consola.warn(
      `[applyAccountToState] Copilot token refresh failed for ${account.login}:`,
      error,
    )
    return false
  }
}

/**
 * Clear runtime auth state (used when no valid account is available).
 */
export function clearAccountState(): void {
  state.githubToken = undefined
  copilotTokenManager.clear()
}

/**
 * Get accounts data from unified config
 */
function getAccountsSync(): AccountsData {
  const config = getConfig()
  return {
    activeAccountId: config.activeAccountId ?? null,
    accounts: config.accounts ?? [],
  }
}

/**
 * Get accounts data from unified config (async version)
 */
export function getAccounts(): Promise<AccountsData> {
  return Promise.resolve(getAccountsSync())
}

/**
 * Save accounts data to unified config
 */
async function saveAccounts(data: AccountsData): Promise<void> {
  const config = getConfig()
  config.accounts = data.accounts
  config.activeAccountId = data.activeAccountId
  await saveConfig(config)
}

/**
 * Add a new account or update existing one
 */
export async function addAccount(account: Account): Promise<void> {
  const data = await getAccounts()

  // Check if account already exists (by id or login)
  const existingIndex = data.accounts.findIndex(
    (a) => a.id === account.id || a.login === account.login,
  )

  if (existingIndex !== -1) {
    // Update existing account
    data.accounts[existingIndex] = account
    consola.info(`Updated existing account: ${account.login}`)
  } else {
    // Add new account
    data.accounts.push(account)
    consola.info(`Added new account: ${account.login}`)
  }

  // If this is the first account or no active account, set it as active
  if (!data.activeAccountId) {
    data.activeAccountId = account.id
  }

  await saveAccounts(data)
}

/**
 * Remove an account by ID
 */
export async function removeAccount(accountId: string): Promise<boolean> {
  const data = await getAccounts()

  const index = data.accounts.findIndex((a) => a.id === accountId)
  if (index === -1) {
    return false
  }

  data.accounts.splice(index, 1)

  // If we removed the active account, switch to another one
  if (data.activeAccountId === accountId) {
    data.activeAccountId = data.accounts[0]?.id ?? null
  }

  await saveAccounts(data)
  return true
}

/**
 * Set active account by ID
 */
export async function setActiveAccount(
  accountId: string,
): Promise<Account | null> {
  const data = await getAccounts()

  const account = data.accounts.find((a) => a.id === accountId)
  if (!account) {
    return null
  }

  data.activeAccountId = accountId
  await saveAccounts(data)

  return account
}

/**
 * Get the currently active account
 */
export async function getActiveAccount(): Promise<Account | null> {
  const data = await getAccounts()

  if (!data.activeAccountId) {
    return data.accounts[0] ?? null
  }

  return data.accounts.find((a) => a.id === data.activeAccountId) ?? null
}
