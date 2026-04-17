---
title: "fix: Remediate 5 Security Vulnerabilities in copilot-api"
type: fix
status: completed
date: 2026-04-11
origin: docs/reports/2026-04-11-security-audit.md
---

# fix: Remediate 5 Security Vulnerabilities in copilot-api

## Overview

The full-codebase security audit (2026-04-11) identified 5 high-confidence exploitable vulnerabilities in this public repo. This plan defines how to fix all five with minimal surface change, no behaviour regressions on legitimate use cases, and no speculative hardening beyond what is concretely needed.

All fixes are server-side or template-level changes. No external dependencies are added.

Automated verification is complete, and the admin UI smoke has been re-run locally: accounts empty state, models empty state, usage empty state, and model mapping create/delete all work without console errors in the unauthenticated loopback setup.

## Problem Frame

copilot-api is a local proxy that forwards GitHub Copilot API requests from tools like Claude Code. It exposes an admin UI and a `/token` endpoint that carry real credentials. The server was designed to be localhost-only, but the current implementation allows remote attackers to bypass that restriction and steal live Copilot tokens or execute JavaScript in the admin panel. See `docs/reports/2026-04-11-security-audit.md` for full exploit paths and confidence scores.

## Requirements Trace

- R1. Admin endpoints must not be reachable from off-machine clients under any circumstances.
- R2. The `/token` endpoint must not expose the live Copilot token to unauthenticated, non-local callers.
- R3. CORS must not permit arbitrary cross-origin requests against any endpoint.
- R4. User-controlled values rendered in the admin UI must not allow injection of executable HTML or JavaScript.
- R5. All fixes must not break the existing OpenAI/Anthropic API proxy behaviour or the admin UI's legitimate functionality.

## Scope Boundaries

- **In scope:** The 5 confirmed vulnerabilities from the audit report.
- **Out of scope:** Rate limiting, CSRF tokens, audit logging, dependency upgrades, or any hardening not directly tied to a confirmed vulnerability.
- **Out of scope:** Changes to `src/routes/` for the API proxy endpoints (chat-completions, messages, responses, models, embeddings).

## Context & Research

### Relevant Code and Patterns

- `src/main.ts` — srvx `serve()` call; currently no `hostname` field → binds `0.0.0.0`.
- `src/server.ts` — global `cors()` and `logger()` middleware; route registration for `/token` and `/admin`.
- `src/routes/admin/middleware.ts` — IP allowlist check based on `X-Forwarded-For` / `X-Real-IP` headers (spoofable).
- `src/routes/admin/route.ts` — `adminRoutes.use("*", localOnlyMiddleware)` pattern.
- `src/routes/token/route.ts` — bare GET handler returning `state.copilotToken`; no middleware.
- `src/routes/admin/html.ts` — monolithic template-literal HTML string; all DOM mutation is client-side JS using raw string concatenation into `innerHTML` and `onclick` attributes.
- `src/lib/state.ts` — `copilotToken` field is the credential exposed at `/token`.
- `tests/anthropic-request.test.ts` — reference pattern: `bun:test`, `describe`/`test`/`expect`, direct `~/` alias imports. Hono's `app.request()` is the test helper for middleware/route tests.
- Existing `data-tab` attribute + delegated listener pattern in `html.ts` — the correct model to follow for the onclick fix.

### Institutional Learnings

- None in `docs/solutions/` relevant to this fix set.

### External References

- srvx 0.8.x `serve()` API: accepts `hostname` field; Bun adapter populates `request.env` with `{ remoteAddress: { address, port } }`.
- Hono 4.x `cors()`: `origin` accepts `string | string[] | ((origin: string) => string | undefined)`.
- Hono `app.request()` helper enables in-process middleware and route tests without a live socket.

## Key Technical Decisions

- **Bind to 127.0.0.1 by default (Unit 1):** The simplest and most reliable defense. Eliminates the entire network-reachability premise of Vulns 1, 2, and 3 for standard local use. Implement alongside the middleware fix so that if a user deliberately binds to 0.0.0.0, the middleware still defends correctly.
- **Fix middleware to read true peer IP, not headers (Unit 1):** srvx on Bun exposes the real socket address. The header-based check is replaced entirely — no X-Forwarded-For / X-Real-IP trust.
- **Protect /token with localOnlyMiddleware, not deletion (Unit 2):** The endpoint appears used by some consumers based on its presence. Protecting rather than removing avoids breaking changes.
- **CORS restricted to localhost origins (Unit 3):** Narrowest viable config. No env-var configurability added (YAGNI — this is a local tool).
- **Client-side escapeHtml helper + data-* attributes (Units 4 & 5):** No server-side change needed for the XSS; the HTML template is static and the injection is client-side DOM manipulation. Adding `escapeHtml` to the page's script block is the least-invasive fix. `data-*` attributes remove the injection class entirely for onclick handlers.

## Open Questions

### Resolved During Planning

- **Can srvx 0.8.x read the true peer IP?** Yes — `c.env` in Bun+srvx carries `request.env.remoteAddress.address`. Needs verification of exact property path during implementation.
- **Is /token used externally?** Unclear; treat as used. Apply middleware rather than delete.
- **Does binding 127.0.0.1 break Docker deployments?** Docker port mapping (`-p 4141:4141`) forwards to the container's loopback, so 127.0.0.1 binding remains reachable from the host. No breakage.

### Deferred to Implementation

- Exact srvx 0.8.x property path for peer IP (`c.env?.remoteAddress?.address` vs `c.env?.ip`) — verify against srvx source or runtime output before finalising the middleware rewrite.
- Whether the current empty-string fallback in the middleware (`clientIP === ""` treated as localhost) should be preserved or removed — implementation should decide based on whether srvx ever returns an empty address for loopback connections.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Request → srvx/Bun (real peer IP available in c.env)
                │
        ┌───────▼────────┐
        │ Global CORS     │  ← restricted to localhost origins
        └───────┬────────┘
                │
        ┌───────▼────────┐
        │ /admin/*        │
        │ localOnly MW    │  ← reads c.env.remoteAddress, no header trust
        └───────┬────────┘
                │
        ┌───────▼────────┐
        │ /token          │
        │ localOnly MW    │  ← same middleware applied
        └───────┬────────┘
                │
           Admin UI
           ↓
     escapeHtml(value)     ← all user-controlled fields escaped before innerHTML
     data-id="..."         ← onclick replaced with data-* + delegated listener
```

## Implementation Units

- [x] **Unit 1: Fix server binding and rewrite admin localhost middleware**

  **Goal:** Bind the server to 127.0.0.1 by default and replace the spoofable header-based IP check with a check against the real peer IP from srvx/Bun.

  **Requirements:** R1, R5

  **Dependencies:** None

  **Files:**
  - Modify: `src/main.ts`
  - Modify: `src/routes/admin/middleware.ts`
  - Test: `tests/admin-middleware.test.ts` (new)

  **Approach:**
  - In `src/main.ts`, add `hostname: "127.0.0.1"` to the `serve()` options object. Keep everything else unchanged.
  - In `src/routes/admin/middleware.ts`, remove all `X-Forwarded-For` and `X-Real-IP` header reads. Read the peer IP from srvx's request environment (`c.env` or the raw Bun request). Allow only `["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]`. Return 403 for anything else.
  - Determine the exact srvx property path for peer IP before replacing the logic.

  **Patterns to follow:**
  - `src/routes/admin/route.ts` `adminRoutes.use("*", localOnlyMiddleware)` — middleware signature unchanged.
  - Hono middleware signature: `(c: Context, next: Next) => Promise<Response | undefined>`.

  **Test scenarios:**
  - Happy path: request with peer IP `127.0.0.1` passes through to next middleware.
  - Happy path: request with peer IP `::1` passes through.
  - Happy path: request with peer IP `::ffff:127.0.0.1` passes through.
  - Edge case: request with peer IP `10.0.0.5` (LAN address) is rejected with 403.
  - Edge case: request with `X-Forwarded-For: 127.0.0.1` header but non-local peer IP is rejected (header spoofing does not help).
  - Edge case: request with `X-Real-IP: 127.0.0.1` header but non-local peer IP is rejected.

  **Verification:**
  - `bun run typecheck` passes.
  - All new tests in `tests/admin-middleware.test.ts` pass.
  - `curl http://localhost:4141/admin/` succeeds from localhost (or with `bun run dev` + a test request).
  - `curl -H "X-Forwarded-For: 127.0.0.1" http://<non-localhost>/admin/` returns 403 (manual test).

---

- [x] **Unit 2: Protect the /token endpoint with localOnlyMiddleware**

  **Goal:** Ensure the `/token` endpoint is only accessible from localhost, using the same middleware fixed in Unit 1.

  **Requirements:** R2, R5

  **Dependencies:** Unit 1 (middleware must be correct before applying it here)

  **Files:**
  - Modify: `src/routes/token/route.ts`
  - Test: `tests/token-route.test.ts` (new)

  **Approach:**
  - Import `localOnlyMiddleware` from `~/routes/admin/middleware`.
  - Apply it with `tokenRoute.use("*", localOnlyMiddleware)` before the GET handler.
  - No other changes to the route logic.

  **Patterns to follow:**
  - `src/routes/admin/route.ts` line applying `adminRoutes.use("*", localOnlyMiddleware)`.

  **Test scenarios:**
  - Happy path: GET `/token` from localhost peer returns `{ token: "..." }`.
  - Error path: GET `/token` from non-local peer returns 403.

  **Verification:**
  - `bun run typecheck` passes.
  - New tests pass.
  - `curl http://localhost:4141/token` returns the token (when running locally).

---

- [x] **Unit 3: Restrict global CORS to localhost origins**

  **Goal:** Replace the unrestricted `cors()` call with one that allows only localhost origins.

  **Requirements:** R3, R5

  **Dependencies:** None (independent of Units 1 and 2)

  **Files:**
  - Modify: `src/server.ts`

  **Approach:**
  - Replace `server.use(cors())` with a call that passes an explicit origin list: `["http://localhost:4141", "http://127.0.0.1:4141"]`.
  - Keep `allowMethods` and `allowHeaders` reasonable defaults for the existing API surface (GET, POST, PUT, DELETE, OPTIONS).
  - Do not add env-var configurability.

  **Patterns to follow:**
  - Existing `server.use(cors())` line — same import, same placement, just add options.

  **Test scenarios:**
  - Happy path: a request with `Origin: http://localhost:4141` receives the correct `Access-Control-Allow-Origin` header.
  - Error path: a request with `Origin: https://evil.com` does not receive `Access-Control-Allow-Origin: https://evil.com` (the header is absent or differs).

  **Verification:**
  - `bun run typecheck` passes.
  - `curl -H "Origin: https://evil.com" http://localhost:4141/v1/models -v` does not echo the origin back in CORS headers.

---

- [x] **Unit 4: Add escapeHtml helper and apply to all innerHTML assignments in admin UI**

  **Goal:** Prevent XSS via unescaped user-controlled data rendered into DOM with `innerHTML`.

  **Requirements:** R4, R5

  **Dependencies:** None (independent of Units 1–3)

  **Files:**
  - Modify: `src/routes/admin/html.ts`

  **Approach:**
  - Add a small `escHtml(s)` function to the inline `<script>` block inside `adminHtml`. The function should escape `&`, `<`, `>`, `"`, and `'`.
  - Audit every `innerHTML` assignment in `renderAccounts()`, `renderMappings()`, and `renderModels()`. Wrap every interpolated field — `acc.login`, `acc.accountType`, `acc.avatarUrl`, `acc.id`, `from`, `to`, `model.id` — in `escHtml()`.
  - Do not change the surrounding HTML structure, CSS, or any non-interpolated string.
  - The `onerror="this.style.display='none'"` inline handler on the avatar `<img>` is a static literal and does not need escaping.

  **Patterns to follow:**
  - The existing inline `<script>` block in `html.ts` — add the helper at the top of that block.

  **Test scenarios:**
  - Unit test for `escHtml`: `escHtml('<script>')` → `'&lt;script&gt;'`.
  - Unit test: `escHtml("it's")` → `'it&#39;s'`.
  - Unit test: `escHtml('say "hello"')` → `'say &quot;hello&quot;'`.
  - Integration scenario: an account with `login` containing `<img src=x onerror=alert(1)>` renders as literal text in the account list, not as an executable image tag.
  - Integration scenario: a model mapping key containing `</td><script>alert(1)</script>` renders as escaped text in the table cell.

  **Note:** The `escHtml` function lives in the browser's inline script, not in TypeScript — it cannot be imported or unit-tested via `bun:test`. Integration verification is manual or via a browser test.

  **Verification:**
  - `bun run typecheck` passes (no TS changes needed if the fix is inside the template literal string).
  - Manual: create an account or mapping with a `<script>` payload in the name; confirm it renders as plain text in the admin UI.

---

- [x] **Unit 5: Replace onclick string concatenation with data-* attributes and delegated listeners**

  **Goal:** Eliminate the onclick string injection attack surface in `renderAccounts()` and `renderMappings()`.

  **Requirements:** R4, R5

  **Dependencies:** Unit 4 (escHtml helper must exist)

  **Files:**
  - Modify: `src/routes/admin/html.ts`

  **Approach:**
  - In `renderAccounts()`:
    - Replace `onclick="switchAccount(\\''+acc.id+'\\'"` with `data-action="switch" data-id="${escHtml(acc.id)}"` on the Switch button.
    - Replace `onclick="deleteAccount(\\''+ acc.id +'\\', \\''+ acc.login+'\\'"` with `data-action="delete" data-id="${escHtml(acc.id)}" data-login="${escHtml(acc.login)}"` on the Delete button.
  - In `renderMappings()`:
    - Replace `onclick="deleteMapping(\\''+ from +'\\')"` with `data-action="delete-mapping" data-from="${escHtml(from)}"` on the Delete button.
  - Add (or update) a single delegated event listener on the parent container in the script block that reads `e.target.closest('[data-action]')` and dispatches to the appropriate function based on `data-action` value.
  - Follow the existing `data-tab` delegated listener pattern already in the file.
  - Keep the existing `switchAccount()`, `deleteAccount()`, and `deleteMapping()` functions — only change how they receive their arguments.

  **Patterns to follow:**
  - Existing `data-tab` attribute + delegated listener pattern in `html.ts`.

  **Test scenarios:**
  - Manual: click Switch button for an account — confirm `switchAccount` is called with the correct account ID.
  - Manual: click Delete button for an account — confirm `deleteAccount` is called with the correct ID and login.
  - Manual: click Delete button for a mapping — confirm `deleteMapping` is called with the correct key.
  - Injection scenario: an account ID containing `');alert('xss');//` renders in the admin UI without triggering an alert — the value is read from `dataset`, not from a JS string literal.

  **Verification:**
  - `bun run typecheck` passes.
  - `bun run lint` passes.
  - Manual test in browser: all account and mapping actions work correctly end-to-end.
  - No `onclick` attributes remain on dynamically generated account list items or mapping rows.

---

## System-Wide Impact

- **Interaction graph:** `localOnlyMiddleware` is shared between `/admin/*` (Unit 1) and `/token` (Unit 2). Both must use the same fixed version. No other routes are affected.
- **Error propagation:** The 403 response from the fixed middleware follows the existing JSON error format. No change to error propagation in the API proxy routes.
- **State lifecycle risks:** None. No state mutations.
- **API surface parity:** OpenAI/Anthropic proxy endpoints (`/v1/chat/completions`, `/v1/messages`, etc.) are not affected by the hostname binding change because Docker port mapping preserves loopback reachability and these endpoints do not enforce IP restrictions.
- **Integration coverage:** The localhost binding + middleware fix work together. If the hostname is changed back to `0.0.0.0` (e.g. for Docker networking), the middleware must still correctly reject non-local peers — Unit 1 tests cover this split.
- **Unchanged invariants:** All OpenAI and Anthropic API proxy routes remain fully accessible from any configured client. The admin UI's functionality (add accounts, switch accounts, manage mappings) is unchanged — only the security wrapper around it changes.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| srvx 0.8.x peer IP property path differs from expected `c.env.remoteAddress.address` | Verify against srvx source before implementing Unit 1. Fall back to binding 127.0.0.1 only if peer IP is not available. |
| Binding 127.0.0.1 breaks Docker workflows where the host accesses the container on a routed IP | Docker `-p` port mapping forwards to container loopback — verify in a container test. Document if a `--hostname` flag override is needed for non-standard Docker setups. |
| escHtml helper missed on some interpolated field | After Unit 4, search `html.ts` for every `+` operator and bare variable inside innerHTML assignments to confirm complete coverage. |
| data-* refactor in Unit 5 breaks existing UI if event delegation is wired incorrectly | Test all three button actions (Switch, Delete account, Delete mapping) manually after implementation. |

## Documentation / Operational Notes

- Add a note to `README.md` (or `CLAUDE.md`) that the server binds to `127.0.0.1` by default and is not intended for network-wide access.
- If a `--hostname` override is ever added for Docker/CI use cases, document that CORS and middleware must be reconfigured for that mode.

## Sources & References

- **Origin document:** [docs/reports/2026-04-11-security-audit.md](docs/reports/2026-04-11-security-audit.md)
- srvx 0.8.x: https://github.com/unjs/srvx
- Hono 4.x cors middleware: https://hono.dev/middleware/builtin/cors
