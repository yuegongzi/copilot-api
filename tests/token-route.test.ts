import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { getLocalAccessUsername, LOCAL_ACCESS_MODE } from "~/lib/local-security"
import { state } from "~/lib/state"
import { server } from "~/server"

const originalToken = state.copilotToken
const originalLocalAccessMode = process.env.LOCAL_ACCESS_MODE
const originalLocalAccessPassword = process.env.LOCAL_ACCESS_PASSWORD

beforeEach(() => {
  state.copilotToken = "copilot-token-test-value"
})

afterEach(() => {
  state.copilotToken = originalToken
  if (originalLocalAccessMode === undefined) {
    delete process.env.LOCAL_ACCESS_MODE
  } else {
    process.env.LOCAL_ACCESS_MODE = originalLocalAccessMode
  }

  if (originalLocalAccessPassword === undefined) {
    delete process.env.LOCAL_ACCESS_PASSWORD
  } else {
    process.env.LOCAL_ACCESS_PASSWORD = originalLocalAccessPassword
  }
})

function createTokenRequest(
  peerAddress: string,
  hostHeader = "localhost:4141",
  authHeader?: string,
): Request {
  const request = new Request("http://localhost/token", {
    method: "GET",
    headers: {
      host: hostHeader,
      ...(authHeader ? { authorization: authHeader } : {}),
    },
  })

  Object.defineProperty(request, "ip", {
    configurable: true,
    value: peerAddress,
  })

  return request
}

describe("/token route", () => {
  test("returns the token for a local peer through the mounted server", async () => {
    const response = await server.fetch(createTokenRequest("127.0.0.1"))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      token: "copilot-token-test-value",
    })
  })

  test("allows docker-localhost requests when container bridge mode is enabled", async () => {
    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    process.env.LOCAL_ACCESS_PASSWORD = "bridge-secret"

    const response = await server.fetch(
      createTokenRequest(
        "172.18.0.1",
        "localhost:4141",
        `Basic ${Buffer.from(`${getLocalAccessUsername()}:bridge-secret`).toString("base64")}`,
      ),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      token: "copilot-token-test-value",
    })
  })

  test("rejects a container bridge peer unless the relaxed mode is explicitly enabled", async () => {
    delete process.env.LOCAL_ACCESS_MODE

    const response = await server.fetch(createTokenRequest("172.18.0.1"))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: {
        message: "Forbidden: Admin panel is only accessible from localhost",
        type: "forbidden",
      },
    })
  })

  test("rejects a container bridge peer without valid basic auth", async () => {
    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    process.env.LOCAL_ACCESS_PASSWORD = "bridge-secret"

    const response = await server.fetch(createTokenRequest("172.18.0.1"))

    expect(response.status).toBe(401)
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic")
  })

  test("rejects a container bridge peer with wrong basic auth credentials", async () => {
    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    process.env.LOCAL_ACCESS_PASSWORD = "bridge-secret"

    const response = await server.fetch(
      createTokenRequest(
        "172.18.0.1",
        "localhost:4141",
        `Basic ${Buffer.from(`${getLocalAccessUsername()}:wrong-secret`).toString("base64")}`,
      ),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic")
  })

  test("rejects a non-local peer", async () => {
    const response = await server.fetch(
      createTokenRequest("10.0.0.5", "192.168.1.44:4141"),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: {
        message: "Forbidden: Admin panel is only accessible from localhost",
        type: "forbidden",
      },
    })
  })
})
