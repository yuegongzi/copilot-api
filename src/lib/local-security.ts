import { timingSafeEqual } from "node:crypto"
import { isIP } from "node:net"

const LOCALHOST_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
])

export const LOCAL_ACCESS_MODE = {
  LOOPBACK: "loopback",
  CONTAINER_BRIDGE: "container-bridge",
} as const

const DEFAULT_SERVER_HOST = "127.0.0.1"
const DEFAULT_PORT = 4141
const DEFAULT_LOCAL_ACCESS_USERNAME = "copilot"
const SAFE_HTTP_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
])

export function getServerHost(): string {
  const configuredHost = process.env.HOST?.trim()
  if (configuredHost && configuredHost.length > 0) {
    return configuredHost
  }

  return DEFAULT_SERVER_HOST
}

export function getLocalAccessUsername(): string {
  return DEFAULT_LOCAL_ACCESS_USERNAME
}

export function getLocalAccessPassword(): string | undefined {
  const configuredPassword = process.env.LOCAL_ACCESS_PASSWORD?.trim()
  return configuredPassword && configuredPassword.length > 0 ?
      configuredPassword
    : undefined
}

export function requiresLocalAccessAuth(): boolean {
  return process.env.LOCAL_ACCESS_MODE === LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
}

export function getLocalhostCorsOrigins(
  port = Number.parseInt(process.env.PORT || `${DEFAULT_PORT}`, 10),
): Array<string> {
  const effectivePort = Number.isFinite(port) ? port : DEFAULT_PORT

  return [
    `http://localhost:${effectivePort}`,
    `http://127.0.0.1:${effectivePort}`,
    `http://[::1]:${effectivePort}`,
  ]
}

function normalizeAddress(address: string | undefined): string | undefined {
  if (!address) {
    return undefined
  }

  const normalized = address.trim().toLowerCase()
  return normalized.length > 0 ? normalized : undefined
}

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function parseBasicAuthorizationHeader(
  authorizationHeader: string | undefined,
): { password: string; username: string } | undefined {
  const normalized = readStringValue(authorizationHeader)

  if (!normalized) {
    return undefined
  }

  const separatorIndex = normalized.indexOf(" ")

  if (separatorIndex === -1) {
    return undefined
  }

  const scheme = normalized.slice(0, separatorIndex)
  if (scheme.toLowerCase() !== "basic") {
    return undefined
  }

  try {
    const decoded = Buffer.from(
      normalized.slice(separatorIndex + 1),
      "base64",
    ).toString("utf8")
    const credentialsSeparatorIndex = decoded.indexOf(":")

    if (credentialsSeparatorIndex === -1) {
      return undefined
    }

    return {
      username: decoded.slice(0, credentialsSeparatorIndex),
      password: decoded.slice(credentialsSeparatorIndex + 1),
    }
  } catch {
    return undefined
  }
}

function readStringValue(value: string | undefined): string | undefined {
  const normalized = normalizeAddress(value)
  return normalized ? value?.trim() : undefined
}

function parseUrlOrigin(value: string | undefined): string | undefined {
  const normalized = readStringValue(value)

  if (!normalized) {
    return undefined
  }

  try {
    return new URL(normalized).origin.toLowerCase()
  } catch {
    return undefined
  }
}

function getExpectedRequestOrigin(
  requestUrl: string,
  hostHeader: string | undefined,
): string | undefined {
  const normalizedHost = normalizeAddress(hostHeader)

  if (!normalizedHost || !isLocalHostHeader(normalizedHost)) {
    return undefined
  }

  try {
    return `${new URL(requestUrl).protocol}//${normalizedHost}`
  } catch {
    return undefined
  }
}

function isLoopbackIPv4(address: string): boolean {
  const parts = address.split(".")

  if (parts.length !== 4) {
    return false
  }

  const octets = parts.map(Number)

  if (
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false
  }

  return octets[0] === 127
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".")

  if (parts.length !== 4) {
    return false
  }

  const octets = parts.map(Number)

  if (
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false
  }

  const [first, second] = octets

  return (
    first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254)
    || (first === 100 && second >= 64 && second <= 127)
  )
}

function stripPort(hostHeader: string): string {
  if (hostHeader.startsWith("[")) {
    const closingIndex = hostHeader.indexOf("]")
    if (closingIndex !== -1) {
      return hostHeader.slice(1, closingIndex)
    }
  }

  const colonIndex = hostHeader.indexOf(":")
  return colonIndex === -1 ? hostHeader : hostHeader.slice(0, colonIndex)
}

export function isLocalHostHeader(hostHeader: string | undefined): boolean {
  const normalized = normalizeAddress(hostHeader)

  if (!normalized) {
    return false
  }

  return LOCALHOST_HOSTS.has(stripPort(normalized))
}

export function isSafeHttpMethod(method: string | undefined): boolean {
  const normalizedMethod = readStringValue(method)?.toUpperCase()

  return normalizedMethod ? SAFE_HTTP_METHODS.has(normalizedMethod) : false
}

export function isLoopbackPeerAddress(address: string | undefined): boolean {
  const normalized = normalizeAddress(address)

  if (!normalized) {
    return false
  }

  if (normalized === "::1" || normalized === "localhost") {
    return true
  }

  if (normalized.startsWith("::ffff:")) {
    return isLoopbackIPv4(normalized.slice("::ffff:".length))
  }

  return isLoopbackIPv4(normalized)
}

export function isPrivatePeerAddress(address: string | undefined): boolean {
  const normalized = normalizeAddress(address)

  if (!normalized) {
    return false
  }

  if (normalized.startsWith("::ffff:")) {
    return isPrivateIPv4(normalized.slice("::ffff:".length))
  }

  const ipVersion = isIP(normalized)

  if (ipVersion === 4) {
    return isPrivateIPv4(normalized)
  }

  if (ipVersion === 6) {
    return (
      normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe8")
      || normalized.startsWith("fe9")
      || normalized.startsWith("fea")
      || normalized.startsWith("feb")
    )
  }

  return false
}

export function isTrustedLocalPeer(
  peerAddress: string | undefined,
  hostHeader: string | undefined,
): boolean {
  if (isLoopbackPeerAddress(peerAddress)) {
    return true
  }

  return (
    process.env.LOCAL_ACCESS_MODE === LOCAL_ACCESS_MODE.CONTAINER_BRIDGE
    && isPrivatePeerAddress(peerAddress)
    && isLocalHostHeader(hostHeader)
  )
}

export function hasValidLocalAccessAuth(
  authorizationHeader: string | undefined,
): boolean {
  if (!requiresLocalAccessAuth()) {
    return true
  }

  const expectedPassword = getLocalAccessPassword()

  if (!expectedPassword) {
    return false
  }

  const credentials = parseBasicAuthorizationHeader(authorizationHeader)

  if (!credentials) {
    return false
  }

  return (
    secureCompare(credentials.username, getLocalAccessUsername())
    && secureCompare(credentials.password, expectedPassword)
  )
}

type BrowserRequestTrustInput = {
  hostHeader?: string
  method?: string
  originHeader?: string
  refererHeader?: string
  requestUrl: string
  secFetchSiteHeader?: string
}

export function isTrustedBrowserRequest({
  hostHeader,
  method,
  originHeader,
  refererHeader,
  requestUrl,
  secFetchSiteHeader,
}: BrowserRequestTrustInput): boolean {
  if (isSafeHttpMethod(method)) {
    return true
  }

  const secFetchSite = readStringValue(secFetchSiteHeader)?.toLowerCase()

  if (secFetchSite === "cross-site") {
    return false
  }

  const expectedOrigin = getExpectedRequestOrigin(requestUrl, hostHeader)

  if (!expectedOrigin) {
    return false
  }

  const origin = parseUrlOrigin(originHeader)
  if (origin) {
    return origin === expectedOrigin
  }

  const refererOrigin = parseUrlOrigin(refererHeader)
  if (refererOrigin) {
    return refererOrigin === expectedOrigin
  }

  return (
    secFetchSite === undefined
    || secFetchSite === "same-origin"
    || secFetchSite === "same-site"
    || secFetchSite === "none"
  )
}
