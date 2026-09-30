// @ts-check

/** @param {string} path @param {RequestInit} options */
export async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

/** @param {import('../../../shared/contracts').ResearchInput} input
 * @param {AbortSignal} signal
 * @param {(event: import('../../../shared/contracts').ResearchEvent) => void} onEvent
 * @returns {Promise<import('../../../shared/contracts').Workspace>}
 */
export async function research(input, signal, onEvent) {
  const response = await fetch("/api/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "Research could not start.");
  }
  if (!response.body) throw new Error("No response stream available.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  /** @type {import('../../../shared/contracts').Workspace | undefined} */
  let workspace;
  /** @param {string} line */
  const handle = (line) => {
    if (!line.trim()) return;
    /** @type {import('../../../shared/contracts').ResearchEvent} */
    const event = JSON.parse(line);
    if (event.phase === "error") throw new Error(event.error);
    if (event.workspace) workspace = event.workspace;
    onEvent(event);
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(handle);
    if (done) break;
  }
  handle(buffer);
  if (!workspace)
    throw new Error(
      "The connection ended before research completed. Refresh the workspace before retrying.",
    );
  return workspace;
}
