# copilot-api Onboarding Guide

`copilot-api` is a reverse-engineered proxy that exposes the GitHub Copilot
API as an OpenAI-compatible and Anthropic-compatible HTTP service. You run it
locally or in a container, authenticate once with your GitHub account through
the `/admin` web UI, and then point any OpenAI or Anthropic client at
`http://localhost:4141` instead of the real upstream API.

The primary use case is running Claude Code (or any other LLM-aware tool)
backed by a GitHub Copilot subscription rather than a direct Anthropic or
OpenAI account. The proxy handles protocol translation — Anthropic Messages,
OpenAI Chat Completions, and OpenAI Responses API formats all arrive and
leave in their original shape; the proxy converts them to Copilot's internal
format and back before the client sees a response.

---

## Developer Experience

You interact with the proxy the same way you interact with the real APIs, with
two differences: the base URL is `http://localhost:4141` and the API key is
ignored (any non-empty string satisfies client libraries that require one).

**Pointing Claude Code at the proxy** — create `.claude/settings.json` in your
project:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:4141",
    "ANTHROPIC_AUTH_TOKEN": "sk-placeholder"
  },
  "model": "opus"
}
```

**Pointing an OpenAI SDK client at the proxy:**

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4141/v1",
    api_key="placeholder",
)
```

**Pointing Codex CLI at the proxy** — create `~/.codex/config.toml`:

```toml
[provider.copilot]
name     = "copilot-api"
base_url = "http://localhost:4141/v1"
wire_api = "responses"
```

Model aliases (such as `haiku`, `sonnet`, `opus`, or dated Claude model IDs)
can be remapped to actual Copilot model IDs in the `Model Mappings` tab at
`/admin`, so you do not need to change client-side settings each time you
switch models.

---

## How It's Organized

### Architecture

The proxy has a single request path: a client sends an API request, the Hono
server dispatches it to the matching route, the route handler translates the
payload to Copilot format, forwards it upstream, and translates the response
back.

```
   OpenAI / Anthropic / Codex clients
              |
              |  HTTP (port 4141)
              v
     +------------------+
     |   Hono Server    |   src/server.ts
     +--------+---------+
              |
     +--------+---------+
     |   Route handlers  |   src/routes/
     |  messages/        |   Anthropic -> Copilot
     |  chat-completions/|   OpenAI -> Copilot
     |  responses/       |   Responses -> Copilot
     +--------+-----------+
              |
     +--------+---------+
     |  State + Rate     |   src/lib/state.ts
     |  Limit check      |   src/lib/rate-limit.ts
     +--------+----------+
              |
              |  HTTPS
              v
     +------------------+
     | GitHub Copilot   |
     |      API         |
     +------------------+

Management surface (localhost only):
     /admin   ->  account CRUD + settings
     /token   ->  current Copilot JWT
     /usage   ->  quota and plan stats
```

Authentication runs separately through the GitHub OAuth device-code flow,
triggered from the `/admin` UI and storing tokens in a persistent JSON file.

### Directory structure

```
src/
  main.ts          # Startup: env config, auth init, serve
  server.ts        # Hono app + route registration
  lib/
    state.ts       # In-memory runtime state singleton
    config.ts      # config.json read/write
    accounts.ts    # Account CRUD + applyAccountToState
    copilot-token-manager.ts  # Copilot JWT cache/refresh
    rate-limit.ts  # Global request throttle
    local-security.ts         # /admin access control
    error.ts       # HTTPError + forwardError helper
  routes/
    admin/         # /admin UI and REST management API
    messages/      # /v1/messages (Anthropic protocol)
    chat-completions/          # /v1/chat/completions
    responses/     # /v1/responses (Responses API)
    models/        # /v1/models
    embeddings/    # /v1/embeddings
    token/         # /token (raw Copilot JWT)
    usage/         # /usage (Copilot quota data)
  services/
    copilot/       # HTTP calls to Copilot API
    copilot-provider/          # Internal provider adapters
    github/        # GitHub OAuth + user API
tests/
```

### Key modules

| Module | Responsibility |
|--------|---------------|
| `src/routes/messages/` | Anthropic ↔ Copilot translation; streaming SSE |
| `src/routes/chat-completions/` | OpenAI chat ↔ Copilot translation |
| `src/routes/responses/` | OpenAI Responses API ↔ Copilot; tool passthrough |
| `src/routes/admin/` | `/admin` web UI + account/settings REST API |
| `src/lib/state.ts` | Singleton holding live tokens, rate-limit config, model cache |
| `src/lib/config.ts` | Reads and writes `config.json`; caches in memory |
| `src/lib/copilot-token-manager.ts` | Caches and auto-refreshes the short-lived Copilot JWT |
| `src/services/copilot/` | Upstream HTTP calls (chat, messages, responses, models) |
| `src/services/github/` | Device code, token polling, GitHub user API |

### External dependencies

| Service | Purpose | Configured via |
|---------|---------|---------------|
| GitHub OAuth | Account authentication (device-code flow) | Handled by `/admin` |
| GitHub Copilot API | LLM completions, models, embeddings | `state.githubToken` + `state.copilotToken` |

There is no database, cache, or message queue. The only persistent storage is
`/data/copilot-api/config.json`, written to a Docker volume.

---

## Key Concepts and Abstractions

| Concept | What it means in this codebase |
|---------|-------------------------------|
| `Account` | A saved GitHub OAuth credential: `id`, `login`, `token`, `accountType`, `createdAt` |
| `activeAccountId` | The account whose token is currently used for upstream calls |
| `accountType` | `individual`, `business`, or `enterprise` — affects which Copilot endpoints are usable |
| `state` | Module-level singleton (`src/lib/state.ts`) holding the live GitHub token, Copilot token, model cache, and rate-limit config |
| GitHub token | Long-lived OAuth access token (`gho_...`) stored in `config.json` |
| Copilot token | Short-lived JWT obtained from GitHub via the GitHub token; cached and auto-refreshed by `copilotTokenManager` |
| `config.json` | The only disk-persisted state: accounts, active account, model mappings, extra prompts, rate-limit settings |
| Model mapping | Admin-configurable alias table; `getMappedModel()` resolves client-facing names to real Copilot model IDs |
| Extra prompts | Per-model strings appended to system messages (e.g., the exploration-batching prompt for `gpt-5-mini`) |
| Translation layer | The route handlers in `src/routes/messages/` and `src/routes/responses/` that convert between Anthropic/OpenAI and Copilot formats |
| `localOnlyMiddleware` | Middleware that blocks `/admin` and `/token` for non-localhost callers; the `container-bridge` mode adds HTTP Basic auth on top |
| `applyAccountToState` | Helper that writes a new account's token into `state`, clears the Copilot JWT cache, and triggers a fresh token fetch — used by startup, account activation, and reconnect |

---

## Primary Flows

### Flow 1: Initial account setup (one-time)

```
User opens http://localhost:4141/admin
  |
  v
Clicks "Add Account"
  |
  v
POST /admin/api/auth/device-code
  -> GitHub returns user_code + verification_uri
  |
  v
Admin UI shows code, user enters it at GitHub
  |
  v
POST /admin/api/auth/poll  (polled every N seconds)
  -> GitHub returns access token on success
  |
  v
Server stores account in config.json
Sets state.githubToken, fetches Copilot JWT,
caches model list
  |
  v
Admin UI shows account as active
```

### Flow 2: API request (steady state)

```
Client sends POST /v1/messages
  (Anthropic Messages payload)
  |
  v
src/routes/messages/handler.ts
  sanitizeAnthropicPayload()
  getMappedModel() -- resolves alias
  warmup-model check: toolless beta
    requests routed to smallModel
  |
  v
checkRateLimit(state)
  waits or errors based on
  rateLimitSeconds + rateLimitWait
  |
  v
translateAnthropicMessagesToResponsesPayload()
  or translateToOpenAI()
  |
  v
src/services/copilot/create-responses.ts
  (or create-chat-completions.ts)
  attaches Copilot JWT from state.copilotToken
  forwards to GitHub Copilot API
  |
  v
Response arrives (stream or non-stream)
  |
  v
translateResponsesResultToAnthropic()
  (or translateChunkToAnthropicEvents()
   for streaming)
  |
  v
Client receives Anthropic-compatible response
```

The OpenAI Chat Completions path (`/v1/chat/completions`) follows the same
structure through `src/routes/chat-completions/handler.ts`. The Responses API
path (`/v1/responses`) goes through `src/routes/responses/handler.ts` and
additionally normalizes custom tool types (e.g., `apply_patch`) and preserves
known built-in Responses tools (`local_shell`, `web_search`, etc.).

---

## Developer Guide

### Setup

**Prerequisites:** Bun ≥ 1.2.x, a GitHub account with an active Copilot
subscription.

```bash
bun install
```

There is no `.env` file for local development — environment variables are
read at startup from the shell. See the README for the full variable reference.

### Running

```bash
# Development (hot reload)
bun run dev

# Production (direct)
bun run start

# Docker (recommended for real use)
export LOCAL_ACCESS_PASSWORD="$(openssl rand -base64 24)"
docker compose up -d
```

Once running, open `http://localhost:4141/admin` to add a GitHub account.

### Testing and linting

```bash
bun test                        # run all tests
bun test tests/foo.test.ts      # single file
bun test --grep "pattern"       # filtered
bun run lint                    # ESLint
bun run lint --fix              # auto-fix
bun run knip                    # find unused exports
```

### Common change patterns

**Add a new admin API endpoint** — add a route handler in
`src/routes/admin/route.ts` using the `adminRoutes` Hono instance. The
`localOnlyMiddleware` is already applied via `adminRoutes.use("*", ...)` so
new routes inherit the access control automatically.

**Change how Anthropic requests are translated** — the main translation logic
lives in `src/routes/messages/responses-translation.ts` (non-streaming) and
`src/routes/messages/stream-translation.ts` (streaming). The handler in
`src/routes/messages/handler.ts` decides which path to take.

**Add or update a Copilot API call** — add a file under `src/services/copilot/`
following the pattern in `create-chat-completions.ts` or
`create-responses.ts`. These files attach the Copilot JWT from `state` and
use `copilotRequest()` from the provider layer for retries and error handling.

**Change what gets persisted** — update the `AppConfig` interface in
`src/lib/config.ts`, add a default value in `defaultConfig`, and use
`getConfig()` / `saveConfig()` everywhere else. Do not access `config.json`
directly from route handlers.

### Key files to start with

| Area | File | Why start here |
|------|------|---------------|
| Server wiring | `src/server.ts` | All routes in one place |
| Request lifecycle | `src/routes/messages/handler.ts` | Most complex flow; shows all the layers |
| Anthropic translation | `src/routes/messages/responses-translation.ts` | Core format conversion |
| Admin UI + API | `src/routes/admin/route.ts` | Auth flow + account management API |
| Runtime state | `src/lib/state.ts` | Small file; read first to understand the singleton |
| Config schema | `src/lib/config.ts` | Defines `AppConfig`; everything persisted lives here |
| Token lifecycle | `src/lib/copilot-token-manager.ts` | How Copilot JWTs are cached and refreshed |

### Practical tips

- **The messages handler is the most complex route.** It branches on streaming
  vs. non-streaming, Anthropic beta headers (warmup detection), subagent
  markers, model mapping, and two different upstream APIs (Responses and Chat
  Completions). Read the handler top-to-bottom before making changes there.

- **`state` is a module-level singleton, not request-scoped.** Every handler
  reads and writes the same object. Tests that modify `state.githubToken`,
  `state.copilotToken`, or `state.models` must save and restore the original
  values in `afterEach`; otherwise they corrupt later tests in the same run.

- **`config.json` is the only thing that survives a restart.** In-memory
  model cache (`state.models`) and the Copilot JWT are both re-fetched on
  startup from whatever account is in `config.json`. If startup token refresh
  fails, the server stays up but requests will fail until you reconnect via
  `/admin`.

- **The `container-bridge` access mode adds HTTP Basic auth** on top of the
  localhost check for `/admin` and `/token`. When writing tests for admin
  routes, use requests sourced from `127.0.0.1` — `admin-middleware.test.ts`
  shows the pattern.
