import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ComfyApiError,
  buildWorkflow,
  submitPrompt,
  pollHistory,
  fetchImage,
  generateComfyImage,
  testComfyConnection,
} from "./comfyui.js";

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

describe("buildWorkflow", () => {
  it("builds the verified SDXL Lightning workflow with the prompt wired in", () => {
    let wf = buildWorkflow({
      prompt: "a fox",
      model: "DreamShaperXL_Lightning.safetensors",
      width: 1024,
      height: 1024,
      steps: 8,
      seed: 42,
    });
    expect(wf["4"].inputs.ckpt_name).toBe(
      "DreamShaperXL_Lightning.safetensors",
    );
    expect(wf["6"].inputs.text).toBe("a fox");
    expect(wf["6"].inputs.clip).toEqual(["4", 1]);
    expect(wf["3"].inputs.seed).toBe(42);
    expect(wf["3"].inputs.steps).toBe(8);
    expect(wf["3"].inputs.sampler_name).toBe("euler");
    expect(wf["5"].inputs.width).toBe(1024);
    expect(wf["9"].class_type).toBe("SaveImage");
  });

  it("rejects an empty prompt and an empty model", () => {
    expect(() =>
      buildWorkflow({ prompt: "  ", model: "m.safetensors" }),
    ).toThrowError(ComfyApiError);
    expect(() => buildWorkflow({ prompt: "x", model: "  " })).toThrowError(
      ComfyApiError,
    );
  });

  it("clamps dimensions and steps to sane minimums", () => {
    let wf = buildWorkflow({
      prompt: "x",
      model: "m.safetensors",
      width: 0,
      height: -5,
      steps: 0,
    });
    expect(wf["5"].inputs.width).toBe(1024);
    expect(wf["5"].inputs.height).toBe(64); // negative clamps to the 64px floor
    expect(wf["3"].inputs.steps).toBe(8);
  });
});

describe("submitPrompt", () => {
  it("posts the workflow to /prompt and returns the prompt id", async () => {
    let seen = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        seen = { url, body: JSON.parse(options.body) };
        return jsonResponse({ prompt_id: "abc-123", number: 1, node_errors: {} });
      }),
    );
    let result = await submitPrompt({
      baseUrl: "https://host:8188/",
      workflow: { 1: { class_type: "X" } },
    });
    expect(result.promptId).toBe("abc-123");
    expect(seen.url).toBe("https://host:8188/prompt");
    expect(seen.body.prompt).toEqual({ 1: { class_type: "X" } });
    expect(typeof seen.body.client_id).toBe("string");
  });

  it("throws node-error when ComfyUI rejects the workflow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          prompt_id: "x",
          node_errors: { 4: { errors: [{ message: "bad ckpt" }] } },
        }),
      ),
    );
    await expect(
      submitPrompt({ baseUrl: "https://host:8188", workflow: {} }),
    ).rejects.toMatchObject({ name: "ComfyApiError", code: "node-error" });
  });

  it("throws config when the base URL is empty", async () => {
    await expect(
      submitPrompt({ baseUrl: "", workflow: {} }),
    ).rejects.toMatchObject({ code: "config" });
  });
});

describe("pollHistory", () => {
  it("polls until completed and returns the output images", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        calls++;
        expect(url).toBe("https://host:8188/history/p1");
        if (calls === 1) return jsonResponse({});
        if (calls === 2)
          return jsonResponse({ p1: { status: { completed: false } } });
        return jsonResponse({
          p1: {
            status: { completed: true },
            outputs: {
              9: {
                images: [
                  {
                    filename: "sol_imagine_00001_.png",
                    subfolder: "",
                    type: "output",
                  },
                ],
              },
            },
          },
        });
      }),
    );
    let states = [];
    let images = await pollHistory({
      baseUrl: "https://host:8188",
      promptId: "p1",
      onProgress: (s) => states.push(s),
      intervalMs: 1,
    });
    expect(images).toEqual([
      { filename: "sol_imagine_00001_.png", subfolder: "", type: "output" },
    ]);
    expect(states).toContain("queued");
    expect(states).toContain("running");
    expect(calls).toBe(3);
  });
});

describe("fetchImage", () => {
  it("downloads from /view with the right query params", async () => {
    let seen = {};
    let blob = new Blob(["fake-png"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        seen.url = url;
        return { ok: true, status: 200, blob: async () => blob };
      }),
    );
    let out = await fetchImage({
      baseUrl: "https://host:8188/",
      filename: "sol_imagine_00001_.png",
      subfolder: "",
      type: "output",
    });
    expect(out).toBe(blob);
    expect(seen.url).toBe(
      "https://host:8188/view?filename=sol_imagine_00001_.png&subfolder=&type=output",
    );
  });
});

describe("generateComfyImage", () => {
  it("runs the full flow and reports progress steps", async () => {
    let blob = new Blob(["png"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/prompt"))
          return jsonResponse({ prompt_id: "p9", node_errors: {} });
        if (url.includes("/history/"))
          return jsonResponse({
            p9: {
              status: { completed: true },
              outputs: {
                9: { images: [{ filename: "a.png", subfolder: "", type: "output" }] },
              },
            },
          });
        return { ok: true, status: 200, blob: async () => blob };
      }),
    );
    let steps = [];
    let result = await generateComfyImage({
      baseUrl: "https://host:8188",
      model: "DreamShaperXL_Lightning.safetensors",
      prompt: "a fox",
      onProgress: (s) => steps.push(s),
      intervalMs: 1,
    });
    expect(result.blob).toBe(blob);
    expect(result.filename).toBe("a.png");
    expect(steps[0]).toBe("sending");
    expect(steps).toContain("decoding");
    expect(steps[steps.length - 1]).toBe("loading");
  });
});

describe("testComfyConnection", () => {
  it("reads the version from /system_stats", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        expect(url).toBe("https://host:8188/system_stats");
        return jsonResponse({ system: { comfyui_version: "0.35.0" } });
      }),
    );
    let result = await testComfyConnection({ baseUrl: "https://host:8188/" });
    expect(result.ok).toBe(true);
    expect(result.version).toBe("0.35.0");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("maps a network failure to a helpful network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(
      testComfyConnection({ baseUrl: "https://host:8188" }),
    ).rejects.toMatchObject({ code: "network" });
  });
});
