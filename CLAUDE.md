# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**copilot-api** is a reverse-engineered proxy for GitHub Copilot API that exposes it as OpenAI and Anthropic compatible services. Built with Bun, Hono, and TypeScript.

## Common Commands

```bash
# Development
bun run dev              # Start dev server with hot reload
bun run typecheck        # Type checking only (no emit)

# Building
bun run build            # Production build (uses tsdown)
bun run start            # Start production server

# Linting
bun run lint             # Lint files (with cache)
bun run lint --fix       # Lint and auto-fix

# Testing
bun test                              # Run all tests
bun test tests/anthropic-request.test.ts  # Run single test file
bun test --grep "pattern"             # Run tests matching pattern

# Code quality
bun run knip             # Find unused exports/dependencies
```

## Architecture

```
src/
├── main.ts              # CLI entry point, server initialization
├── server.ts            # Hono server setup, route registration
├── lib/                 # Shared utilities
│   ├── error.ts         # HTTPError class and forwardError() helper
│   ├── config.ts        # App config (accounts, extraPrompts, modelReasoningEfforts)
│   ├── state.ts         # Runtime state (tokens, rate limiting)
│   ├── accounts.ts      # GitHub account management
│   ├── copilot-token-manager.ts  # Copilot token refresh
│   └── rate-limit.ts    # Rate limiting logic
├── routes/              # API route handlers
│   ├── messages/        # Anthropic API (/v1/messages) - translation logic
│   ├── chat-completions/# OpenAI API (/v1/chat/completions)
│   ├── responses/       # OpenAI Responses API (/v1/responses)
│   ├── models/          # Model listing (/v1/models)
│   ├── embeddings/      # Embeddings API (/v1/embeddings)
│   ├── admin/           # Web UI for account management (/admin)
│   └── usage/           # Usage statistics (/usage)
└── services/            # External API integrations
    ├── copilot/         # GitHub Copilot API calls
    └── github/          # GitHub OAuth and user API
```

### Request Flow

1. Client sends OpenAI/Anthropic format request
2. Route handler translates to Copilot format (`routes/messages/handler.ts`)
3. Request forwarded via `services/copilot/`
4. Response translated back to original format
5. Streaming handled via SSE translation

## Code Style

### Imports
- Use `~/` path alias for `src/*` imports (e.g., `import { getConfig } from "~/lib/config"`)
- Group: external deps → internal (`~/...`) → relative

### Types
- Strict TypeScript - never use `any`
- Use `type` imports: `import type { Context } from "hono"`
- Use `interface` for object shapes, `type` for unions

### Error Handling
```typescript
import { HTTPError, forwardError } from "~/lib/error"

// Throwing HTTP errors
if (!response.ok) {
  throw new HTTPError("Request failed", response)
}

// Handling errors in routes
try {
  // ...
} catch (error) {
  return forwardError(c, error)
}
```

### Naming
- Files: `kebab-case.ts`
- Variables/Functions: `camelCase`
- Types/Interfaces/Classes: `PascalCase`
- Constants: `SCREAMING_CASE`

## Key Patterns

### Configuration
Config stored at `/data/copilot-api/config.json`. Use `getConfig()` and `saveConfig()` from `~/lib/config`.

### State Management
Runtime state in `~/lib/state` - holds tokens, rate limit settings, verbose mode.

### Route Structure
Each route folder contains:
- `route.ts` - Hono route definition
- `handler.ts` - Request handling logic
- Translation files for format conversion (in messages/)

## Testing
- Tests in `tests/` directory as `*.test.ts`
- Use `describe`/`test`/`expect` from `bun:test`

## Agent Instructions

- Prohibited from directly asking questions to users, MUST use AskUserQuestion tool.
- Once you can confirm that the task is complete, MUST use AskUserQuestion tool to make user confirm.
