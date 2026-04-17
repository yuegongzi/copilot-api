import { describe, expect, test } from "bun:test"

import { adminHtml } from "~/routes/admin/html"

describe("adminHtml hardening", () => {
  test("escapes user-controlled fields before innerHTML insertion", () => {
    expect(adminHtml).toContain("function escHtml(s)")
    expect(adminHtml).toContain("escHtml(acc.avatarUrl || '')")
    expect(adminHtml).toContain("escHtml(acc.login)")
    expect(adminHtml).toContain("escHtml(acc.accountType)")
    expect(adminHtml).toContain("escHtml(model.id)")
    expect(adminHtml).toContain("escHtml(model.object || 'model')")
    expect(adminHtml).toContain("escHtml(from)")
    expect(adminHtml).toContain("escHtml(to)")
    expect(adminHtml).toContain("escHtml(m.id)")
  })

  test("uses delegated data-action handlers instead of onclick strings", () => {
    expect(adminHtml).toContain("document.addEventListener('click'")
    expect(adminHtml).toContain("closest('[data-action]')")
    expect(adminHtml).toContain('data-action="switch"')
    expect(adminHtml).toContain('data-action="reconnect"')
    expect(adminHtml).toContain('data-action="delete-account"')
    expect(adminHtml).toContain('data-action="delete-mapping"')
    expect(adminHtml).not.toContain('onclick="switchAccount')
    expect(adminHtml).not.toContain('onclick="deleteAccount')
    expect(adminHtml).not.toContain('onclick="deleteMapping')
  })

  test("avoids unauthenticated resource fetch noise and keeps manual mapping entry available", () => {
    expect(adminHtml).toContain('rel="icon"')
    expect(adminHtml).toContain("let authStatus =")
    expect(adminHtml).toContain("const status = await fetchStatus();")
    expect(adminHtml).toContain("Add a GitHub account to load models.")
    expect(adminHtml).toContain("Add a GitHub account to load usage data.")
    expect(adminHtml).toContain(
      'id="mappingTo" list="mappingToOptions" placeholder="Target model"',
    )
    expect(adminHtml).toContain('<datalist id="mappingToOptions"></datalist>')
    expect(adminHtml).toContain(
      "Target model (add account to load suggestions)",
    )
  })
})

describe("adminHtml reconnect UI affordances", () => {
  test("contains reconnect info section in the auth modal", () => {
    expect(adminHtml).toContain('id="reconnectInfo"')
    expect(adminHtml).toContain('id="reconnectLogin"')
  })

  test("contains modal title element for mode switching", () => {
    expect(adminHtml).toContain('id="authModalTitle"')
  })

  test("contains success text element for mode-specific messaging", () => {
    expect(adminHtml).toContain('id="authSuccessText"')
  })

  test("uses needs_reconnect auth state value in status bar logic", () => {
    expect(adminHtml).toContain("'needs_reconnect'")
  })

  test("uses no_account auth state value distinct from needs_reconnect", () => {
    expect(adminHtml).toContain("'no_account'")
  })

  test("renders distinct status bar messages for no_account and needs_reconnect states", () => {
    expect(adminHtml).toContain("No account configured")
    expect(adminHtml).toContain("needs reconnection")
  })
})
