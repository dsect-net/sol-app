import { describe, it, expect, beforeEach } from "vitest";
import {
  COMFYUI_DEFAULTS,
  RECOMMENDED_COMFYUI,
  normalizeComfyBaseUrl,
  getComfyConfig,
  saveComfyConfig,
  clearComfyConfig,
  isComfyUnconfigured,
  getComfyVerified,
  saveComfyVerified,
  isComfyVerified,
} from "./comfyui.js";
import { storage } from "../data/prototypeData.js";

beforeEach(() => {
  // storage is a module-level singleton; clear the keys comfyui.js uses.
  storage.remove("comfyui");
  storage.remove("comfyui.verified");
});

describe("normalizeComfyBaseUrl", () => {
  it("trims whitespace and strips trailing slashes", () => {
    expect(normalizeComfyBaseUrl("  https://host:8188/// ")).toBe("https://host:8188");
  });

  it("maps empty and non-string input to an empty string", () => {
    expect(normalizeComfyBaseUrl("")).toBe("");
    expect(normalizeComfyBaseUrl(null)).toBe("");
    expect(normalizeComfyBaseUrl(undefined)).toBe("");
  });
});

describe("comfy config storage", () => {
  it("defaults to the shipped settings, with no server configured", () => {
    expect(getComfyConfig()).toEqual(COMFYUI_DEFAULTS);
    expect(isComfyUnconfigured()).toBe(true);
  });

  it("saves a cleaned config: base trimmed of trailing slash, model trimmed", () => {
    saveComfyConfig({
      baseUrl: " https://host:8188/ ",
      model: "  some-checkpoint.safetensors ",
      width: 768,
      height: 512,
      steps: 12,
    });
    expect(getComfyConfig()).toEqual({
      baseUrl: "https://host:8188",
      model: "some-checkpoint.safetensors",
      width: 768,
      height: 512,
      steps: 12,
    });
    expect(isComfyUnconfigured()).toBe(false);
  });

  it("falls back to the default model when the model is empty or blank", () => {
    saveComfyConfig({ baseUrl: "https://host:8188", model: "" });
    expect(getComfyConfig().model).toBe(COMFYUI_DEFAULTS.model);
    saveComfyConfig({ baseUrl: "https://host:8188", model: "   " });
    expect(getComfyConfig().model).toBe(COMFYUI_DEFAULTS.model);
  });

  it("coerces numeric strings and truncates fractional dimensions", () => {
    saveComfyConfig({ baseUrl: "https://host:8188", width: "640", height: 512.9, steps: "20" });
    expect(getComfyConfig()).toMatchObject({ width: 640, height: 512, steps: 20 });
  });

  it("rejects zero, negative and non-numeric dimensions in favour of the defaults", () => {
    saveComfyConfig({ baseUrl: "https://host:8188", width: 0, height: -512, steps: "many" });
    expect(getComfyConfig()).toMatchObject({
      width: COMFYUI_DEFAULTS.width,
      height: COMFYUI_DEFAULTS.height,
      steps: COMFYUI_DEFAULTS.steps,
    });
  });

  it("ignores non-object junk instead of throwing", () => {
    saveComfyConfig("not an object");
    expect(getComfyConfig()).toEqual(COMFYUI_DEFAULTS);
    saveComfyConfig(null);
    expect(getComfyConfig()).toEqual(COMFYUI_DEFAULTS);
  });

  it("clear resets the config and drops the verified marker", () => {
    saveComfyConfig({ baseUrl: "https://host:8188", model: "m.safetensors" });
    saveComfyVerified({ baseUrl: "https://host:8188" });
    clearComfyConfig();
    expect(getComfyConfig()).toEqual(COMFYUI_DEFAULTS);
    expect(getComfyVerified()).toBe(null);
  });
});

describe("isComfyUnconfigured", () => {
  it("depends only on whether a base URL is present", () => {
    expect(isComfyUnconfigured({ baseUrl: "" })).toBe(true);
    expect(isComfyUnconfigured({ baseUrl: "https://host:8188" })).toBe(false);
    expect(isComfyUnconfigured(RECOMMENDED_COMFYUI)).toBe(false);
  });
});

describe("verified marker", () => {
  it("is null before anything is verified", () => {
    expect(getComfyVerified()).toBe(null);
    expect(isComfyVerified({ baseUrl: "https://host:8188" })).toBe(false);
  });

  it("records the normalised base URL with a timestamp", () => {
    saveComfyVerified({ baseUrl: "https://host:8188/" });
    let verified = getComfyVerified();
    expect(verified.baseUrl).toBe("https://host:8188");
    expect(typeof verified.at).toBe("string");
    expect(Number.isNaN(Date.parse(verified.at))).toBe(false);
  });

  it("matches the same server, with or without a trailing slash", () => {
    saveComfyVerified({ baseUrl: "https://host:8188" });
    expect(isComfyVerified({ baseUrl: "https://host:8188" })).toBe(true);
    expect(isComfyVerified({ baseUrl: "https://host:8188/" })).toBe(true);
  });

  it("is per-server only: a different model on the same server stays verified", () => {
    saveComfyVerified({ baseUrl: "https://host:8188", model: "first.safetensors" });
    expect(isComfyVerified({ baseUrl: "https://host:8188", model: "other.safetensors" })).toBe(true);
  });

  it("does not match a different server", () => {
    saveComfyVerified({ baseUrl: "https://host:8188" });
    expect(isComfyVerified({ baseUrl: "https://elsewhere:8188" })).toBe(false);
  });

  it("never counts an unconfigured install as verified", () => {
    saveComfyVerified({ baseUrl: "" });
    expect(isComfyVerified({ baseUrl: "" })).toBe(false);
    expect(isComfyVerified(COMFYUI_DEFAULTS)).toBe(false);
  });

  it("ignores a junk verified marker instead of throwing", () => {
    storage.set("comfyui.verified", "junk");
    expect(getComfyVerified()).toBe(null);
    expect(isComfyVerified({ baseUrl: "https://host:8188" })).toBe(false);
  });
});
