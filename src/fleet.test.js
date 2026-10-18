import { describe, it, expect, vi, afterEach } from "vitest";
import { solApiBase, fleetEnabled, fleet, ago } from "./fleet.js";

// fleet.js reads window.location / window.Capacitor at call time to decide
// where the Sol gateway lives. Stub a minimal window per case.
function stubWindow({ origin = "http://localhost:5173", native = false } = {}) {
  vi.stubGlobal("window", {
    location: { origin },
    Capacitor: native ? { isNativePlatform: () => true } : undefined,
  });
}

function jsonResponse(body, init = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    ...init,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("solApiBase / fleetEnabled", () => {
  it("is empty on an ordinary web origin (no gateway in this build)", () => {
    stubWindow();
    expect(solApiBase()).toBe("");
    expect(fleetEnabled()).toBe(false);
  });

  it("is relative when served by team.dsect.net itself", () => {
    stubWindow({ origin: "https://team.dsect.net" });
    expect(solApiBase()).toBe("/api/sol");
    expect(fleetEnabled()).toBe(true);
  });

  it("points at the tailnet host from the native app", () => {
    stubWindow({ origin: "https://localhost", native: true });
    expect(solApiBase()).toBe("https://team.dsect.net/api/sol");
  });

  it("honours a VITE_SOL_API override and strips a trailing slash", () => {
    stubWindow();
    vi.stubEnv("VITE_SOL_API", "https://example.test/api/sol/");
    expect(solApiBase()).toBe("https://example.test/api/sol");
  });
});

describe("fleet calls", () => {
  it("refuses to call when no gateway base is resolved", async () => {
    stubWindow();
    vi.stubGlobal("fetch", vi.fn());
    await expect(fleet.agents()).rejects.toThrow("isn't connected to the fleet");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("GETs the gateway path with no CSRF header and returns the JSON", async () => {
    stubWindow({ origin: "https://team.dsect.net" });
    let seen = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        seen = { url, options };
        return jsonResponse({ agents: [{ id: "qubit" }] });
      }),
    );
    let data = await fleet.agents();
    expect(data.agents).toEqual([{ id: "qubit" }]);
    expect(seen.url).toBe("/api/sol/agents");
    expect(seen.options.method).toBe("GET");
    expect(seen.options.headers["X-Sol-Request"]).toBeUndefined();
  });

  it("sends the X-Sol-Request header and a JSON body on state changes", async () => {
    stubWindow({ origin: "https://team.dsect.net" });
    let seen = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        seen = { url, options };
        return jsonResponse({ ok: true });
      }),
    );
    await fleet.handback("all yours");
    expect(seen.url).toBe("/api/sol/desk/handback");
    expect(seen.options.method).toBe("POST");
    expect(seen.options.headers["X-Sol-Request"]).toBe("1");
    expect(seen.options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(seen.options.body)).toEqual({ note: "all yours" });
  });

  // Regression: a 200 that isn't JSON (a dev server / misrouted proxy answering
  // with an HTML page) once crashed the whole app — Agents.jsx read
  // data.agents.map of undefined. The guard must reject with code not_gateway.
  it("rejects a 200 non-JSON answer with code not_gateway", async () => {
    stubWindow({ origin: "https://team.dsect.net" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      })),
    );
    let err = await fleet.agents().catch((e) => e);
    expect(err.code).toBe("not_gateway");
    expect(err.status).toBe(200);
  });

  it("rejects a 200 whose JSON body is not an object", async () => {
    stubWindow({ origin: "https://team.dsect.net" });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("just a string")));
    let err = await fleet.agents().catch((e) => e);
    expect(err.code).toBe("not_gateway");
  });

  it("surfaces the gateway's detail and error code on HTTP failures", async () => {
    stubWindow({ origin: "https://team.dsect.net" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ detail: "Admins only.", error: "forbidden" }, { ok: false, status: 403 }),
      ),
    );
    let err = await fleet.approvals().catch((e) => e);
    expect(err.message).toBe("Admins only.");
    expect(err.status).toBe(403);
    expect(err.code).toBe("forbidden");
  });

  it("builds DM URLs with the since cursor", async () => {
    stubWindow({ origin: "https://team.dsect.net" });
    let seenUrl;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        seenUrl = url;
        return jsonResponse({ messages: [] });
      }),
    );
    await fleet.dm("qubit", 1234);
    expect(seenUrl).toBe("/api/sol/dm/qubit?since=1234");
  });

  it("builds websocket stream URLs: control only when asked, view otherwise", () => {
    stubWindow({ origin: "https://team.dsect.net" });
    expect(fleet.streamUrl("view")).toBe("wss://team.dsect.net/api/sol/desk/view");
    expect(fleet.streamUrl("control")).toBe("wss://team.dsect.net/api/sol/desk/control");
    expect(fleet.streamUrl("anything-else")).toBe("wss://team.dsect.net/api/sol/desk/view");
  });
});

describe("ago", () => {
  it("formats relative times the way the Agents tab shows them", () => {
    expect(ago(null)).toBe("");
    expect(ago(undefined)).toBe("");
    expect(ago(10)).toBe("just now");
    expect(ago(44)).toBe("just now");
    expect(ago(60)).toBe("1m ago");
    expect(ago(30 * 60)).toBe("30m ago");
    expect(ago(3600)).toBe("1h ago");
    expect(ago(47 * 3600)).toBe("47h ago");
    expect(ago(3 * 24 * 3600)).toBe("3d ago");
  });
});
