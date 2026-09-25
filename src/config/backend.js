// Future production backend connection points.
// Leave every field empty to keep Sol in safe, local demo mode.
export const backendConfig = Object.freeze({
  apiBaseUrl: "", // HTTPS base URL for the Sol application API.
  apiKey: "", // API key supplied by the future Sol backend.
  comfyUiHost: "", // ComfyUI hostname or IP address (without the port).
  comfyUiPort: "", // ComfyUI port, usually 8188.
  authToken: "", // Bearer/session token for authenticated backend requests.
});

export const isDemoMode = Object.values(backendConfig).some(
  (value) => !String(value || "").trim(),
);
