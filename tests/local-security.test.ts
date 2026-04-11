import { afterEach, describe, expect, test } from "bun:test"

import {
  getLocalAccessPassword,
  getLocalAccessUsername,
  LOCAL_ACCESS_MODE,
  hasValidLocalAccessAuth,
  getLocalhostCorsOrigins,
  getServerHost,
  isLocalHostHeader,
  isSafeHttpMethod,
  isTrustedBrowserRequest,
  isTrustedLocalPeer,
  requiresLocalAccessAuth,
} from "~/lib/local-security"

const originalHost = process.env.HOST
const originalLocalAccessMode = process.env.LOCAL_ACCESS_MODE
const originalLocalAccessPassword = process.env.LOCAL_ACCESS_PASSWORD
const originalPort = process.env.PORT

afterEach(() => {
  if (originalHost === undefined) {
    delete process.env.HOST
  } else {
    process.env.HOST = originalHost
  }

  if (originalPort === undefined) {
    delete process.env.PORT
  } else {
    process.env.PORT = originalPort
  }

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

describe("local security helpers", () => {
  test("defaults to loopback host for local runs", () => {
    delete process.env.HOST

    expect(getServerHost()).toBe("127.0.0.1")
  })

  test("uses configured HOST when provided", () => {
    process.env.HOST = "0.0.0.0"

    expect(getServerHost()).toBe("0.0.0.0")
  })

  test("derives localhost CORS origins from PORT", () => {
    process.env.PORT = "5252"

    expect(getLocalhostCorsOrigins()).toEqual([
      "http://localhost:5252",
      "http://127.0.0.1:5252",
      "http://[::1]:5252",
    ])
  })

  test("recognizes localhost host headers with ports", () => {
    expect(isLocalHostHeader("localhost:4141")).toBe(true)
    expect(isLocalHostHeader("127.0.0.1:4141")).toBe(true)
    expect(isLocalHostHeader("[::1]:4141")).toBe(true)
    expect(isLocalHostHeader("192.168.1.44:4141")).toBe(false)
  })

  test("rejects container bridge peers by default even with a localhost host header", () => {
    delete process.env.LOCAL_ACCESS_MODE

    expect(isTrustedLocalPeer("172.18.0.1", "localhost:4141")).toBe(false)
  })

  test("allows container bridge peers only when explicitly enabled", () => {
    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE

    expect(isTrustedLocalPeer("172.18.0.1", "localhost:4141")).toBe(true)
  })

  test("requires local access auth only in container bridge mode", () => {
    delete process.env.LOCAL_ACCESS_MODE
    expect(requiresLocalAccessAuth()).toBe(false)

    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    expect(requiresLocalAccessAuth()).toBe(true)
  })

  test("validates basic auth for container bridge mode", () => {
    process.env.LOCAL_ACCESS_MODE = LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    process.env.LOCAL_ACCESS_PASSWORD = "s3cr3t"

    const authHeader = `Basic ${Buffer.from(`${getLocalAccessUsername()}:s3cr3t`).toString("base64")}`
    const lowercaseAuthHeader = `basic ${Buffer.from(`${getLocalAccessUsername()}:s3cr3t`).toString("base64")}`
    const uppercaseAuthHeader = `BASIC ${Buffer.from(`${getLocalAccessUsername()}:s3cr3t`).toString("base64")}`
    const wrongPasswordAuthHeader = `Basic ${Buffer.from(`${getLocalAccessUsername()}:wrong-secret`).toString("base64")}`
    const wrongUsernameAuthHeader = `Basic ${Buffer.from(`someone-else:s3cr3t`).toString("base64")}`

    expect(hasValidLocalAccessAuth(authHeader)).toBe(true)
    expect(hasValidLocalAccessAuth(lowercaseAuthHeader)).toBe(true)
    expect(hasValidLocalAccessAuth(uppercaseAuthHeader)).toBe(true)
    expect(hasValidLocalAccessAuth(undefined)).toBe(false)
    expect(hasValidLocalAccessAuth("Basic bad-value")).toBe(false)
    expect(hasValidLocalAccessAuth(wrongPasswordAuthHeader)).toBe(false)
    expect(hasValidLocalAccessAuth(wrongUsernameAuthHeader)).toBe(false)
  })

  test("returns configured local access password when present", () => {
    process.env.LOCAL_ACCESS_PASSWORD = "s3cr3t"

    expect(getLocalAccessPassword()).toBe("s3cr3t")
  })

  test("treats GET, HEAD, and OPTIONS as safe methods", () => {
    expect(isSafeHttpMethod("GET")).toBe(true)
    expect(isSafeHttpMethod("head")).toBe(true)
    expect(isSafeHttpMethod("OPTIONS")).toBe(true)
    expect(isSafeHttpMethod("POST")).toBe(false)
  })

  test("allows unsafe requests from the same local browser origin", () => {
    expect(
      isTrustedBrowserRequest({
        hostHeader: "localhost:4141",
        method: "POST",
        originHeader: "http://localhost:4141",
        requestUrl: "http://localhost/admin/api/auth/device-code",
        secFetchSiteHeader: "same-origin",
      }),
    ).toBe(true)
  })

  test("rejects unsafe cross-site browser requests", () => {
    expect(
      isTrustedBrowserRequest({
        hostHeader: "localhost:4141",
        method: "POST",
        originHeader: "https://evil.example",
        requestUrl: "http://localhost/admin/api/auth/device-code",
        secFetchSiteHeader: "cross-site",
      }),
    ).toBe(false)
  })

  test("allows unsafe local requests without browser metadata for CLI clients", () => {
    expect(
      isTrustedBrowserRequest({
        hostHeader: "localhost:4141",
        method: "POST",
        requestUrl: "http://localhost/admin/api/auth/device-code",
      }),
    ).toBe(true)
  })
})
