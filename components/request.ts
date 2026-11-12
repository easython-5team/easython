import type { Action, ActionResult } from "../lib/api.ts";

/** Calls an API action; the response type follows the server's action map. */
export async function post<A extends Action>(
  action: A, payload: Record<string, unknown>, networkMessage: string,
): Promise<ActionResult<A>> {
  let response: Response;
  try {
    response = await fetch("/api/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(networkMessage);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(networkMessage);
  }
  if (!response.ok) {
    const error = (data as { error?: unknown } | null)?.error;
    throw new Error(typeof error === "string" ? error : networkMessage);
  }
  return data as ActionResult<A>;
}
