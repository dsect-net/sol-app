// Sol ComfyUI connection settings for /imagine image generation.
// Keep the base URL empty to stay in simulated mode: /imagine draws a local
// procedural preview and says so honestly until a ComfyUI server is configured.

import { storage } from "../data/prototypeData";

const STORAGE_KEY = "comfyui";
const VERIFIED_KEY = "comfyui.verified";

export const COMFYUI_DEFAULTS = Object.freeze({
  baseUrl: "", // Base URL of a ComfyUI server, e.g. https://host:8188 (no /prompt suffix)
  model: "DreamShaperXL_Lightning.safetensors", // Checkpoint name as ComfyUI lists it
  width: 1024,
  height: 1024,
  steps: 8, // DreamShaperXL Lightning is tuned for few-step sampling
});

// Recommended quick-fill for Scotty's home server. Plain network addresses,
// not secrets — safe to ship in UI text. ComfyUI is served over HTTPS with a
// Tailscale certificate; plain http://100.66.182.7:8188 will NOT work because
// Tailscale Serve on that port is HTTPS-only.
export const RECOMMENDED_COMFYUI = Object.freeze({
  label: "Tritium ComfyUI",
  baseUrl: "https://tritium-linux.fairy-chinstrap.ts.net:8188",
});

export function normalizeComfyBaseUrl(raw) {
  return String(raw || "").trim().replace(/\/+$/, "");
}

function toPositiveInt(raw, fallback) {
  let n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function cleanConfig(raw) {
  let source = raw && typeof raw === "object" ? raw : {};
  return {
    baseUrl: normalizeComfyBaseUrl(source.baseUrl),
    model: String(source.model || COMFYUI_DEFAULTS.model).trim() || COMFYUI_DEFAULTS.model,
    width: toPositiveInt(source.width, COMFYUI_DEFAULTS.width),
    height: toPositiveInt(source.height, COMFYUI_DEFAULTS.height),
    steps: toPositiveInt(source.steps, COMFYUI_DEFAULTS.steps),
  };
}

export function getComfyConfig() {
  return { ...COMFYUI_DEFAULTS, ...cleanConfig(storage.get(STORAGE_KEY, {})) };
}

export function saveComfyConfig(config) {
  storage.set(STORAGE_KEY, cleanConfig(config));
}

export function clearComfyConfig() {
  saveComfyConfig(COMFYUI_DEFAULTS);
  storage.remove(VERIFIED_KEY);
}

// True when /imagine should stay simulated: no ComfyUI server configured.
export function isComfyUnconfigured(config) {
  let cfg = config || getComfyConfig();
  return !cfg.baseUrl;
}

export function getComfyVerified() {
  let saved = storage.get(VERIFIED_KEY, null);
  if (!saved || typeof saved !== "object") return null;
  return {
    baseUrl: normalizeComfyBaseUrl(saved.baseUrl),
    at: saved.at || null,
  };
}

export function saveComfyVerified(config) {
  let cfg = cleanConfig(config);
  storage.set(VERIFIED_KEY, {
    baseUrl: cfg.baseUrl,
    at: new Date().toISOString(),
  });
}

export function isComfyVerified(config) {
  let cfg = cleanConfig(config);
  if (isComfyUnconfigured(cfg)) return false;
  let verified = getComfyVerified();
  return !!verified && verified.baseUrl === cfg.baseUrl;
}
