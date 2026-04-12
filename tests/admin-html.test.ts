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
