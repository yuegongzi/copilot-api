import consola from "consola"
import { events } from "fetch-event-stream"

import type {
  AnthropicMessagesPayload,
  AnthropicResponse,
} from "~/routes/messages/anthropic-types"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"
import { fetchCopilotWithRetry } from "~/services/copilot/request"

export type MessagesStream = ReturnType<typeof events>
export type CreateMessagesReturn = AnthropicResponse | MessagesStream

const SUPPORTED_BETA_FEATURES = new Set([
  "advanced-tool-use-2025-11-20",
  "interleaved-thinking-2025-05-14",
])

function filterBetaHeader(header: string): string | undefined {
  const supported = header
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SUPPORTED_BETA_FEATURES.has(s))
  return supported.length > 0 ? supported.join(",") : undefined
}

export const createMessages = async (
  payload: AnthropicMessagesPayload,
  anthropicBetaHeader?: string,
): Promise<CreateMessagesReturn> => {
  const enableVision = payload.messages.some(
    (message) =>
      Array.isArray(message.content)
      && message.content.some((block) => block.type === "image"),
  )

  let isInitiateRequest = false
  const lastMessage = payload.messages.at(-1)
  if (lastMessage?.role === "user") {
    isInitiateRequest =
      Array.isArray(lastMessage.content) ?
        lastMessage.content.some((block) => block.type !== "tool_result")
      : true
  }

  // Remove unsupported fields that Copilot API rejects
  // biome-ignore lint/performance/noDelete: cleaning up unsupported fields
  delete (payload as unknown as Record<string, unknown>).context_management

  const buildHeaders = () => {
    const headers: Record<string, string> = {
      ...copilotHeaders(state, enableVision),
      "X-Initiator": isInitiateRequest ? "user" : "agent",
    }

    const filteredBeta =
      anthropicBetaHeader ? filterBetaHeader(anthropicBetaHeader) : undefined
    if (filteredBeta) {
      headers["anthropic-beta"] = filteredBeta
    } else if (payload.thinking?.budget_tokens) {
      headers["anthropic-beta"] = "interleaved-thinking-2025-05-14"
    }

    return headers
  }

  const response = await fetchCopilotWithRetry({
    url: `${copilotBaseUrl(state)}/v1/messages`,
    init: {
      method: "POST",
      body: JSON.stringify(payload),
    },
    buildHeaders,
  })

  if (!response.ok) {
    consola.error("Failed to create messages", response)
    throw new HTTPError("Failed to create messages", response)
  }

  if (payload.stream) {
    return events(response)
  }

  return (await response.json()) as AnthropicResponse
}
