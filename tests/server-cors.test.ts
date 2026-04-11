import { describe, expect, test } from "bun:test"

import { server } from "~/server"

describe("server CORS policy", () => {
  test("allows localhost origin", async () => {
    const response = await server.request("http://localhost/", {
      headers: {
        Origin: "http://localhost:4141",
      },
    })

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:4141",
    )
  })

  test("allows IPv6 localhost origin", async () => {
    const response = await server.request("http://localhost/", {
      headers: {
        Origin: "http://[::1]:4141",
      },
    })

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://[::1]:4141",
    )
  })

  test("does not echo arbitrary origins", async () => {
    const response = await server.request("http://localhost/", {
      headers: {
        Origin: "https://evil.com",
      },
    })

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })
})
