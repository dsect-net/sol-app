import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BACKEND_DEFAULTS,
  RECOMMENDED_BACKEND,
  GATEWAY_DEFAULT_MODEL,
  normalizeBaseUrl,
  gatewayBase,
  isGatewayUrl,
  recommendedBackend,
  getBackendConfig,
  saveBackendConfig,
  clearBackendConfig,
  isDemoMode,
  getBackendVerified,
  saveBackendVerified,
  isBackendVerified,
  autoConnect,
} from "./backend.js";
import { storage } from "../data/prototypeData.js";

// backend.js reads window.location / window.Capacitor at call time (via
// fleet.js's solApiBase and its own mixed-content check). Stub a minimal
// window per case, mirroring fleet.test.js.
function stubWindow({ origin = "http://localhost:5173", protocol = "http:", native = false } = {}) {
  vi.stubGlobal("window", {
    location: { origin, protocol },
    Capacitor: native ? { isNativePlatform: () => true } : undefined,
  });
}

function modelsResponse(ids, init = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: ids.map((id) => ({ id })) }),
    ...init,
  };
}

beforeEach(() => {
  // storage is a module-level singleton; clear the keys backend.js uses.
  storage.remove("backend");
  storage.remove("backend.verified");
  storage.remove("qubitDefault");
  stubWindow();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("normalizeBaseUrl", () => {
  it("trims whitespace and strips trailing slashes", () => {
    expect(normalizeBaseUrl("  http://host:8088/v1/// ")).toBe("http://host:8088/v1");
  });

  it("maps empty and non-string input to an empty string", () => {
    expect(normalizeBaseUrl("")).toBe("");
    expect(normalizeBaseUrl(null)).toBe("");
    expect(normalizeBaseUrl(undefined)).toBe("");
  });
});

describe("gatewayBase / recommendedBackend", () => {
  it("has no gateway on an ordinary web origin and recommends the direct backend", () => {
    stubWindow();
    expect(gatewayBase()).toBe("");
    expect(recommendedBackend()).toEqual({ ...RECOMMENDED_BACKEND, gateway: false });
  });

  it("resolves the relative gateway against the team origin", () => {
    stubWindow({ origin: "https://team.dsect.net", protocol: "https:" });
    expect(gatewayBase()).toBe("https://team.dsect.net/api/sol");
    expect(recommendedBackend()).toEqual({
      label: "Tritium local AI (every model)",
      baseUrl: "https://team.dsect.net/api/sol/v1",
      model: GATEWAY_DEFAULT_MODEL,
      gateway: true,
    });
  });
});

describe("isGatewayUrl", () => {
  it("matches the resolved gateway base, with or without the /v1 suffix", () => {
    stubWindow({ origin: "https://team.dsect.net", protocol: "https:" });
    expect(isGatewayUrl("https://team.dsect.net/api/sol")).toBe(true);
    expect(isGatewayUrl("https://team.dsect.net/api/sol/v1")).toBe(true);
    expect(isGatewayUrl("https://team.dsect.net/api/sol/v1/")).toBe(true);
  });

  it("still recognises a saved /api/sol URL from another origin (pattern fallback)", () => {
    stubWindow();
    expect(isGatewayUrl("https://other.example/api/sol/v1")).toBe(true);
  });

  it("rejects the direct Tritium address and empty input", () => {
    stubWindow({ origin: "https://team.dsect.net", protocol: "https:" });
    expect(isGatewayUrl(RECOMMENDED_BACKEND.baseUrl)).toBe(false);
    expect(isGatewayUrl("")).toBe(false);
    expect(isGatewayUrl(null)).toBe(false);
  });
});

describe("backend config storage", () => {
  it("defaults to empty demo settings", () => {
    expect(getBackendConfig()).toEqual(BACKEND_DEFAULTS);
    expect(isDemoMode()).toBe(true);
  });

  it("saves a normalised config: base trimmed of trailing slash, model trimmed", () => {
    saveBackendConfig({ baseUrl: " http://host:8088/v1/ ", model: "  some-model ", apiKey: "k" });
    expect(getBackendConfig()).toEqual({
      baseUrl: "http://host:8088/v1",
      model: "some-model",
      apiKey: "k",
    });
    expect(isDemoMode()).toBe(false);
  });

  it("treats a config missing either field as demo mode", () => {
    expect(isDemoMode({ baseUrl: "http://host/v1", model: "" })).toBe(true);
    expect(isDemoMode({ baseUrl: "", model: "m" })).toBe(true);
    expect(isDemoMode({ baseUrl: "http://host/v1", model: "m" })).toBe(false);
  });

  it("ignores non-object junk instead of throwing", () => {
    saveBackendConfig("not an object");
    expect(getBackendConfig()).toEqual(BACKEND_DEFAULTS);
  });

  it("clear resets the config and drops the verified marker", () => {
    saveBackendConfig({ baseUrl: "http://host/v1", model: "m" });
    saveBackendVerified({ baseUrl: "http://host/v1", model: "m" });
    clearBackendConfig();
    expect(getBackendConfig()).toEqual(BACKEND_DEFAULTS);
    expect(getBackendVerified()).toBe(null);
  });
});

describe("verified marker", () => {
  it("is null before anything is verified", () => {
    expect(getBackendVerified()).toBe(null);
    expect(isBackendVerified({ baseUrl: "http://host/v1", model: "m" })).toBe(false);
  });

  it("matches only the exact base URL + model it was saved for", () => {
    saveBackendVerified({ baseUrl: "http://host/v1/", model: "m" });
    expect(isBackendVerified({ baseUrl: "http://host/v1", model: "m" })).toBe(true);
    expect(isBackendVerified({ baseUrl: "http://host/v1", model: "other" })).toBe(false);
    expect(isBackendVerified({ baseUrl: "http://elsewhere/v1", model: "m" })).toBe(false);
  });

  it("never counts demo mode as verified", () => {
    saveBackendVerified({ baseUrl: "", model: "" });
    expect(isBackendVerified({ baseUrl: "", model: "" })).toBe(false);
  });
});

describe("autoConnect", () => {
  it("does nothing when this build cannot reach a gateway", async () => {
    stubWindow();
    vi.stubGlobal("fetch", vi.fn());
    await expect(autoConnect()).resolves.toBe(null);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("connects an unconfigured install to the gateway, defaulting to Qubit", async () => {
    stubWindow({ origin: "https://team.dsect.net", protocol: "https:" });
    let seenUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        seenUrl = url;
        return modelsResponse(["some-model", "qubit"]);
      }),
    );
    let cfg = await autoConnect();
    expect(seenUrl).toBe("https://team.dsect.net/api/sol/v1/models");
    expect(cfg).toEqual({
      baseUrl: "https://team.dsect.net/api/sol/v1",
      model: "qubit",
      apiKey: "",
    });
    expect(isBackendVerified(cfg)).toBe(true);
  });

  it("keeps the current model when the gateway offers it, else takes the first offered", async () => {
    stubWindow({ origin: "https://team.dsect.net", protocol: "https:" });
    saveBackendConfig({ baseUrl: "", model: "some-model" });
    vi.stubGlobal("fetch", vi.fn(async () => modelsResponse(["some-model", "qubit"])));
    expect((await autoConnect()).model).toBe("some-model");

    storage.remove("backend");
    storage.remove("backend.verified");
    saveBackendConfig({ baseUrl: "", model: "gone-model" });
    vi.stubGlobal("fetch", vi.fn(async () => modelsResponse(["first-model", "second-model"])));
    expect((await autoConnect()).model).toBe("first-model");
  });

  it("leaves a working custom backend alone without probing the gateway", async () => {
    stubWindow({ origin: "https://team.dsect.net", protocol: "https:" });
    saveBackendConfig({ baseUrl: "https://my-server.example/v1", model: "m" });
    vi.stubGlobal("fetch", vi.fn());
    await expect(autoConnect()).resolves.toBe(null);
    expect(fetch).not.toHaveBeenCalled();
    expect(getBackendConfig().baseUrl).toBe("https://my-server.example/v1");
  });

  it("replaces a plain-http backend that an HTTPS page cannot reach", async () => {
    stubWindow({ origin: "https://team.dsect.net", protocol: "https:" });
    saveBackendConfig({ baseUrl: "http://100.66.182.7:8088/v1", model: "Qwen3-4B-Instruct-2507" });
    vi.stubGlobal("fetch", vi.fn(async () => modelsResponse(["qubit"])));
    let cfg = await autoConnect();
    expect(cfg.baseUrl).toBe("https://team.dsect.net/api/sol/v1");
  });

  it("changes nothing when the gateway does not answer with models", async () => {
    stubWindow({ origin: "https://team.dsect.net", protocol: "https:" });
    vi.stubGlobal("fetch", vi.fn(async () => modelsResponse([], { ok: false, status: 502 })));
    await expect(autoConnect()).resolves.toBe(null);
    expect(getBackendConfig()).toEqual(BACKEND_DEFAULTS);

    vi.stubGlobal("fetch", vi.fn(async () => modelsResponse([])));
    await expect(autoConnect()).resolves.toBe(null);
    expect(getBackendConfig()).toEqual(BACKEND_DEFAULTS);
  });

  it("migrates the pre-Qubit gateway default to Qubit exactly once", async () => {
    stubWindow({ origin: "https://team.dsect.net", protocol: "https:" });
    saveBackendConfig({
      baseUrl: "https://team.dsect.net/api/sol/v1",
      model: "Qwen3-4B-Instruct-2507",
    });
    vi.stubGlobal("fetch", vi.fn());
    let cfg = await autoConnect();
    expect(cfg.model).toBe("qubit");
    expect(fetch).not.toHaveBeenCalled();

    // The one-time flag is now set: if the user picks the old model again it stays.
    saveBackendConfig({ baseUrl: "https://team.dsect.net/api/sol/v1", model: "Qwen3-4B-Instruct-2507" });
    await expect(autoConnect()).resolves.toBe(null);
    expect(getBackendConfig().model).toBe("Qwen3-4B-Instruct-2507");
  });
});
