# Admin Reconnect Design And Status UX

## Objective

Define the admin-facing UX contract for reconnecting expired GitHub accounts and for representing authentication state clearly across the existing admin page. This plan is intentionally limited to Reconnect-related page design and auth-status information architecture so a separate execution agent can implement UI changes without reopening product decisions.

## Why This Is Separate

The backend work and the page design work can proceed in parallel, but they should not be mixed into one plan. The design surface here is narrow: status communication, row actions, modal copy, and empty states. It is not a full visual redesign of `/admin`.

## Locked Decisions

- Every saved account row exposes a `Reconnect` entry point.
- Startup must keep the service alive even if the active account is stale; the UI must be able to recover from that state.
- `Reconnect` preserves the saved `accountType`.
- Reconnecting a non-active account automatically makes it the active account on success.
- Inactive accounts do not need proactive remote-validity badges or health probes.
- Scope includes Reconnect UX plus auth-status information restructuring, not a broad admin redesign.

## Success Criteria

- The page distinguishes `no_account`, `connected`, and `needs_reconnect` instead of collapsing everything into generic unauthenticated copy.
- The status bar, account list, modal flow, and empty states tell a consistent story about what is wrong and what action the user can take.
- A user can discover and understand `Reconnect` from any saved account row without reading external docs.
- The UI makes it clear that reconnecting a non-active account will switch the active account after success.
- The design remains compatible with the existing single-file admin page structure.

## Scope

### In Scope

- Status-bar messaging and state model.
- Account-row action layout and labels.
- Shared add-account versus reconnect modal states and copy.
- Models, usage, and model-mapping empty-state messaging tied to auth state.
- DOM hooks and wording constraints needed to keep the page testable.

### Out Of Scope

- Broad typography, color, or layout redesign of the admin page.
- New tabs, dashboards, or navigation changes.
- Per-account remote validity checks for inactive rows.
- Any new auth mechanism beyond reuse of the current device-code flow.

## State Model

The design should treat these as canonical UI states:

1. `no_account`
2. `connected`
3. `needs_reconnect`
4. `reconnect_in_progress`
5. `reconnect_success`
6. `reconnect_error`

The implementation agent should not invent additional user-facing states unless required by backend errors.

## UX Requirements

### Status Bar

- `connected`: show active account identity and an explicitly healthy state.
- `needs_reconnect`: show that the saved active account is no longer usable and that reconnect is required.
- `no_account`: instruct the user to add an account rather than reconnect.
- Do not use the same text for `no_account` and `needs_reconnect`.

### Account List

- Every saved account row gets a `Reconnect` action.
- Active rows keep the `Active` badge.
- Inactive rows do not show proactive “healthy” or “expired” badges.
- Reconnect copy should make the side effect explicit enough that users understand success will switch the active account.
- Existing `Switch` and `Delete` actions remain unless the functionality plan forces a backend restriction.

### Modal

- Reuse the current auth modal instead of adding a second modal.
- Support at least two explicit modes: `Add Account` and `Reconnect Account`.
- `Reconnect` mode should display the target account identity and explain that account type is preserved.
- The progress state should clearly indicate that the user is authorizing through GitHub device flow.
- Success state should explain that the account is reconnected and now active.

### Empty States

- Models empty state should distinguish `Add a GitHub account` from `Reconnect the active GitHub account`.
- Usage empty state should use the same distinction.
- Model mapping placeholders and suggestion copy should align with the active auth state instead of using generic failure text.

## Content Design Requirements

- Avoid vague “Not authenticated” copy when the system actually has a saved but stale account.
- Use `Reconnect` consistently as the primary recovery verb.
- Preserve English product nouns and proper terms such as `Reconnect`, `GitHub`, `Copilot`, `Model Mappings`, and `device code`.
- Prefer action-oriented copy over passive error descriptions.

## DOM And Testability Constraints

- Preserve the current delegated event-handler pattern in the inline script.
- Use stable button labels or `data-action` hooks for reconnect behavior.
- Keep the page compatible with static string assertions in the admin HTML test suite.
- Do not introduce UI state that requires a framework or a client build step.

## Relevant Files

- [src/routes/admin/html.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/routes/admin/html.ts)
- [src/routes/admin/route.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/routes/admin/route.ts)
- [tests/admin-html.test.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/tests/admin-html.test.ts)

## Recommended Execution Order

1. Define the final auth-state vocabulary and status-bar wording.
2. Define account-row action behavior and reconnect wording.
3. Refactor the shared modal copy for add versus reconnect modes.
4. Update empty states and placeholder logic.
5. Extend static HTML tests to lock the contract.

## Verification

1. Static assertions in [tests/admin-html.test.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/tests/admin-html.test.ts) cover reconnect affordances and differentiated auth copy.
2. Manual walkthrough confirms consistent behavior for `no_account`, `connected`, `needs_reconnect`, active-account reconnect, and inactive-account reconnect.
3. No new unsafe `innerHTML` or ad hoc event-binding patterns are introduced.

## Handoff Notes For Execution Agent

- Treat the functionality plan as the source of truth for backend auth-state contract and reconnect route semantics.
- Keep diffs narrow and local to the existing inline admin page architecture.
- Do not expand this into a general admin facelift.
