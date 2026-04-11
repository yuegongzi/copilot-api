import { Hono } from "hono"

import { state } from "~/lib/state"
import { localOnlyMiddleware } from "~/routes/admin/middleware"

export const tokenRoute = new Hono()

tokenRoute.use("*", localOnlyMiddleware)

tokenRoute.get("/", (c) => {
  try {
    return c.json({
      token: state.copilotToken,
    })
  } catch (error) {
    console.error("Error fetching token:", error)
    return c.json({ error: "Failed to fetch token", token: null }, 500)
  }
})
