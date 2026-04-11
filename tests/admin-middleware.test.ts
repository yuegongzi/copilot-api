import { afterEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"

import { getLocalAccessUsername, LOCAL_ACCESS_MODE } from "~/lib/local-security"
import { localOnlyMiddleware } from "~/routes/admin/middleware"

const originalLocalAccessMode = process.env.LOCAL_ACCESS_MODE
const originalLocalAccessPassword = process.env.LOCAL_ACCESS_PASSWORD

function createApp(): Hono {
  const app = new Hono()

  app.use("*", localOnlyMiddleware)
  app.get("/", (c) => c.json({ ok: true }))
  app.post("/", (c) => c.json({ ok: true }))

  return app
}

type RequestOptions = {
  peerAddress?: string
  requestEnvAddress?: string
  appEnvAddress?: string
  headers?: Record<string, string>
  hostHeader?: string
  method?: "GET" | "POST"
}

async function requestWithPeerAddress({
  peerAddress,
  requestEnvAddress,
  appEnvAddress,
  headers = {},
  hostHeader = "localhost:4141",
  method = "GET",
}: RequestOptions) {
  const request = new Request("http://localhost/", {
    method,
    headers: {
      host: hostHeader,
      ...headers,
    },
  })

  if (peerAddress !== undefined) {
    Object.defineProperty(request, "ip", {
      configurable: true,
      value: peerAddress,
    })
  }

  if (requestEnvAddress !== undefined) {
    Object.defineProperty(request, "env", {
      configurable: true,
      value: {
        remoteAddress: {
          address: requestEnvAddress,
        },
      },
    })
  }

  return createApp().fetch(
    request,
    appEnvAddress ?
      {
        remoteAddress: {
          address: appEnvAddress,
        },
      }
    : {},
  )
}

describe("localOnlyMiddleware", () => {
  afterEach(() => {
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

  test("allows 127.0.0.1", async () => {
    const response = await requestWithPeerAddress({ peerAddress: "127.0.0.1" })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  test("allows ::1", async () => {
    const response = await requestWithPeerAddress({ peerAddress: "::1" })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  test("allows ::ffff:127.0.0.1", async () => {
    const response = await requestWithPeerAddress({
      peerAddress: "::ffff:127.0.0.1",
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  test("allows trimmed request.env remoteAddress fallback", async () => {
    const response = await requestWithPeerAddress({
      requestEnvAddress: " 127.0.0.1 ",
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  test("allows c.env remoteAddress fallback", async () => {
    const response = await requestWithPeerAddress({
      appEnvAddress: "::1",
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  test("rejects non-local peer address", async () => {
    const response = await requestWithPeerAddress({ peerAddress: "10.0.0.5" })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: {
        message: "Forbidden: Admin panel is only accessible from localhost",
        type: "forbidden",
      },
    })
  })

  test("rejects spoofed X-Forwarded-For when peer is non-local", async () => {
    const response = await requestWithPeerAddress({
      peerAddress: "10.0.0.5",
      headers: {
        "X-Forwarded-For": "127.0.0.1",
      },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: {
        message: "Forbidden: Admin panel is only accessible from localhost",
        type: "forbidden",
      },
    })
  })

  test("rejects spoofed X-Real-IP when peer is non-local", async () => {
    const response = await requestWithPeerAddress({
      peerAddress: "10.0.0.5",
      headers: {
        "X-Real-IP": "127.0.0.1",
      },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: {
        message: "Forbidden: Admin panel is only accessible from localhost",
        type: "forbidden",
      },
    })
  })

  test("allows container bridge peers when docker localhost mode is enabled", async () => {
    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    process.env.LOCAL_ACCESS_PASSWORD = "bridge-secret"

    const response = await requestWithPeerAddress({
      peerAddress: "172.18.0.1",
      hostHeader: "localhost:4141",
      headers: {
        authorization: `Basic ${Buffer.from(`${getLocalAccessUsername()}:bridge-secret`).toString("base64")}`,
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  test("allows same-origin POST requests from the local admin UI", async () => {
    const response = await requestWithPeerAddress({
      peerAddress: "127.0.0.1",
      method: "POST",
      headers: {
        origin: "http://localhost:4141",
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  test("allows curl-style POST requests without browser metadata", async () => {
    const response = await requestWithPeerAddress({
      peerAddress: "127.0.0.1",
      method: "POST",
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  test("rejects cross-site POST requests even from loopback peers", async () => {
    const response = await requestWithPeerAddress({
      peerAddress: "127.0.0.1",
      method: "POST",
      headers: {
        origin: "https://evil.example",
      },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: {
        message:
          "Forbidden: Cross-site browser requests are blocked for local admin routes",
        type: "forbidden",
      },
    })
  })

  test("rejects cross-site POST requests flagged by fetch metadata", async () => {
    const response = await requestWithPeerAddress({
      peerAddress: "127.0.0.1",
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
      },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: {
        message:
          "Forbidden: Cross-site browser requests are blocked for local admin routes",
        type: "forbidden",
      },
    })
  })

  test("accepts lowercase basic auth scheme in container bridge mode", async () => {
    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    process.env.LOCAL_ACCESS_PASSWORD = "bridge-secret"

    const response = await requestWithPeerAddress({
      peerAddress: "172.18.0.1",
      hostHeader: "localhost:4141",
      headers: {
        authorization: `basic ${Buffer.from(`${getLocalAccessUsername()}:bridge-secret`).toString("base64")}`,
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  test("rejects container bridge peers without basic auth", async () => {
    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    process.env.LOCAL_ACCESS_PASSWORD = "bridge-secret"

    const response = await requestWithPeerAddress({
      peerAddress: "172.18.0.1",
      hostHeader: "localhost:4141",
    })

    expect(response.status).toBe(401)
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic")
  })

  test("rejects container bridge peers with wrong basic auth credentials", async () => {
    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    process.env.LOCAL_ACCESS_PASSWORD = "bridge-secret"

    const response = await requestWithPeerAddress({
      peerAddress: "172.18.0.1",
      hostHeader: "localhost:4141",
      headers: {
        authorization: `Basic ${Buffer.from(`${getLocalAccessUsername()}:wrong-secret`).toString("base64")}`,
      },
    })

    expect(response.status).toBe(401)
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic")
  })

  test("rejects container bridge peers when host header is not local", async () => {
    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    process.env.LOCAL_ACCESS_PASSWORD = "bridge-secret"

    const response = await requestWithPeerAddress({
      peerAddress: "172.18.0.1",
      hostHeader: "192.168.1.44:4141",
      headers: {
        authorization: `Basic ${Buffer.from(`${getLocalAccessUsername()}:bridge-secret`).toString("base64")}`,
      },
    })

    expect(response.status).toBe(403)
  })
})
