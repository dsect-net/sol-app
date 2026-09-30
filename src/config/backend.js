// Sol backend connection settings.
// Keep every field empty to stay in safe, local demo mode: no network
// calls are made until a base URL and a model are both configured.

import { storage } from "../data/prototypeData";

const STORAGE_KEY = "backend";
const VERIFIED_KEY = "backend.verified";

export const BACKEND_DEFAULTS = Object.freeze({
  baseUrl: "", // Base URL of an OpenAI-compatible chat API, e.g. http://host:port/v1
  model: "", // Model name served by the backend (GET {baseUrl}/v1/models lists them)
  apiKey: "", // Optional bearer token. Leave empty for backends that need no auth.
});

// Recommended quick-fill for Scotty's home server. Plain network addresses,
// not secrets — safe to ship in UI text. Points at local on-device models on
// the Tritium host (not an agent API).
export const RECOMMENDED_BACKEND = Object.freeze({
  label: "Tritium local AI",
  baseUrl: "http://100.66.182.7:8088/v1",
  model: "Qwen3-4B-Instruct-2507",
});

export function normalizeBaseUrl(raw) {
  return String(raw || "").trim().replace(/\/+$/, "");
}

function normalizeModel(raw) {
  return String(raw || "").trim();
}

function cleanConfig(raw) {
  let source = raw && typeof raw === "object" ? raw : {};
  return {
    baseUrl: normalizeBaseUrl(source.baseUrl),
    model: normalizeModel(source.model),
    apiKey: String(source.apiKey || ""),
  };
}

export function getBackendConfig() {
  return { ...BACKEND_DEFAULTS, ...cleanConfig(storage.get(STORAGE_KEY, {})) };
}

export function saveBackendConfig(config) {
  storage.set(STORAGE_KEY, cleanConfig(config));
}

export function clearBackendConfig() {
  saveBackendConfig(BACKEND_DEFAULTS);
  storage.remove(VERIFIED_KEY);
}

// True when the app should behave as a local demo: no base URL or no model.
export function isDemoMode(config) {
  let cfg = config || getBackendConfig();
  return !cfg.baseUrl || !cfg.model;
}

// The app may only claim "connected" after a successful connection test or a
// successful chat against the exact configured base URL + model.
export function getBackendVerified() {
  let saved = storage.get(VERIFIED_KEY, null);
  if (!saved || typeof saved !== "object") return null;
  return {
    baseUrl: normalizeBaseUrl(saved.baseUrl),
    model: normalizeModel(saved.model),
    at: saved.at || null,
  };
}

export function saveBackendVerified(config) {
  let cfg = cleanConfig(config);
  storage.set(VERIFIED_KEY, {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    at: new Date().toISOString(),
  });
}

export function isBackendVerified(config) {
  let cfg = cleanConfig(config);
  if (isDemoMode(cfg)) return false;
  let verified = getBackendVerified();
  return (
    !!verified &&
    verified.baseUrl === cfg.baseUrl &&
    verified.model === cfg.model
  );
}
