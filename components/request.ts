export async function post<T>(path: string, payload: unknown, networkMessage: string): Promise<T> {
  let response;
  try {
    response = await fetch(path, {
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
  if (!data || typeof data !== 'object') throw new Error(networkMessage);
  if (!response.ok) {
    const message = 'error' in data && typeof data.error === 'string' ? data.error : networkMessage;
    throw new Error(message);
  }
  return data as T;
}
