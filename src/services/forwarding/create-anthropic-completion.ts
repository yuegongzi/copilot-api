import consola from "consola"
import { events } from "fetch-event-stream"

import type { ModelOverride } from "~/lib/config"
import type { AnthropicMessagesPayload } from "~/routes/messages/anthropic-types"

import { HTTPError } from "~/lib/error"

export async function createForwardedAnthropicCompletion(
  override: ModelOverride,
  payload: AnthropicMessagesPayload,
) {
  const baseUrl = override.targetUrl.replace(/\/$/, "")
  const url = `${baseUrl}/v1/messages`

  // 处理模型映射
  const finalPayload =
    override.modelMapping ?
      { ...payload, model: override.modelMapping }
    : payload

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  }

  if (override.apiKey) {
    headers["x-api-key"] = override.apiKey
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(finalPayload),
    })

    if (!response.ok) {
      throw new HTTPError("Forward request failed", response)
    }

    // 流式/非流式处理
    if (payload.stream) {
      return events(response)
    }

    return await response.json()
  } catch (error) {
    consola.error(`[Forward Error] Failed to fetch ${url}:`, error)
    throw error
  }
}
