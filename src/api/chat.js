// Minimal client for OpenAI-compatible chat backends:
//   POST {baseUrl}/v1/chat/completions   (chat, stream or not)
//   GET  {baseUrl}/v1/models              (model discovery)
//
// No URLs, keys, or model names are hardcoded here; everything comes from the
// user-configured backend settings.

export const DEFAULT_TIMEOUT_MS = 120000;
export const STREAM_IDLE_TIMEOUT_MS = 60000;

export class ChatApiError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "ChatApiError";
    this.code = code; // config | network | timeout | aborted | http | invalid-json | stream
    this.status = options.status ?? null;
  }
}

function normalizeBaseUrl(raw) {
  return String(raw || "").trim().replace(/\/+$/, "");
}

// Accept both "http://host:port" and "http://host:port/v1" as the base URL.
function apiUrl(baseUrl, path) {
  let base = normalizeBaseUrl(baseUrl);
  if (base.toLowerCase().endsWith("/v1")) base = base.slice(0, -3);
  return base + path;
}

function authHeaders(apiKey) {
  let key = String(apiKey || "").trim();
  return key ? { Authorization: "Bearer " + key } : {};
}

// Combine an external AbortSignal with a timeout into one signal.
function combinedSignal(timeoutMs, external) {
  let controller = new AbortController();
  let onAbort = () => controller.abort(external.reason);
  if (external) {
    if (external.aborted) {
      controller.abort(external.reason);
    } else {
      external.addEventListener("abort", onAbort, { once: true });
    }
  }
  let timer =
    timeoutMs > 0
      ? setTimeout(
          () =>
            controller.abort(
              new DOMException("Request timed out", "TimeoutError"),
            ),
          timeoutMs,
        )
      : null;
  return {
    signal: controller.signal,
    cleanup() {
      if (timer) clearTimeout(timer);
      if (external) external.removeEventListener("abort", onAbort);
    },
  };
}

function toRequestError(error) {
  if (error instanceof ChatApiError) return error;
  let name = (error && error.name) || "";
  let message = String((error && error.message) || "");
  if (name === "TimeoutError" || /timed out/i.test(message)) {
    return new ChatApiError("timeout", "The request timed out.");
  }
  if (name === "AbortError") {
    return new ChatApiError("aborted", "The request was stopped.");
  }
  return new ChatApiError(
    "network",
    "Could not reach the backend. Check the base URL and the network connection.",
  );
}

async function toHttpError(response) {
  let detail = "";
  try {
    let body = await response.clone().json();
    detail = (body && body.error && body.error.message) || "";
  } catch (error) {
    detail = "";
  }
  return new ChatApiError(
    "http",
    "The backend returned HTTP " +
      response.status +
      (detail ? ": " + detail : "."),
    { status: response.status },
  );
}

// GET {baseUrl}/v1/models -> [{ id, ... }]
export async function fetchModels({
  baseUrl,
  apiKey = "",
  signal = null,
  timeoutMs = 30000,
} = {}) {
  let url = normalizeBaseUrl(baseUrl);
  if (!url) throw new ChatApiError("config", "Base URL is empty.");
  let combined = combinedSignal(timeoutMs, signal);
  try {
    let response;
    try {
      response = await fetch(apiUrl(url, "/v1/models"), {
        headers: { ...authHeaders(apiKey) },
        signal: combined.signal,
      });
    } catch (error) {
      throw toRequestError(error);
    }
    if (!response.ok) throw await toHttpError(response);
    let body;
    try {
      body = await response.json();
    } catch (error) {
      throw new ChatApiError(
        "invalid-json",
        "The backend returned an unreadable model list.",
      );
    }
    let list = body && Array.isArray(body.data) ? body.data : [];
    return list
      .map((item) => ({
        id: String((item && item.id) ?? ""),
        object: (item && item.object) || "",
      }))
      .filter((item) => item.id);
  } finally {
    combined.cleanup();
  }
}

// Lightweight reachability check. Succeeds when the endpoint answers;
// reports whether the configured model appears in the list.
export async function testConnection({
  baseUrl,
  model = "",
  apiKey = "",
  signal = null,
  timeoutMs = 30000,
} = {}) {
  let started = Date.now();
  let models = await fetchModels({ baseUrl, apiKey, signal, timeoutMs });
  let wanted = String(model || "").trim();
  return {
    ok: true,
    models,
    modelFound: !wanted || models.some((item) => item.id === wanted),
    latencyMs: Date.now() - started,
  };
}

// Read an SSE stream from a chat completions response, calling onToken for
// each content delta and resolving with the full text.
async function readSse(response, onToken) {
  let body = response.body;
  if (!body || typeof body.getReader !== "function") {
    throw new ChatApiError(
      "stream",
      "Streaming is not supported by this environment.",
    );
  }
  let reader = body.getReader();
  let decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let idleTimedOut = false;
  let idleTimer = null;
  let armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimedOut = true;
      try {
        reader.cancel();
      } catch (error) {}
    }, STREAM_IDLE_TIMEOUT_MS);
  };
  try {
    armIdle();
    for (;;) {
      let { done, value } = await reader.read();
      if (done) break;
      if (idleTimedOut) break;
      armIdle();
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        let line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        let payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let data;
        try {
          data = JSON.parse(payload);
        } catch (error) {
          continue;
        }
        let delta =
          data && data.choices && data.choices[0] && data.choices[0].delta
            ? data.choices[0].delta.content
            : undefined;
        if (typeof delta === "string" && delta) {
          full += delta;
          if (onToken) onToken(delta);
        }
      }
    }
  } catch (error) {
    if (idleTimedOut) {
      throw new ChatApiError(
        "timeout",
        "The stream stalled for too long and was stopped.",
      );
    }
    throw toRequestError(error);
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    try {
      reader.releaseLock();
    } catch (error) {}
  }
  if (idleTimedOut && !full) {
    throw new ChatApiError(
      "timeout",
      "The stream stalled for too long and was stopped.",
    );
  }
  return full;
}

// POST {baseUrl}/v1/chat/completions
// stream: false -> resolves with the full reply text.
// stream: true  -> calls onToken(delta) per SSE chunk, resolves with full text.
export async function sendChatCompletion({
  baseUrl,
  model,
  apiKey = "",
  messages,
  onToken = null,
  signal = null,
  stream = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let url = normalizeBaseUrl(baseUrl);
  let name = String(model || "").trim();
  if (!url) throw new ChatApiError("config", "Base URL is empty.");
  if (!name) throw new ChatApiError("config", "Model is empty.");
  if (!Array.isArray(messages) || !messages.length) {
    throw new ChatApiError("config", "No messages to send.");
  }
  let combined = combinedSignal(timeoutMs, signal);
  let response;
  try {
    try {
      response = await fetch(apiUrl(url, "/v1/chat/completions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(apiKey),
        },
        body: JSON.stringify({
          model: name,
          messages: messages.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          stream: !!stream,
        }),
        signal: combined.signal,
      });
    } catch (error) {
      throw toRequestError(error);
    }
    if (!response.ok) throw await toHttpError(response);
    if (!stream) {
      let body;
      try {
        body = await response.json();
      } catch (error) {
        throw new ChatApiError(
          "invalid-json",
          "The backend returned an unreadable reply.",
        );
      }
      let text =
        body && body.choices && body.choices[0] && body.choices[0].message
          ? body.choices[0].message.content
          : undefined;
      return typeof text === "string" ? text : "";
    }
    return await readSse(response, onToken);
  } finally {
    combined.cleanup();
  }
}
