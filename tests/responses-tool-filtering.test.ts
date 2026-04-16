import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

import type { Model, ModelsResponse } from "~/services/copilot/get-models"

import { copilotTokenManager } from "~/lib/copilot-token-manager"
import { state } from "~/lib/state"
import { server } from "~/server"

const originalFetch = globalThis.fetch
const originalModels = state.models
const originalToken = state.copilotToken
const originalVSCodeVersion = state.vsCodeVersion
const originalAccountType = state.accountType
const originalRateLimitSeconds = state.rateLimitSeconds
const originalRateLimitWait = state.rateLimitWait
const originalLastRequestTimestamp = state.lastRequestTimestamp
const tokenManager = copilotTokenManager as unknown as {
  tokenExpiresAt: number
}
const originalTokenExpiresAt = tokenManager.tokenExpiresAt

const buildModel = (id: string, supportedEndpoints?: Array<string>): Model => ({
  id,
  name: id,
  object: "model",
  vendor: "OpenAI",
  version: id,
  preview: false,
  model_picker_enabled: true,
  supported_endpoints: supportedEndpoints,
  capabilities: {
    family: id,
    limits: {},
    object: "model_capabilities",
    supports: {
      streaming: true,
      tool_calls: true,
    },
    tokenizer: "o200k_base",
    type: "chat",
  },
})

const createResponsesRequest = (
  tools: Array<Record<string, unknown>>,
  model = "gpt-4.1",
): Request =>
  new Request("http://localhost/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      input: "hello",
      stream: false,
      tools,
    }),
  })

/**
 * A minimal non-streaming upstream Responses result used by the fetch mock.
 */
const upstreamResult = {
  id: "resp_test",
  object: "response",
  created_at: 0,
  model: "gpt-4.1",
  output: [],
  output_text: "",
  status: "completed",
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  error: null,
  incomplete_details: null,
  instructions: null,
  metadata: null,
  parallel_tool_calls: false,
  temperature: null,
  tool_choice: null,
  tools: [],
  top_p: null,
}

beforeEach(() => {
  state.models = {
    object: "list",
    data: [buildModel("gpt-4.1", ["/responses"])],
  } as ModelsResponse
  state.copilotToken = "copilot-token-test"
  state.vsCodeVersion = "1.0.0"
  state.accountType = "individual"
  state.rateLimitSeconds = undefined
  state.rateLimitWait = false
  state.lastRequestTimestamp = undefined
  tokenManager.tokenExpiresAt = Math.floor(Date.now() / 1000) + 3600
})

afterEach(() => {
  state.models = originalModels
  state.copilotToken = originalToken
  state.vsCodeVersion = originalVSCodeVersion
  state.accountType = originalAccountType
  state.rateLimitSeconds = originalRateLimitSeconds
  state.rateLimitWait = originalRateLimitWait
  state.lastRequestTimestamp = originalLastRequestTimestamp
  tokenManager.tokenExpiresAt = originalTokenExpiresAt
  globalThis.fetch = originalFetch
})

/**
 * Helper: capture the body sent to the upstream fetch mock.
 * Returns the parsed JSON body of the first fetch call.
 */
const captureFetchBody = (): {
  fetchMock: ReturnType<typeof mock>
  getBody: () => Record<string, unknown>
} => {
  const fetchMock = mock(() =>
    Promise.resolve(Response.json(upstreamResult, { status: 200 })),
  )
  globalThis.fetch = fetchMock as unknown as typeof fetch

  return {
    fetchMock,
    getBody: () => {
      const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      return JSON.parse(call[1].body as string) as Record<string, unknown>
    },
  }
}

describe("Responses handler tool filtering", () => {
  test("preserves function tools", async () => {
    const { fetchMock, getBody } = captureFetchBody()

    const tools = [
      {
        type: "function",
        name: "my_func",
        description: "A function tool",
        parameters: { type: "object", properties: {} },
        strict: false,
      },
    ]

    const response = await server.fetch(createResponsesRequest(tools))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const body = getBody()
    const sentTools = body.tools as Array<Record<string, unknown>>
    expect(sentTools).toHaveLength(1)
    expect(sentTools[0].type).toBe("function")
    expect(sentTools[0].name).toBe("my_func")
  })

  test("preserves built-in Responses tool: local_shell", async () => {
    const { fetchMock, getBody } = captureFetchBody()

    const tools = [
      { type: "local_shell" },
      {
        type: "function",
        name: "apply_patch",
        description: "Apply a patch",
        parameters: { type: "object", properties: {} },
        strict: false,
      },
    ]

    const response = await server.fetch(createResponsesRequest(tools))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const body = getBody()
    const sentTools = body.tools as Array<Record<string, unknown>>
    expect(sentTools).toHaveLength(2)

    const types = sentTools.map((t) => t.type)
    expect(types).toContain("local_shell")
    expect(types).toContain("function")
  })

  test("preserves all known built-in Responses tool types", async () => {
    const { fetchMock, getBody } = captureFetchBody()

    const tools = [
      { type: "web_search", search_context_size: "medium" },
      { type: "web_search_preview", search_context_size: "medium" },
      { type: "file_search", vector_store_ids: ["vs_1"], max_num_results: 5 },
      { type: "code_interpreter", container: { type: "auto" } },
      { type: "image_generation", quality: "auto" },
      { type: "local_shell" },
    ]

    const response = await server.fetch(createResponsesRequest(tools))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const body = getBody()
    const sentTools = body.tools as Array<Record<string, unknown>>
    expect(sentTools).toHaveLength(6)

    const types = sentTools.map((t) => t.type)
    expect(types).toEqual([
      "web_search",
      "web_search_preview",
      "file_search",
      "code_interpreter",
      "image_generation",
      "local_shell",
    ])
  })

  test("filters out unknown/unsupported tool types", async () => {
    const { fetchMock, getBody } = captureFetchBody()

    const tools = [
      { type: "function", name: "f1", description: "ok", parameters: {}, strict: false },
      { type: "computer_use", display_width: 1024, display_height: 768 },
      { type: "completely_unknown" },
    ]

    const response = await server.fetch(createResponsesRequest(tools))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const body = getBody()
    const sentTools = body.tools as Array<Record<string, unknown>>
    expect(sentTools).toHaveLength(1)
    expect(sentTools[0].type).toBe("function")
  })

  test("normalizes custom apply_patch to function tool", async () => {
    const { fetchMock, getBody } = captureFetchBody()

    const tools = [
      {
        type: "custom",
        name: "apply_patch",
        description: "Apply a patch to a file",
      },
    ]

    const response = await server.fetch(createResponsesRequest(tools))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const body = getBody()
    const sentTools = body.tools as Array<Record<string, unknown>>
    expect(sentTools).toHaveLength(1)
    expect(sentTools[0].type).toBe("function")
    expect(sentTools[0].name).toBe("apply_patch")
  })

  test("normalizes custom file editing tools to function tools", async () => {
    const { fetchMock, getBody } = captureFetchBody()

    const tools = [
      { type: "custom", name: "write", description: "Write a file" },
      { type: "custom", name: "edit", description: "Edit a file" },
      { type: "custom", name: "multi_edit", description: "Multi edit" },
    ]

    const response = await server.fetch(createResponsesRequest(tools))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const body = getBody()
    const sentTools = body.tools as Array<Record<string, unknown>>
    expect(sentTools).toHaveLength(3)

    for (const tool of sentTools) {
      expect(tool.type).toBe("function")
    }
    expect(sentTools.map((t) => t.name)).toEqual(["write", "edit", "multi_edit"])
  })

  test("mixed tools: built-in survive, custom normalized, unknown dropped", async () => {
    const { fetchMock, getBody } = captureFetchBody()

    const tools = [
      { type: "local_shell" },
      { type: "web_search", search_context_size: "medium" },
      { type: "custom", name: "apply_patch", description: "Patch files" },
      { type: "custom", name: "write", description: "Write a file" },
      { type: "function", name: "helper", description: "ok", parameters: {}, strict: false },
      { type: "computer_use", display_width: 1024 },
      { type: "unknown_tool_type" },
    ]

    const response = await server.fetch(createResponsesRequest(tools))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const body = getBody()
    const sentTools = body.tools as Array<Record<string, unknown>>
    // local_shell + web_search + apply_patch(->function) + write(->function) + helper = 5
    expect(sentTools).toHaveLength(5)

    const types = sentTools.map((t) => t.type)
    expect(types).toContain("local_shell")
    expect(types).toContain("web_search")
    // The three function tools: normalized apply_patch, normalized write, original helper
    expect(types.filter((t) => t === "function")).toHaveLength(3)
  })

  test("empty tools array is passed through without error", async () => {
    const { fetchMock, getBody } = captureFetchBody()

    const response = await server.fetch(createResponsesRequest([]))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const body = getBody()
    const sentTools = body.tools as Array<Record<string, unknown>>
    expect(sentTools).toHaveLength(0)
  })
})
