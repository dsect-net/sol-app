// Sol backend connection settings.
// Keep every field empty to stay in safe, local demo mode: no network
// calls are made until a base URL and a model are both configured.

import { storage } from "../data/prototypeData";
import { solApiBase } from "../fleet";

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

// The Sol gateway (quantum-os/desk/sol_gateway.py) speaks the same OpenAI protocol for EVERY
// local model on Tritium, over HTTPS behind the tailnet identity gate. Prefer it when this build
// can reach it: an HTTPS page (team.dsect.net, or the APK at https://localhost) cannot fetch the
// plain-http llama-server address above - browsers and WebViews block mixed content, and Android
// blocks cleartext - and one llama-server URL only ever offers one model.
export const GATEWAY_DEFAULT_MODEL = "Qwen3-4B-Instruct-2507";

export function gatewayBase() {
  let base = solApiBase();
  if (!base) return "";
  return base.startsWith("http") ? base : window.location.origin + base;
}

export function isGatewayUrl(url) {
  return /\/api\/sol(\/v1)?$/i.test(normalizeBaseUrl(url));
}

export function recommendedBackend() {
  let g = gatewayBase();
  if (!g) return { ...RECOMMENDED_BACKEND, gateway: false };
  return { label: "Tritium local AI (every model)", baseUrl: g + "/v1", model: GATEWAY_DEFAULT_MODEL, gateway: true };
}

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

// ---- automatic connection -----------------------------------------------------------------------
// Scott, 2026-10-01: any device on the tailnet should get the models automatically. So on launch,
// wherever this build can reach the Sol gateway, Sol connects itself:
//   - nothing configured yet                        -> the gateway
//   - a backend this page CANNOT reach: plain http:// from an HTTPS page or the APK (mixed
//     content / cleartext), e.g. the old direct Tritium address -> the gateway
//   - a working custom backend                      -> left alone
// It only switches after the gateway has answered with a model list, so an off-tailnet launch
// changes nothing.
function unreachableFromHere(baseUrl) {
  let url = normalizeBaseUrl(baseUrl);
  if (!url) return true;
  let secure = window.location.protocol === "https:" || Boolean(window.Capacitor?.isNativePlatform?.());
  return secure && /^http:\/\//i.test(url);
}

export async function autoConnect({ timeoutMs = 6000 } = {}) {
  let gw = gatewayBase();
  if (!gw) return null;
  let current = getBackendConfig();
  if (isGatewayUrl(current.baseUrl)) return null;                 // already on it
  if (!isDemoMode(current) && !unreachableFromHere(current.baseUrl)) return null;   // a working choice
  let ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res = await fetch(gw + "/v1/models", { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return null;
    let data = await res.json();
    let ids = Array.isArray(data?.data) ? data.data.map((m) => m.id) : [];
    if (!ids.length) return null;
    let model = ids.includes(current.model) ? current.model : ids.includes(GATEWAY_DEFAULT_MODEL) ? GATEWAY_DEFAULT_MODEL : ids[0];
    let next = { baseUrl: gw + "/v1", model, apiKey: "" };
    saveBackendConfig(next);
    saveBackendVerified(next);
    return getBackendConfig();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
