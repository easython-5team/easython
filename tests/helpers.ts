import assert from "node:assert/strict";
import { POST } from "../app/api/[action]/route.ts";
import type { Action, ActionResult } from "../lib/api.ts";

let address = 0;

export type Call = <A extends Action>(action: A, body: Record<string, unknown>, status?: number) => Promise<ActionResult<A>>;

// Calls the real route handler. Each test client gets its own address so the
// per-client rate limit does not leak between tests.
export function client(): Call {
  const ip = "10.0.0." + ++address;
  return async function call(action, body, status = 200) {
    const request = new Request("http://localhost/api/" + action, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });
    const response = await POST(request, { params: Promise.resolve({ action }) });
    const result: unknown = await response.json();
    assert.equal(response.status, status, action + " " + JSON.stringify(result));
    return result as never;
  };
}

/** Asserts a value exists and narrows its type. */
export function must<T>(value: T | null | undefined, message = "expected a value"): T {
  assert.ok(value !== null && value !== undefined, message);
  return value;
}
