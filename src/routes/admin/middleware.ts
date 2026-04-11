import type { Context, Next } from "hono"

import {
  getLocalAccessUsername,
  hasValidLocalAccessAuth,
  isTrustedBrowserRequest,
  requiresLocalAccessAuth,
  isTrustedLocalPeer,
} from "~/lib/local-security"

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

type PeerAddressEnv = {
  remoteAddress?: {
    address?: unknown
  }
}

type PeerAddressRequest = Request & {
  ip?: unknown
  env?: PeerAddressEnv
}

function getRequestPeerAddress(c: Context): string | undefined {
  const request = c.req.raw as PeerAddressRequest
  const env = c.env as PeerAddressEnv | undefined

  return (
    readString(request.ip)
    ?? readString(request.env?.remoteAddress?.address)
    ?? readString(env?.remoteAddress?.address)
  )
}

/**
 * Middleware to restrict access to localhost only.
 * Uses the real peer address exposed by Bun/srvx request context.
 */
export async function localOnlyMiddleware(
  c: Context,
  next: Next,
): Promise<Response | undefined> {
  const peerAddress = getRequestPeerAddress(c)
  const hostHeader = c.req.header("host") ?? new URL(c.req.raw.url).host

  if (!isTrustedLocalPeer(peerAddress, hostHeader)) {
    return c.json(
      {
        error: {
          message: "Forbidden: Admin panel is only accessible from localhost",
          type: "forbidden",
        },
      },
      403,
    )
  }

  if (
    !isTrustedBrowserRequest({
      hostHeader,
      method: c.req.method,
      originHeader: c.req.header("origin"),
      refererHeader: c.req.header("referer"),
      requestUrl: c.req.raw.url,
      secFetchSiteHeader: c.req.header("sec-fetch-site"),
    })
  ) {
    return c.json(
      {
        error: {
          message:
            "Forbidden: Cross-site browser requests are blocked for local admin routes",
          type: "forbidden",
        },
      },
      403,
    )
  }

  if (
    requiresLocalAccessAuth()
    && !hasValidLocalAccessAuth(c.req.header("authorization"))
  ) {
    c.header(
      "WWW-Authenticate",
      `Basic realm="Copilot API Local Management", charset="UTF-8"`,
    )

    return c.json(
      {
        error: {
          message: `Unauthorized: Use Basic auth with username "${getLocalAccessUsername()}"`,
          type: "unauthorized",
        },
      },
      401,
    )
  }

  await next()
  return undefined
}
