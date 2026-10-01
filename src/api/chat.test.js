import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ChatApiError,
  sendChatCompletion,
  fetchModels,
  testConnection,
} from "./chat.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body, init = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    clone() {
      return this;
    },
    ...init,
  };
}

function sseResponse(chunks) {
  let encoder = new TextEncoder();
  let stream = new ReadableStream({
    start(controller) {
      for (let chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream };
}

describe("sendChatCompletion (non-stream)", () => {
  it("posts to /v1/chat/completions and returns the reply text", async () => {
    let seen = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        seen = { url, options, body: JSON.parse(options.body) };
        return jsonResponse({
          choices: [{ message: { content: "Hello there." } }],
        });
      }),
    );
    let text = await sendChatCompletion({
      baseUrl: "http://host:8088/v1/",
      model: "test-model",
      apiKey: "secret",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
    expect(text).toBe("Hello there.");
    expect(seen.url).toBe("http://host:8088/v1/chat/completions");
    expect(seen.body.model).toBe("test-model");
    expect(seen.body.stream).toBe(false);
    expect(seen.body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(seen.options.headers.Authorization).toBe("Bearer secret");
  });

  it("omits the auth header when no api key is set", async () => {
    let headers;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        headers = options.headers;
        return jsonResponse({ choices: [{ message: { content: "ok" } }] });
      }),
    );
    await sendChatCompletion({
      baseUrl: "http://host:8088/v1",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(headers.Authorization).toBeUndefined();
  });

  it("maps an HTTP error to a ChatApiError with code http", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { message: "model not found" } }, { ok: false, status: 404 }),
      ),
    );
    let error = await sendChatCompletion({
      baseUrl: "http://host:8088/v1",
      model: "missing",
      messages: [{ role: "user", content: "hi" }],
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ChatApiError);
    expect(error.code).toBe("http");
    expect(error.status).toBe(404);
    expect(error.message).toContain("404");
    expect(error.message).toContain("model not found");
  });

  it("maps a network failure to a ChatApiError with code network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    let error = await sendChatCompletion({
      baseUrl: "http://down:8088/v1",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ChatApiError);
    expect(error.code).toBe("network");
  });

  it("maps an unreadable body to a ChatApiError with code invalid-json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("bad json");
        },
        clone() {
          return this;
        },
      })),
    );
    let error = await sendChatCompletion({
      baseUrl: "http://host:8088/v1",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ChatApiError);
    expect(error.code).toBe("invalid-json");
  });

  it("rejects empty base URL and model with code config", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return jsonResponse({});
      }),
    );
    let e1 = await sendChatCompletion({
      baseUrl: "",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    }).catch((e) => e);
    let e2 = await sendChatCompletion({
      baseUrl: "http://host:8088/v1",
      model: "  ",
      messages: [{ role: "user", content: "hi" }],
    }).catch((e) => e);
    expect(e1.code).toBe("config");
    expect(e2.code).toBe("config");
    expect(calls).toBe(0);
  });
});

describe("sendChatCompletion (stream)", () => {
  it("parses SSE chunks, calls onToken, and stops at [DONE]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" there"}}]}\r\n',
          'data: {"choices":[{"delta":{}}]}\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    let tokens = [];
    let text = await sendChatCompletion({
      baseUrl: "http://host:8088/v1",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      onToken: (token) => tokens.push(token),
    });
    expect(text).toBe("Hello there");
    expect(tokens).toEqual(["Hello", " there"]);
  });

  it("handles chunks split across read boundaries", async () => {
    let encoder = new TextEncoder();
    let parts = [
      'data: {"choices":[{"delta":{"con',
      'tent":"Hel',
      'lo"}}]}',
      "\n\ndata: [DONE]\n",
    ];
    let stream = new ReadableStream({
      start(controller) {
        for (let part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, body: stream })),
    );
    let text = await sendChatCompletion({
      baseUrl: "http://host:8088/v1",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });
    expect(text).toBe("Hello");
  });

  it("aborts via an external signal with code aborted", async () => {
    let controller = new AbortController();
    let stream = new ReadableStream({
      start(c) {
        controller.signal.addEventListener("abort", () => c.close(), {
          once: true,
        });
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (url, options) =>
          new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    void controller;
    void stream;
    let external = new AbortController();
    let pending = sendChatCompletion({
      baseUrl: "http://host:8088/v1",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      signal: external.signal,
    });
    external.abort();
    let error = await pending.catch((e) => e);
    expect(error).toBeInstanceOf(ChatApiError);
    expect(error.code).toBe("aborted");
  });
});

describe("fetchModels / testConnection", () => {
  it("parses the /v1/models list", async () => {
    let seen = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        seen = { url };
        return jsonResponse({
          object: "list",
          data: [{ id: "qwen-4b" }, { id: "llama-8b" }, {}],
        });
      }),
    );
    let models = await fetchModels({
      baseUrl: "http://host:8088/v1/",
      apiKey: "",
    });
    expect(seen.url).toBe("http://host:8088/v1/models");
    expect(models.map((m) => m.id)).toEqual(["qwen-4b", "llama-8b"]);
  });

  it("accepts a base URL with or without a /v1 suffix", async () => {
    let urls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        urls.push(url);
        return jsonResponse({ data: [{ id: "m" }] });
      }),
    );
    await fetchModels({ baseUrl: "http://host:8088" });
    await fetchModels({ baseUrl: "http://host:8088/" });
    await fetchModels({ baseUrl: "http://host:8088/v1" });
    await fetchModels({ baseUrl: "http://host:8088/v1/" });
    expect(urls).toEqual([
      "http://host:8088/v1/models",
      "http://host:8088/v1/models",
      "http://host:8088/v1/models",
      "http://host:8088/v1/models",
    ]);
  });

  it("testConnection reports modelFound against the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: [{ id: "qwen-4b" }] })),
    );
    let found = await testConnection({
      baseUrl: "http://host:8088/v1",
      model: "qwen-4b",
    });
    expect(found.ok).toBe(true);
    expect(found.modelFound).toBe(true);
    expect(found.models).toHaveLength(1);
    expect(typeof found.latencyMs).toBe("number");
    let missing = await testConnection({
      baseUrl: "http://host:8088/v1",
      model: "nope",
    });
    expect(missing.modelFound).toBe(false);
  });

  it("testConnection surfaces network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    let error = await testConnection({
      baseUrl: "http://down:8088/v1",
      model: "m",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ChatApiError);
    expect(error.code).toBe("network");
  });
});

describe("sendChatCompletion through the Sol gateway", () => {
  let capture = (reply) => {
    let seen = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        seen.url = url;
        seen.headers = options.headers;
        return reply;
      }),
    );
    return seen;
  };
  let ok = () => jsonResponse({ choices: [{ message: { content: "ok" } }] });
  let base = {
    baseUrl: "https://team.dsect.net/api/sol/v1",
    model: "gemma-4-E4B-it",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
  };

  it("sends the CSRF header and never an API key to the gateway", async () => {
    let seen = capture(ok());
    await sendChatCompletion({ ...base, apiKey: "stale-key", gateway: true });
    expect(seen.url).toBe("https://team.dsect.net/api/sol/v1/chat/completions");
    expect(seen.headers["X-Sol-Request"]).toBe("1");
    expect(seen.headers.Authorization).toBeUndefined();
  });

  it("sends the key and no CSRF header to a plain backend", async () => {
    let seen = capture(ok());
    await sendChatCompletion({ ...base, baseUrl: "http://host:8088/v1", apiKey: "k", gateway: false });
    expect(seen.headers["X-Sol-Request"]).toBeUndefined();
    expect(seen.headers.Authorization).toBe("Bearer k");
  });

  it("carries the server's error code, so Sol can fall back from a removed model", async () => {
    capture(
      jsonResponse(
        { error: { message: "No such local model: 'x'.", code: "unknown_model" } },
        { ok: false, status: 404 },
      ),
    );
    let err = await sendChatCompletion({ ...base, gateway: true }).catch((e) => e);
    expect(err).toBeInstanceOf(ChatApiError);
    expect(err.status).toBe(404);
    expect(err.apiCode).toBe("unknown_model");
    expect(err.message).toContain("No such local model");
  });
});
