# Tasks: Fix Security Vulnerabilities

**Plan:** [docs/plans/2026-04-11-001-fix-security-vulnerabilities-plan.md](../plans/2026-04-11-001-fix-security-vulnerabilities-plan.md)
**Date:** 2026-04-11
**Status:** completed

---

Automated implementation, linting, typechecking, and test verification are complete. The admin UI smoke has also been re-run locally in the unauthenticated loopback setup, covering empty states plus model mapping create/delete.

## Task List

### P0 — Network-Level Fixes (Do first, independent of each other except Task 2)

- [x] **Task 1: Fix server binding + rewrite admin middleware**
  - **Priority:** P0
  - **Files:** `src/main.ts`, `src/routes/admin/middleware.ts`, `tests/admin-middleware.test.ts` (new)
  - **Steps:**
    1. Open `src/main.ts`. Add `hostname: "127.0.0.1"` inside the `serve({...})` options object.
    2. Open `src/routes/admin/middleware.ts`. Remove all `X-Forwarded-For` and `X-Real-IP` header reads.
    3. Determine the correct srvx 0.8.x property for the real peer IP on the Bun adapter (`c.env?.remoteAddress?.address` or similar). Log it once at debug level during dev if uncertain.
    4. Replace the IP check: read the peer IP from srvx/Bun's request env; allow only `["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]`; return 403 JSON for anything else.
    5. Create `tests/admin-middleware.test.ts`. Use Hono's `app.request()` with a mock `env` to simulate peer IPs. Cover all scenarios from the plan.
    6. Run `bun run typecheck` and `bun test tests/admin-middleware.test.ts`. All must pass.
  - **Done when:** typecheck passes, all middleware tests pass, no `X-Forwarded-For` or `X-Real-IP` trust remains in middleware.

- [x] **Task 2: Protect /token endpoint** *(depends on Task 1)*
  - **Priority:** P0
  - **Files:** `src/routes/token/route.ts`, `tests/token-route.test.ts` (new)
  - **Steps:**
    1. Open `src/routes/token/route.ts`.
    2. Import `localOnlyMiddleware` from `~/routes/admin/middleware`.
    3. Add `tokenRoute.use("*", localOnlyMiddleware)` before the GET handler.
    4. Create `tests/token-route.test.ts`. Test that a local peer gets the token and a non-local peer gets 403.
    5. Run `bun run typecheck` and `bun test tests/token-route.test.ts`.
  - **Done when:** typecheck passes, tests pass, `/token` returns 403 for non-local peers.

- [x] **Task 3: Restrict global CORS** *(independent)*
  - **Priority:** P0
  - **Files:** `src/server.ts`
  - **Steps:**
    1. Open `src/server.ts`. Find the `server.use(cors())` line.
    2. Replace it with `server.use(cors({ origin: ["http://localhost:4141", "http://127.0.0.1:4141"] }))`.
    3. Run `bun run typecheck`.
    4. Manual check: `curl -v -H "Origin: https://evil.com" http://localhost:4141/v1/models` — confirm the response does NOT include `Access-Control-Allow-Origin: https://evil.com`.
  - **Done when:** typecheck passes, origin `https://evil.com` is not echoed in CORS response headers.

---

### P1 — Admin UI Hardening (After P0, or in parallel with Task 3)

- [x] **Task 4: Add escapeHtml helper and apply to all innerHTML**
  - **Priority:** P1
  - **Files:** `src/routes/admin/html.ts`
  - **Steps:**
    1. Open `src/routes/admin/html.ts`. Find the inline `<script>` block.
    2. Add the following helper near the top of the script block:
       ```
       function escHtml(s) {
         return String(s)
           .replace(/&/g, '&amp;')
           .replace(/</g, '&lt;')
           .replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;')
           .replace(/'/g, '&#39;');
       }
       ```
    3. In `renderAccounts()` (lines ~400–407): wrap `acc.login`, `acc.accountType`, `acc.avatarUrl`, and `acc.id` in `escHtml()` wherever they appear inside the innerHTML string.
    4. In `renderMappings()` (lines ~570–576): wrap `from` and `to` in `escHtml()`.
    5. In `renderModels()` (lines ~442–446): wrap `model.id` in `escHtml()`.
    6. Search the whole `innerHTML` block for any remaining bare variable interpolations (`+ acc.` or `+ from` or `+ to`) — there should be none after step 3–5.
    7. Run `bun run typecheck` (the template literal body is a string; TypeScript may not flag this, but verify no type regressions).
    8. Manual test: add a model mapping with key `<script>alert(1)</script>`. Confirm it renders as literal text in the admin UI.
  - **Done when:** no bare variable interpolations remain in any innerHTML assignment; manual XSS payload renders as escaped text.

- [x] **Task 5: Replace onclick string concat with data-* and delegated listeners**
  - **Priority:** P1
  - **Files:** `src/routes/admin/html.ts`
  - **Steps:**
    1. In `renderAccounts()` Switch button: remove the `onclick` attribute. Add `data-action="switch" data-id="${escHtml(acc.id)}"`.
    2. In `renderAccounts()` Delete button: remove the `onclick` attribute. Add `data-action="delete-account" data-id="${escHtml(acc.id)}" data-login="${escHtml(acc.login)}"`.
    3. In `renderMappings()` Delete button: remove the `onclick` attribute. Add `data-action="delete-mapping" data-from="${escHtml(from)}"`.
    4. In the script block, add a single delegated click listener on `document` (or a suitable parent). Use `e.target.closest('[data-action]')` to route to the existing handler functions, passing values from `dataset` properties.
    5. Follow the existing `data-tab` delegated listener pattern in the same file as the structural model.
    6. Do NOT remove or rename the existing `switchAccount()`, `deleteAccount()`, or `deleteMapping()` functions — only change how they are called.
    7. Run `bun run lint`. Fix any lint errors.
    8. Manual test: click Switch, Delete account, and Delete mapping buttons — confirm correct behaviour end-to-end.
    9. Confirm no `onclick` attributes remain on dynamically generated account or mapping rows (use browser DevTools to inspect rendered HTML).
  - **Done when:** lint passes, all three button actions work, no `onclick` on generated list items.

---

## Completion Checklist

- [x] Task 1 complete — server binds 127.0.0.1, middleware reads real peer IP
- [x] Task 2 complete — /token protected by localOnlyMiddleware
- [x] Task 3 complete — CORS restricted to localhost origins
- [x] Task 4 complete — escHtml applied to all innerHTML interpolations
- [x] Task 5 complete — onclick string concat replaced with data-* + delegation
- [x] `bun run typecheck` passes on the final tree
- [x] `bun run lint` passes on the final tree
- [x] `bun test` passes (no regressions)
- [x] Manual admin UI smoke test: account list, model list, mapping CRUD all work correctly

## Sequencing

```
Task 1 ──► Task 2

Task 3  (independent — can run in parallel with Tasks 1–2)

Task 4 ──► Task 5  (independent of Tasks 1–3, but do Task 4 before Task 5)
```

The P0 tasks should land before the P1 tasks, but Tasks 3–5 can be worked in parallel by different contributors.
