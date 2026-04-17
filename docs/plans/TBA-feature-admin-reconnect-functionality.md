# Admin Reconnect Functionality

## Objective

Implement a recoverable authentication lifecycle for saved GitHub accounts by reusing the existing device-code flow, preventing startup failure on stale credentials, and allowing each saved account row to reconnect and become active on success.

## Problem Summary

The current server assumes the saved active account is valid at startup. If GitHub or Copilot authentication has expired, startup can fail before `/admin` becomes usable. The admin page also lacks a real reconnect flow even though it already shows reconnect-adjacent empty-state copy.

## Locked Decisions

- Startup must continue even when the active account is stale or invalid.
- The admin page must surface `needs_reconnect` for the active account.
- Every saved account row must support `Reconnect`.
- Reconnect preserves the stored `accountType`.
- Reconnecting a non-active account automatically makes it active on success.
- Inactive saved accounts do not require proactive validity probing.

## Success Criteria

- A stale active account no longer prevents the process from starting and serving `/admin`.
- The backend distinguishes at least `connected`, `needs_reconnect`, and `no_account` for the active account.
- Reconnect reuses the existing GitHub device-code flow instead of adding a new auth mechanism.
- Reconnecting an existing account updates that saved account in place, preserves `createdAt`, refreshes runtime auth state, and refreshes model cache.
- Route-level and UI-level tests cover the new behavior.

## Scope

### In Scope

- Startup degradation and recovery.
- Auth-status contract for the active account.
- Reconnect API behavior.
- Account persistence semantics for reconnect.
- Frontend wiring for row-level reconnect.
- Tests for reconnect lifecycle and degraded startup.

### Out Of Scope

- Background health checks for all saved accounts.
- A new OAuth or browser-login flow.
- Remote multi-user auth hardening for `/v1/*`.
- Large refactors of account-management architecture beyond what reconnect correctness requires.

## Root-Cause Findings

- Startup in [src/main.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/main.ts) eagerly loads the active account, then immediately calls Copilot token refresh and model caching. A refresh failure bubbles to top-level startup failure.
- [src/routes/admin/route.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/routes/admin/route.ts) exposes add-account device-code flow but does not expose reconnect semantics or richer auth-state reporting.
- [src/routes/admin/html.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/routes/admin/html.ts) already has reconnect-oriented empty-state copy, but there is no backend or row action that makes it real.
- [src/lib/accounts.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/lib/accounts.ts) can update accounts by id or login, but reconnect-specific invariants such as `createdAt` preservation and identity mismatch handling are not explicit.

## Requirements

### R1. Recoverable Startup

- The server must still start when the configured active account fails token refresh.
- The saved account record should remain available for reconnect.
- In-memory auth state should be left in a safe degraded state instead of pretending the session is healthy.

### R2. Explicit Active-Account Auth State

- The admin auth-status endpoint must expose enough state for the page to distinguish:
  - `no_account`
  - `connected`
  - `needs_reconnect`
- The response should remain cheap enough for page polling and page-init usage.

### R3. Reconnect Reuses Device-Code Flow

- Reconnect must reuse the existing GitHub device-code flow.
- The flow must accept a target account id.
- The reconnect path must preserve the existing `accountType`.

### R4. Reconnect Updates The Existing Account In Place

- `createdAt` must be preserved.
- A reconnect must not silently create a duplicate saved account.
- If the resolved GitHub identity does not match the target account, the route should fail explicitly instead of rebinding the row to another user.

### R5. Successful Reconnect Applies Runtime State Coherently

- Update `state.githubToken`.
- Update `state.accountType`.
- Clear and refresh the Copilot token.
- Refresh dependent model cache.
- Mark the reconnected account as active.

### R6. Test Coverage Must Close The Main Regression Paths

- Startup degradation.
- Reconnect success.
- Reconnect denied or expired device-code flow.
- Missing or invalid target account.
- Inactive-account reconnect becomes active.

## Implementation Plan

### Phase 1: Runtime Recovery Foundation

1. Extract or centralize the logic for applying an account to runtime state and refreshing dependent auth resources.
2. Reuse that helper from startup, account activation, and reconnect to avoid three slightly different implementations.
3. Change startup so a token-refresh failure is recoverable instead of fatal.

### Phase 2: Auth-State Contract

1. Expand the admin auth-status route to return a richer state than a single `authenticated` boolean.
2. Keep the contract active-account-centric rather than attempting to remotely validate every saved account.
3. Make sure the response shape is stable enough for the admin page to base empty-state and row-action decisions on it.

### Phase 3: Reconnect API

1. Extend the existing device-code start and poll flow, or add reconnect-specific variants that reuse the same underlying GitHub auth services.
2. Require a target account id for reconnect.
3. Preserve the target account’s stored `accountType` and `createdAt`.
4. Validate that the GitHub identity resolved from the new token matches the target account.
5. On success, update the existing saved account token, set it active, refresh Copilot token and model cache, and return a clear success payload.

### Phase 4: Admin UI Wiring

1. Add row-level reconnect actions.
2. Reuse the current modal with add versus reconnect modes.
3. Make reconnect success update both account list and active auth status.
4. Make reconnect of a non-active account visibly become the new active account.

### Phase 5: Verification

1. Add route-level tests for reconnect lifecycle and startup degradation.
2. Extend admin HTML tests for reconnect controls and differentiated auth copy.
3. Manually verify no-account, stale-active-account, active reconnect, and inactive reconnect flows.

## Relevant Files

- [src/main.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/main.ts)
- [src/routes/admin/route.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/routes/admin/route.ts)
- [src/routes/admin/html.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/routes/admin/html.ts)
- [src/lib/accounts.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/lib/accounts.ts)
- [src/lib/config.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/lib/config.ts)
- [src/lib/copilot-token-manager.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/lib/copilot-token-manager.ts)
- [src/lib/state.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/lib/state.ts)
- [src/lib/utils.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/lib/utils.ts)
- [src/services/github/get-device-code.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/services/github/get-device-code.ts)
- [src/services/github/poll-access-token.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/services/github/poll-access-token.ts)
- [src/services/github/get-user.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/services/github/get-user.ts)
- [src/services/github/get-copilot-token.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/services/github/get-copilot-token.ts)
- [tests/admin-html.test.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/tests/admin-html.test.ts)
- [tests/local-security.test.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/tests/local-security.test.ts)

## Test Plan

### Automated

1. Add a dedicated admin-route test file for reconnect lifecycle coverage.
2. Add startup-focused coverage for degraded auth behavior so stale credentials do not crash initialization.
3. Extend [tests/admin-html.test.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/tests/admin-html.test.ts) to assert reconnect affordances and state-specific copy.

### Manual

1. Start with no saved accounts and confirm the page shows add-account guidance.
2. Start with an invalid active account and confirm the process stays up and `/admin` shows `needs_reconnect`.
3. Reconnect the active stale account and confirm models and usage recover without restart.
4. Reconnect a non-active saved account and confirm it becomes active.

## Risks And Guardrails

- Do not silently switch the identity of a saved account row if reconnect resolves to another GitHub user.
- Do not make inactive-account validity checks network-bound during page load.
- Do not let reconnect success leave stale model cache behind.
- Do not turn this into a broad account-management refactor.

## Handoff Notes For Execution Agent

- Fix the root cause first: recoverable startup and a real auth-state contract.
- Prefer the smallest extension of the current device-code flow over new abstractions.
- Keep backend and UI state transitions explicit and testable.
