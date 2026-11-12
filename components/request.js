export async function post(path, payload, networkMessage) {
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
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(networkMessage);
  }
  if (!response.ok) throw new Error(data.error || networkMessage);
  return data;
}
