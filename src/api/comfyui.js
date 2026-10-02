// Minimal client for ComfyUI's HTTP API, used by /imagine:
//   POST {baseUrl}/prompt            (queue a workflow)
//   GET  {baseUrl}/history/{promptId} (poll until done)
//   GET  {baseUrl}/view?...          (download the finished image)
//   GET  {baseUrl}/system_stats      (connection test)
//
// No URLs or model names are hardcoded here; everything comes from the
// user-configured ComfyUI settings. The workflow below is the one verified
// against Tritium's ComfyUI (SDXL Lightning, few-step sampling).

export const DEFAULT_TIMEOUT_MS = 30000;
export const POLL_INTERVAL_MS = 2500;
export const GENERATION_TIMEOUT_MS = 600000; // 10 min cap per generation

export class ComfyApiError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "ComfyApiError";
    this.code = code; // config | network | timeout | aborted | http | invalid-json | node-error | cors
    this.status = options.status ?? null;
  }
}

function normalizeBaseUrl(raw) {
  return String(raw || "").trim().replace(/\/+$/, "");
}

// A browser fetch that fails before any HTTP response usually means the
// server is unreachable — or that CORS blocked the call. ComfyUI only sends
// CORS headers when launched with --enable-cors-header, so a TypeError here
// gets a hint pointing at that flag.
function toRequestError(error, baseUrl) {
  if (error instanceof ComfyApiError) return error;
  let name = (error && error.name) || "";
  let message = String((error && error.message) || "");
  if (name === "TimeoutError" || /timed out/i.test(message)) {
    return new ComfyApiError("timeout", "The request timed out.");
  }
  if (name === "AbortError") {
    return new ComfyApiError("aborted", "The request was stopped.");
  }
  return new ComfyApiError(
    "network",
    "Could not reach ComfyUI at " +
      baseUrl +
      ". If the server is up, it may need --enable-cors-header so the app can call it.",
  );
}

async function toHttpError(response) {
  let detail = "";
  try {
    let body = await response.clone().json();
    detail = (body && body.error) || (body && body.message) || "";
  } catch (error) {
    detail = "";
  }
  return new ComfyApiError(
    "http",
    "ComfyUI returned HTTP " +
      response.status +
      (detail ? ": " + detail : "."),
    { status: response.status },
  );
}

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

// Build the text-to-image workflow. Verified against ComfyUI 0.35.0 with
// DreamShaperXL_Lightning (SDXL Lightning: fast at few steps, CFG ~1-2).
export function buildWorkflow({
  prompt,
  model,
  width = 1024,
  height = 1024,
  steps = 8,
  seed = null,
  negativePrompt = "blurry, low quality, watermark, text",
} = {}) {
  let text = String(prompt || "").trim();
  if (!text) throw new ComfyApiError("config", "Image prompt is empty.");
  let ckpt = String(model || "").trim();
  if (!ckpt)
    throw new ComfyApiError("config", "ComfyUI checkpoint model is empty.");
  let w = Math.max(64, parseInt(width, 10) || 1024);
  let h = Math.max(64, parseInt(height, 10) || 1024);
  let s = Math.max(1, parseInt(steps, 10) || 8);
  let resolvedSeed =
    seed == null ? Math.floor(Math.random() * 2 ** 31) : parseInt(seed, 10) || 0;
  return {
    3: {
      inputs: {
        seed: resolvedSeed,
        steps: s,
        cfg: 2.0,
        sampler_name: "euler",
        scheduler: "sgm_uniform",
        denoise: 1.0,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
      class_type: "KSampler",
      _meta: { title: "KSampler" },
    },
    4: {
      inputs: { ckpt_name: ckpt },
      class_type: "CheckpointLoaderSimple",
      _meta: { title: "Load Checkpoint" },
    },
    5: {
      inputs: { width: w, height: h, batch_size: 1 },
      class_type: "EmptyLatentImage",
      _meta: { title: "Empty Latent Image" },
    },
    6: {
      inputs: { text, clip: ["4", 1] },
      class_type: "CLIPTextEncode",
      _meta: { title: "CLIP Text Encode (Prompt)" },
    },
    7: {
      inputs: { text: String(negativePrompt || ""), clip: ["4", 1] },
      class_type: "CLIPTextEncode",
      _meta: { title: "CLIP Text Encode (Negative)" },
    },
    8: {
      inputs: { samples: ["3", 0], vae: ["4", 2] },
      class_type: "VAEDecode",
      _meta: { title: "VAE Decode" },
    },
    9: {
      inputs: { filename_prefix: "sol_imagine", images: ["8", 0] },
      class_type: "SaveImage",
      _meta: { title: "Save Image" },
    },
  };
}

async function postJson(url, body, { signal, timeoutMs }) {
  let combined = combinedSignal(timeoutMs, signal);
  try {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: combined.signal,
      });
    } catch (error) {
      throw toRequestError(error, url);
    }
    if (!response.ok) throw await toHttpError(response);
    try {
      return await response.json();
    } catch (error) {
      throw new ComfyApiError(
        "invalid-json",
        "ComfyUI returned an unreadable response.",
      );
    }
  } finally {
    combined.cleanup();
  }
}

async function getJson(url, { signal, timeoutMs }) {
  let combined = combinedSignal(timeoutMs, signal);
  try {
    let response;
    try {
      response = await fetch(url, { signal: combined.signal });
    } catch (error) {
      throw toRequestError(error, url);
    }
    if (!response.ok) throw await toHttpError(response);
    try {
      return await response.json();
    } catch (error) {
      throw new ComfyApiError(
        "invalid-json",
        "ComfyUI returned an unreadable response.",
      );
    }
  } finally {
    combined.cleanup();
  }
}

// POST {baseUrl}/prompt -> prompt_id. Throws ComfyApiError("node-error") when
// ComfyUI rejects the workflow.
export async function submitPrompt({
  baseUrl,
  workflow,
  clientId = null,
  signal = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let base = normalizeBaseUrl(baseUrl);
  if (!base) throw new ComfyApiError("config", "ComfyUI base URL is empty.");
  if (!workflow || typeof workflow !== "object")
    throw new ComfyApiError("config", "Workflow is missing.");
  let id =
    clientId ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "sol-" + Date.now() + "-" + Math.floor(Math.random() * 1e9));
  let body = await postJson(
    base + "/prompt",
    { prompt: workflow, client_id: id },
    { signal, timeoutMs },
  );
  if (body && body.node_errors && Object.keys(body.node_errors).length) {
    throw new ComfyApiError(
      "node-error",
      "ComfyUI rejected the workflow: " +
        JSON.stringify(body.node_errors).slice(0, 300),
    );
  }
  if (!body || !body.prompt_id)
    throw new ComfyApiError(
      "invalid-json",
      "ComfyUI did not return a prompt id.",
    );
  return { promptId: body.prompt_id, clientId: id };
}

// Poll GET {baseUrl}/history/{promptId} until the run completes.
// onProgress(state) is called with "queued" | "running" | "done".
// Resolves with the list of output images: [{ filename, subfolder, type }].
export async function pollHistory({
  baseUrl,
  promptId,
  onProgress = null,
  signal = null,
  timeoutMs = GENERATION_TIMEOUT_MS,
  intervalMs = POLL_INTERVAL_MS,
} = {}) {
  let base = normalizeBaseUrl(baseUrl);
  if (!base) throw new ComfyApiError("config", "ComfyUI base URL is empty.");
  if (!promptId) throw new ComfyApiError("config", "Prompt id is missing.");
  let combined = combinedSignal(timeoutMs, signal);
  let lastState = null;
  try {
    for (;;) {
      let entry;
      try {
        let history = await getJson(base + "/history/" + promptId, {
          signal: combined.signal,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
        entry = history && history[promptId];
      } catch (error) {
        if (error instanceof ComfyApiError && error.code === "aborted")
          throw error;
        // Transient failure while polling: keep waiting until the cap.
        await new Promise((resolve, reject) => {
          let timer = setTimeout(resolve, intervalMs);
          combined.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(combined.signal.reason);
            },
            { once: true },
          );
        });
        continue;
      }
      if (entry) {
        let status = entry.status || {};
        let state = status.completed ? "done" : "running";
        if (state !== lastState && onProgress) {
          lastState = state;
          onProgress(state);
        }
        if (status.completed) {
          let images = [];
          let outputs = entry.outputs || {};
          for (let nodeId of Object.keys(outputs)) {
            let list = outputs[nodeId].images || [];
            for (let img of list) {
              if (img && img.filename)
                images.push({
                  filename: img.filename,
                  subfolder: img.subfolder || "",
                  type: img.type || "output",
                });
            }
          }
          return images;
        }
      } else if (lastState !== "queued" && onProgress) {
        lastState = "queued";
        onProgress("queued");
      }
      await new Promise((resolve, reject) => {
        let timer = setTimeout(resolve, intervalMs);
        combined.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new ComfyApiError("aborted", "The request was stopped."));
          },
          { once: true },
        );
      });
    }
  } finally {
    combined.cleanup();
  }
}

// GET {baseUrl}/view?filename=... -> Blob of the finished image.
export async function fetchImage({
  baseUrl,
  filename,
  subfolder = "",
  type = "output",
  signal = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let base = normalizeBaseUrl(baseUrl);
  if (!base) throw new ComfyApiError("config", "ComfyUI base URL is empty.");
  if (!filename) throw new ComfyApiError("config", "Image filename is missing.");
  let params = new URLSearchParams({
    filename,
    subfolder: subfolder || "",
    type: type || "output",
  });
  let combined = combinedSignal(timeoutMs, signal);
  try {
    let response;
    try {
      response = await fetch(base + "/view?" + params.toString(), {
        signal: combined.signal,
      });
    } catch (error) {
      throw toRequestError(error, base);
    }
    if (!response.ok) throw await toHttpError(response);
    return await response.blob();
  } finally {
    combined.cleanup();
  }
}

// Full flow: submit -> poll -> download. Resolves with { blob, filename }.
// onProgress(step) is called with "sending" | "queued" | "sampling" | "decoding" | "loading".
export async function generateComfyImage({
  baseUrl,
  model,
  prompt,
  width,
  height,
  steps,
  seed = null,
  onProgress = null,
  signal = null,
  intervalMs = POLL_INTERVAL_MS,
} = {}) {
  let base = normalizeBaseUrl(baseUrl);
  if (!base) throw new ComfyApiError("config", "ComfyUI base URL is empty.");
  let report = (step) => {
    if (onProgress) onProgress(step);
  };
  report("sending");
  let workflow = buildWorkflow({ prompt, model, width, height, steps, seed });
  let { promptId } = await submitPrompt({
    baseUrl: base,
    workflow,
    signal,
  });
  let images = await pollHistory({
    baseUrl: base,
    promptId,
    onProgress: (state) => report(state === "done" ? "decoding" : "sampling"),
    signal,
    intervalMs,
  });
  if (!images.length)
    throw new ComfyApiError(
      "invalid-json",
      "ComfyUI finished but produced no images.",
    );
  report("loading");
  let first = images[0];
  let blob = await fetchImage({
    baseUrl: base,
    filename: first.filename,
    subfolder: first.subfolder,
    type: first.type,
    signal,
  });
  return { blob, filename: first.filename };
}

// GET {baseUrl}/system_stats -> { ok, version }. Lightweight reachability check.
export async function testComfyConnection({
  baseUrl,
  signal = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let base = normalizeBaseUrl(baseUrl);
  if (!base) throw new ComfyApiError("config", "ComfyUI base URL is empty.");
  let started = Date.now();
  let body = await getJson(base + "/system_stats", { signal, timeoutMs });
  let version =
    body && body.system && body.system.comfyui_version
      ? String(body.system.comfyui_version)
      : "";
  return { ok: true, version, latencyMs: Date.now() - started };
}
