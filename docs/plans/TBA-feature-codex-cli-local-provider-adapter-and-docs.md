# Codex CLI Local Provider Adapter And Docs

## Objective

Make `copilot-api` suitable for stable local `Codex CLI` usage through a custom OpenAI-compatible Responses provider on localhost, then document the setup clearly in both English and Chinese.

## Problem Summary

The repo is already close to working for `Codex CLI` local-provider use, but it should not yet be described as fully compatible. The most important gap is in the public Responses handler: it normalizes a small set of custom editing tools into `function` tools, then drops every other non-`function` tool. That prevents built-in Responses tools such as `local_shell`, `web_search`, and `file_search` from reaching upstream through `/v1/responses`.

## Locked Decisions

- The target is local custom-provider support on localhost, not remote deployment hardening.
- The change should be minimal feature work plus documentation, not docs-only.
- The docs must be updated in both [README.md](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/README.md) and [README.zh-CN.md](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/README.zh-CN.md).
- The docs must include a ready-to-use `.codex/config.toml` example.
- The implementation should preserve existing custom-to-function normalization for `apply_patch` and common file-editing tool names.

## Success Criteria

- `/v1/responses` preserves the built-in Responses tool types already understood elsewhere in the repository.
- The repo has a concrete `Codex CLI` setup guide for localhost custom-provider usage.
- The docs tell an honest story about scope and remaining limitations.
- The new behavior is covered by focused regression tests.

## Scope

### In Scope

- Route-level built-in Responses tool passthrough for known tool types.
- Regression tests for tool filtering behavior.
- Bilingual `Codex CLI` setup documentation.
- A concrete `.codex/config.toml` example for local usage.

### Out Of Scope

- Remote deployment security or multi-user API auth for `/v1/*`.
- Full emulation of proprietary `Codex` tool contracts beyond known Responses tool shapes.
- A broad redesign of OpenAI-compatible routing.

## Compatibility Assessment

### What Already Works

- The server already exposes `/v1/responses`, `/v1/models`, and other OpenAI-compatible routes in [src/server.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/server.ts).
- Server-owned GitHub and Copilot auth is already handled through `/admin`.
- Streaming Responses handling already contains compatibility fixes for client expectations.
- Internal provider code already understands built-in Responses tool types including `web_search`, `web_search_preview`, `file_search`, `code_interpreter`, `image_generation`, and `local_shell`.

### The Main Gap

- [src/routes/responses/handler.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/routes/responses/handler.ts) currently filters request tools down to `tool.type === "function"` after custom-tool normalization.
- That behavior conflicts with the repo’s own built-in-tool support claims and blocks the most relevant `Codex CLI` built-in tool path.

## Requirements

### R1. Preserve Known Built-In Responses Tools

The public Responses route must preserve at least these known tool types when they appear in incoming OpenAI-compatible requests:

1. `web_search`
2. `web_search_preview`
3. `file_search`
4. `code_interpreter`
5. `image_generation`
6. `local_shell`

### R2. Keep Existing Custom Tool Normalization

- Preserve current normalization for `apply_patch`.
- Preserve current normalization for common file-editing custom tool names such as `write`, `write_file`, `edit`, and `multi_edit`.

### R3. Document Local Usage Honestly

- Explain that GitHub/Copilot authentication is configured through `/admin`, not per-client API keys.
- Explain that the intended deployment assumption is localhost or equivalent trusted local usage.
- Document that some proprietary or client-specific tool contracts may still be unsupported.

### R4. Provide A Working Config Example

- Add a `.codex/config.toml` example to both READMEs.
- Use the local base URL rooted at `http://localhost:4141/v1`.
- Document `wire_api = "responses"`.
- Explain how to use `Model Mappings` in `/admin` if model aliases are needed.

## Implementation Plan

### Phase 1: Route-Level Compatibility Fix

1. Update [src/routes/responses/handler.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/routes/responses/handler.ts) so known built-in Responses tools survive request normalization.
2. Reuse the repository’s existing built-in Responses tool vocabulary rather than inventing new semantics.
3. Keep unsupported tool types intentionally filtered or rejected instead of silently broadening support beyond known shapes.

### Phase 2: Regression Coverage

1. Add focused tests around the Responses handler’s tool normalization and filtering behavior.
2. Cover at least one built-in tool that previously would have been dropped.
3. Confirm existing responses-only routing expectations remain intact.

### Phase 3: Documentation

1. Add a `Codex CLI` section to [README.md](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/README.md).
2. Add the equivalent section to [README.zh-CN.md](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/README.zh-CN.md).
3. Include a directly usable `.codex/config.toml` example.
4. Document scope limitations and local-only trust assumptions.

## Relevant Files

- [src/routes/responses/handler.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/routes/responses/handler.ts)
- [src/services/copilot/create-responses.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/services/copilot/create-responses.ts)
- [src/server.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/server.ts)
- [src/lib/local-security.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/lib/local-security.ts)
- [src/services/copilot-provider/responses/openai-responses-api-types.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/services/copilot-provider/responses/openai-responses-api-types.ts)
- [src/services/copilot-provider/responses/openai-responses-prepare-tools.ts](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/src/services/copilot-provider/responses/openai-responses-prepare-tools.ts)
- [README.md](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/README.md)
- [README.zh-CN.md](/Users/gabrielfeng/Repos/NRI/repos-vibe/copilot-api/README.zh-CN.md)

## Documentation Requirements

The docs should cover these points explicitly:

1. Start `copilot-api` locally.
2. Authenticate once through `/admin`.
3. Point `Codex CLI` at the local custom provider.
4. Use `wire_api = "responses"`.
5. Select a model that supports `/v1/responses`.
6. Use `Model Mappings` in `/admin` if client-facing aliases need remapping.
7. Treat the setup as local-provider support, not a remote hosted multi-user service.

## Verification

### Automated

1. Add route-level tests proving built-in Responses tools survive filtering.
2. Ensure existing chat-completions protections still direct responses-only models toward `/v1/responses`.

### Manual

1. Smoke `GET /v1/models`.
2. Smoke non-streaming `POST /v1/responses`.
3. Smoke streaming `POST /v1/responses`.
4. Run a local `Codex CLI` prompt-only request against the documented provider config.
5. Run a local `Codex CLI` task that exercises at least one built-in Responses tool path expected by the CLI.

## Risks And Guardrails

- Do not claim blanket `Codex CLI` compatibility if verification only covers the local custom-provider path.
- Do not widen support to arbitrary unknown tool types without evidence that upstream and this proxy both understand them.
- Do not imply inbound API-key auth for `/v1/*` if the server still relies on local deployment trust boundaries.
- Treat `service_tier` as a documented limitation unless verification proves it must be implemented now.

## Handoff Notes For Execution Agent

- Keep the code change surgical: the main fix belongs at the public Responses route boundary.
- Use the repo’s existing built-in-tool vocabulary and internal provider code as the source of truth.
- Keep the docs operational, not aspirational: include a real config snippet and real scope caveats.
